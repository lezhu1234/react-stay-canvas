import type { InstantShape } from "../../shapes/instantShape"
import type { DrawCanvasContext } from "../../types/canvas"
import type { PointType } from "../../types/geometry"
import type { ProjectiveMatrix2D } from "../../types/transform"
import type {
  ProjectiveMesh,
  ProjectiveRenderProjection,
} from "./renderPlan"
import {
  positiveFinite,
  positiveInteger,
  rasterizeProjectiveShape,
  resolveProjectiveRasterSpec,
} from "./projectiveRaster"

interface ProjectiveDrawProps {
  readonly context: DrawCanvasContext
  readonly shape: InstantShape
  readonly projection: ProjectiveRenderProjection
  readonly mesh: ProjectiveMesh
  readonly rasterScale: number
  readonly now: number
  readonly width: number
  readonly height: number
  readonly forceDraw?: boolean
}

function rasterizeShape({
  context: target,
  shape,
  projection,
  rasterScale,
  now,
  width,
  height,
  forceDraw,
}: ProjectiveDrawProps) {
  const spec = resolveProjectiveRasterSpec(projection.mapping, rasterScale)
  return rasterizeProjectiveShape({
    targetCanvas: target.canvas,
    shape,
    mapping: projection.mapping,
    spec,
    now,
    width,
    height,
    forceDraw,
  })
}

function projectPoint(
  matrix: Readonly<ProjectiveMatrix2D>,
  point: Readonly<PointType>
) {
  const x = matrix.m00 * point.x + matrix.m01 * point.y + matrix.m02
  const y = matrix.m10 * point.x + matrix.m11 * point.y + matrix.m12
  const denominator = matrix.m20 * point.x + matrix.m21 * point.y + matrix.m22
  const projected = { x: x / denominator, y: y / denominator }
  if (Number.isFinite(projected.x) && Number.isFinite(projected.y)) return projected

  const pointScale = Math.max(1, Math.abs(point.x), Math.abs(point.y))
  const matrixScale = Math.max(
    Math.abs(matrix.m00), Math.abs(matrix.m01), Math.abs(matrix.m02),
    Math.abs(matrix.m10), Math.abs(matrix.m11), Math.abs(matrix.m12),
    Math.abs(matrix.m20), Math.abs(matrix.m21), Math.abs(matrix.m22)
  )
  const localX = point.x / pointScale
  const localY = point.y / pointScale
  const constant = 1 / pointScale
  const scaledX = matrix.m00 / matrixScale * localX +
    matrix.m01 / matrixScale * localY + matrix.m02 / matrixScale * constant
  const scaledY = matrix.m10 / matrixScale * localX +
    matrix.m11 / matrixScale * localY + matrix.m12 / matrixScale * constant
  const scaledDenominator = matrix.m20 / matrixScale * localX +
    matrix.m21 / matrixScale * localY + matrix.m22 / matrixScale * constant
  const fallback = {
    x: scaledX / scaledDenominator,
    y: scaledY / scaledDenominator,
  }
  if (!Number.isFinite(fallback.x) || !Number.isFinite(fallback.y)) {
    throw new RangeError("projective mesh point must have a finite projection")
  }
  return fallback
}

function applyTriangleTransform(
  context: DrawCanvasContext,
  source: readonly [PointType, PointType, PointType],
  target: readonly [PointType, PointType, PointType]
) {
  const [s0, s1, s2] = source
  const [t0, t1, t2] = target
  const determinant = s0.x * (s1.y - s2.y) +
    s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y)
  if (!Number.isFinite(determinant) || determinant === 0) {
    throw new RangeError("projective source mesh triangle must be non-degenerate")
  }
  const a = (t0.x * (s1.y - s2.y) + t1.x * (s2.y - s0.y) +
    t2.x * (s0.y - s1.y)) / determinant
  const c = (t0.x * (s2.x - s1.x) + t1.x * (s0.x - s2.x) +
    t2.x * (s1.x - s0.x)) / determinant
  const e = (t0.x * (s1.x * s2.y - s2.x * s1.y) +
    t1.x * (s2.x * s0.y - s0.x * s2.y) +
    t2.x * (s0.x * s1.y - s1.x * s0.y)) / determinant
  const b = (t0.y * (s1.y - s2.y) + t1.y * (s2.y - s0.y) +
    t2.y * (s0.y - s1.y)) / determinant
  const d = (t0.y * (s2.x - s1.x) + t1.y * (s0.x - s2.x) +
    t2.y * (s1.x - s0.x)) / determinant
  const f = (t0.y * (s1.x * s2.y - s2.x * s1.y) +
    t1.y * (s2.x * s0.y - s0.x * s2.y) +
    t2.y * (s0.x * s1.y - s1.x * s0.y)) / determinant
  if ([a, b, c, d, e, f].some((value) => !Number.isFinite(value))) {
    throw new RangeError("projective target mesh triangle must be non-degenerate")
  }
  context.transform(a, b, c, d, e, f)
}

function drawTriangle(
  context: DrawCanvasContext,
  surface: CanvasImageSource,
  source: readonly [PointType, PointType, PointType],
  target: readonly [PointType, PointType, PointType]
) {
  context.save()
  try {
    context.beginPath()
    context.moveTo(target[0].x, target[0].y)
    context.lineTo(target[1].x, target[1].y)
    context.lineTo(target[2].x, target[2].y)
    context.closePath()
    context.clip()
    context.globalCompositeOperation = "source-over"
    applyTriangleTransform(context, source, target)
    context.drawImage(surface, 0, 0)
  } finally {
    context.restore()
  }
}

function drawProjectedMesh(
  context: DrawCanvasContext,
  surface: CanvasImageSource,
  projection: ProjectiveRenderProjection,
  mesh: ProjectiveMesh,
  rasterScale: number
) {
  // Mesh density is deliberately supplied by the render caller. Canvas2D only
  // performs the requested affine triangle approximation; it does not invent a
  // viewport- or backend-specific projective error tolerance.
  const columns = positiveInteger(mesh.columns, "projective mesh columns")
  const rows = positiveInteger(mesh.rows, "projective mesh rows")
  const { localDomain, localToContent } = projection.mapping
  const localPoint = (column: number, row: number) => ({
    x: localDomain.x + localDomain.width * column / columns,
    y: localDomain.y + localDomain.height * row / rows,
  })
  const sourcePoint = (point: PointType) => ({
    x: (point.x - localDomain.x) * rasterScale,
    y: (point.y - localDomain.y) * rasterScale,
  })
  const vertices = Array.from({ length: rows + 1 }, (_, row) =>
    Array.from({ length: columns + 1 }, (_, column) => {
      const local = localPoint(column, row)
      return {
        source: sourcePoint(local),
        target: projectPoint(localToContent, local),
      }
    })
  )

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const topLeft = vertices[row][column]
      const topRight = vertices[row][column + 1]
      const bottomRight = vertices[row + 1][column + 1]
      const bottomLeft = vertices[row + 1][column]

      drawTriangle(
        context,
        surface,
        [topLeft.source, topRight.source, bottomRight.source],
        [topLeft.target, topRight.target, bottomRight.target]
      )
      drawTriangle(
        context,
        surface,
        [topLeft.source, bottomRight.source, bottomLeft.source],
        [topLeft.target, bottomRight.target, bottomLeft.target]
      )
    }
  }
}

export function executeCanvas2DProjectiveItem(props: ProjectiveDrawProps) {
  const rasterScale = positiveFinite(props.rasterScale, "projective raster scale")
  positiveInteger(props.mesh.columns, "projective mesh columns")
  positiveInteger(props.mesh.rows, "projective mesh rows")
  const surface = rasterizeShape({ ...props, rasterScale })
  drawProjectedMesh(
    props.context,
    surface,
    props.projection,
    props.mesh,
    rasterScale
  )
}

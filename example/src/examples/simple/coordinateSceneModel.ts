import {
  PerspectiveCamera,
  projectivePlacementFromQuad,
  type ChildPlacement,
  type Coordinate,
  type MeshColor,
  type MeshGeometryInput,
  type Rect,
  type Vector3,
} from "react-stay-canvas"

import { rgba } from "../../components/DemoKit"
import type { LineSegment } from "./coordinateLabModel"

export const PLANE_ASPECT_RATIO = 4 / 3
export const PLANE_GRID_COLUMNS = 6
export const PLANE_GRID_ROWS = 5

const PLANE_NEAR_SCALE = 1.32
const PLANE_FAR_SCALE = 1.08
const PLANE_WIDTH_SCALES = [1.08, 0.96, 0.96] as const
const CAMERA_FIELD_OF_VIEW = Math.PI / 3
const CAMERA_NEAR_DEPTH = 4.5
const CAMERA_FAR_DEPTH = CAMERA_NEAR_DEPTH * PLANE_NEAR_SCALE / PLANE_FAR_SCALE

export type PlaneName = "client" | "view" | "content"
export type PlaneRange = { x: number; y: number; width: number; height: number }
export type QuadPoints = [Coordinate, Coordinate, Coordinate, Coordinate]

export type PlaneDefinition = {
  width: number
  height: number
  labelX: number
  labelY: number
  placement: ChildPlacement
  fill: ReturnType<typeof rgba>
  stroke: ReturnType<typeof rgba>
}

export type PlaneBasis = {
  origin: Vector3
  horizontal: Vector3
  vertical: Vector3
  normal: Vector3
}

export const planePalette = {
  client: {
    fill: rgba(111, 190, 229, 0.045),
    stroke: rgba(74, 163, 214, 0.68),
  },
  view: {
    fill: rgba(132, 186, 103, 0.055),
    stroke: rgba(70, 143, 77, 0.72),
  },
  content: {
    fill: rgba(166, 137, 216, 0.05),
    stroke: rgba(137, 105, 197, 0.68),
  },
} as const

export function createCoordinateCamera() {
  return new PerspectiveCamera({
    position: [0, 0, 0],
    target: [0, 0, -1],
    verticalFieldOfView: CAMERA_FIELD_OF_VIEW,
    near: 0.1,
    far: 20,
  })
}

export function pointsForRect(rect: Readonly<Rect>): QuadPoints {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ]
}

export function createPlaneDefinitions(
  width: number,
  height: number,
): Record<PlaneName, PlaneDefinition> {
  const horizontalPadding = Math.max(10, width * 0.02)
  const gaps = [Math.max(12, width * 0.075), Math.max(12, width * 0.09)] as const
  const labelSpace = Math.max(28, Math.min(44, height * 0.18))
  const bottomPadding = Math.max(8, height * 0.08)
  const minimumBlockTop = 4
  const widthScaleTotal = PLANE_WIDTH_SCALES.reduce((total, scale) => total + scale, 0)
  const widthBound = (width - horizontalPadding * 2 - gaps[0] - gaps[1]) / widthScaleTotal
  const projectedHeightSpace = Math.max(1, height - labelSpace - bottomPadding - minimumBlockTop)
  const heightBound = projectedHeightSpace * PLANE_ASPECT_RATIO
    / PLANE_NEAR_SCALE / PLANE_WIDTH_SCALES[0]
  const baseWidth = Math.max(1, Math.min(widthBound, heightBound))
  const planeWidths = PLANE_WIDTH_SCALES.map((scale) => baseWidth * scale)
  const planeHeight = planeWidths[0] / PLANE_ASPECT_RATIO
  const groupWidth = planeWidths.reduce((total, planeWidth) => total + planeWidth, 0)
    + gaps[0] + gaps[1]
  const startX = (width - groupWidth) / 2
  const desiredVerticalSpace = height - labelSpace - planeHeight - bottomPadding
  const maximumBlockTop = height
    - labelSpace
    - planeHeight * PLANE_NEAR_SCALE
    - bottomPadding
  const blockTop = Math.max(
    minimumBlockTop,
    Math.min(desiredVerticalSpace * 0.67, maximumBlockTop),
  )
  const visualPlaneTop = blockTop + labelSpace
  const labelY = visualPlaneTop - Math.min(38, labelSpace * 0.9)

  const definition = (name: PlaneName, index: number): PlaneDefinition => {
    const planeWidth = planeWidths[index]
    const x = startX
      + planeWidths.slice(0, index).reduce((total, value) => total + value, 0)
      + gaps.slice(0, index).reduce((total, value) => total + value, 0)
    const nearTop = visualPlaneTop
    const farTop = visualPlaneTop
      + planeHeight * (PLANE_NEAR_SCALE - PLANE_FAR_SCALE) / 2
    const farBottom = farTop + planeHeight * PLANE_FAR_SCALE
    const nearBottom = nearTop + planeHeight * PLANE_NEAR_SCALE
    return {
      width: planeWidth,
      height: planeHeight,
      labelX: x,
      labelY,
      placement: projectivePlacementFromQuad(
        { x: 0, y: 0, width: planeWidth, height: planeHeight },
        {
          topLeft: { x, y: nearTop },
          topRight: { x: x + planeWidth, y: farTop },
          bottomRight: { x: x + planeWidth, y: farBottom },
          bottomLeft: { x, y: nearBottom },
        },
      ),
      ...planePalette[name],
    }
  }

  return {
    client: definition("client", 0),
    view: definition("view", 1),
    content: definition("content", 2),
  }
}

export function expandRangeToAspect(range: Readonly<PlaneRange>, aspect: number): PlaneRange {
  const width = Math.max(1, range.width)
  const height = Math.max(1, range.height)
  const currentAspect = width / height
  if (Math.abs(currentAspect - aspect) < 0.0001) return { ...range, width, height }
  if (currentAspect < aspect) {
    const expandedWidth = height * aspect
    return { x: range.x - (expandedWidth - width) / 2, y: range.y, width: expandedWidth, height }
  }
  const expandedHeight = width / aspect
  return { x: range.x, y: range.y - (expandedHeight - height) / 2, width, height: expandedHeight }
}

export function projectPlanePoint(
  plane: PlaneDefinition,
  point: Readonly<Coordinate>,
): Coordinate {
  if (plane.placement.type !== "projective") {
    throw new Error("coordinate plane placement must remain projective")
  }
  const matrix = plane.placement.matrix
  const denominator = matrix.m20 * point.x + matrix.m21 * point.y + matrix.m22
  if (!Number.isFinite(denominator) || denominator === 0) {
    throw new RangeError("coordinate plane point must have a finite projection")
  }
  return {
    x: (matrix.m00 * point.x + matrix.m01 * point.y + matrix.m02) / denominator,
    y: (matrix.m10 * point.x + matrix.m11 * point.y + matrix.m12) / denominator,
  }
}

function worldPointFromCanvas(
  point: Readonly<Coordinate>,
  depth: number,
  canvasWidth: number,
  canvasHeight: number,
): Vector3 {
  const normalizedX = point.x / canvasWidth * 2 - 1
  const normalizedY = 1 - point.y / canvasHeight * 2
  const halfHeight = depth * Math.tan(CAMERA_FIELD_OF_VIEW / 2)
  return [
    normalizedX * halfHeight * canvasWidth / canvasHeight,
    normalizedY * halfHeight,
    -depth,
  ]
}

export function createPlaneBasis(
  plane: PlaneDefinition,
  canvasWidth: number,
  canvasHeight: number,
): PlaneBasis {
  const topLeft = projectPlanePoint(plane, { x: 0, y: 0 })
  const topRight = projectPlanePoint(plane, { x: plane.width, y: 0 })
  const bottomLeft = projectPlanePoint(plane, { x: 0, y: plane.height })
  const origin = worldPointFromCanvas(topLeft, CAMERA_NEAR_DEPTH, canvasWidth, canvasHeight)
  const right = worldPointFromCanvas(topRight, CAMERA_FAR_DEPTH, canvasWidth, canvasHeight)
  const bottom = worldPointFromCanvas(bottomLeft, CAMERA_NEAR_DEPTH, canvasWidth, canvasHeight)
  const horizontal: Vector3 = [right[0] - origin[0], right[1] - origin[1], right[2] - origin[2]]
  const vertical: Vector3 = [bottom[0] - origin[0], bottom[1] - origin[1], bottom[2] - origin[2]]
  const normal: Vector3 = [
    horizontal[1] * vertical[2] - horizontal[2] * vertical[1],
    horizontal[2] * vertical[0] - horizontal[0] * vertical[2],
    horizontal[0] * vertical[1] - horizontal[1] * vertical[0],
  ]
  const normalLength = Math.hypot(...normal)
  return {
    origin,
    horizontal,
    vertical,
    normal: [normal[0] / normalLength, normal[1] / normalLength, normal[2] / normalLength],
  }
}

export function backdropMeshGeometry(
  canvasWidth: number,
  canvasHeight: number,
  depth = 6.25,
): MeshGeometryInput {
  const points = [
    worldPointFromCanvas({ x: 0, y: 0 }, depth, canvasWidth, canvasHeight),
    worldPointFromCanvas({ x: canvasWidth, y: 0 }, depth, canvasWidth, canvasHeight),
    worldPointFromCanvas({ x: canvasWidth, y: canvasHeight }, depth, canvasWidth, canvasHeight),
    worldPointFromCanvas({ x: 0, y: canvasHeight }, depth, canvasWidth, canvasHeight),
  ]
  const builder: GeometryBuilder = { positions: [], normals: [], indices: [] }
  appendQuad(builder, points, [0, 0, 1])
  return builder
}

export function planeWorldPoint(
  plane: PlaneDefinition,
  basis: PlaneBasis,
  point: Readonly<Coordinate>,
  depthOffset = 0,
): Vector3 {
  const horizontal = point.x / plane.width
  const vertical = point.y / plane.height
  return [
    basis.origin[0] + basis.horizontal[0] * horizontal + basis.vertical[0] * vertical,
    basis.origin[1] + basis.horizontal[1] * horizontal + basis.vertical[1] * vertical,
    basis.origin[2] + basis.horizontal[2] * horizontal + basis.vertical[2] * vertical + depthOffset,
  ]
}

type GeometryBuilder = {
  positions: number[]
  normals: number[]
  indices: number[]
}

function appendQuad(
  builder: GeometryBuilder,
  points: readonly Vector3[],
  normal: Vector3,
) {
  const offset = builder.positions.length / 3
  points.forEach((point) => builder.positions.push(...point))
  points.forEach(() => builder.normals.push(...normal))
  builder.indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3)
}

function appendPlaneQuad(
  builder: GeometryBuilder,
  plane: PlaneDefinition,
  basis: PlaneBasis,
  points: QuadPoints,
  depthOffset: number,
) {
  appendQuad(
    builder,
    points.map((point) => planeWorldPoint(plane, basis, point, depthOffset)),
    basis.normal,
  )
}

function segmentQuad(segment: Readonly<LineSegment>, width: number): QuadPoints | undefined {
  const deltaX = segment.x2 - segment.x1
  const deltaY = segment.y2 - segment.y1
  const length = Math.hypot(deltaX, deltaY)
  if (length === 0) return undefined
  const normalX = -deltaY / length * width / 2
  const normalY = deltaX / length * width / 2
  return [
    { x: segment.x1 + normalX, y: segment.y1 + normalY },
    { x: segment.x2 + normalX, y: segment.y2 + normalY },
    { x: segment.x2 - normalX, y: segment.y2 - normalY },
    { x: segment.x1 - normalX, y: segment.y1 - normalY },
  ]
}

export function rectMeshGeometry(
  plane: PlaneDefinition,
  basis: PlaneBasis,
  rect: Readonly<Rect> | undefined,
  depthOffset: number,
): MeshGeometryInput {
  if (!rect || rect.width <= 0 || rect.height <= 0) return emptyMeshGeometry()
  const builder: GeometryBuilder = { positions: [], normals: [], indices: [] }
  appendPlaneQuad(builder, plane, basis, pointsForRect(rect), depthOffset)
  return builder
}

export function lineMeshGeometry(
  plane: PlaneDefinition,
  basis: PlaneBasis,
  segments: readonly (LineSegment | undefined)[],
  width: number,
  depthOffset: number,
): MeshGeometryInput {
  const builder: GeometryBuilder = { positions: [], normals: [], indices: [] }
  segments.forEach((segment) => {
    if (!segment) return
    const quad = segmentQuad(segment, width)
    if (quad) appendPlaneQuad(builder, plane, basis, quad, depthOffset)
  })
  return builder.indices.length > 0 ? builder : emptyMeshGeometry()
}

export function dashedSegments(
  segment: Readonly<LineSegment>,
  dash: number,
  gap: number,
): LineSegment[] {
  const deltaX = segment.x2 - segment.x1
  const deltaY = segment.y2 - segment.y1
  const length = Math.hypot(deltaX, deltaY)
  if (length === 0) return []
  const segments: LineSegment[] = []
  for (let start = 0; start < length; start += dash + gap) {
    const end = Math.min(length, start + dash)
    segments.push({
      x1: segment.x1 + deltaX * start / length,
      y1: segment.y1 + deltaY * start / length,
      x2: segment.x1 + deltaX * end / length,
      y2: segment.y1 + deltaY * end / length,
    })
  }
  return segments
}

export function emptyMeshGeometry(): MeshGeometryInput {
  return {
    positions: [0, 0, -100, 0, 0, -100, 0, 0, -100],
    indices: [0, 1, 2],
  }
}

export function meshColor(color: ReturnType<typeof rgba>): MeshColor {
  return [
    1 - (1 - color.r / 255) * color.a,
    1 - (1 - color.g / 255) * color.a,
    1 - (1 - color.b / 255) * color.a,
    1,
  ]
}

export function transparentMeshColor(color: ReturnType<typeof rgba>): MeshColor {
  return [color.r / 255, color.g / 255, color.b / 255, color.a]
}

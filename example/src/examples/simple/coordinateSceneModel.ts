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

export const PLANE_GRID_COLUMNS = 6
export const PLANE_GRID_ROWS = 5

const CAMERA_FIELD_OF_VIEW = Math.PI / 3.4
const CAMERA_POSITION_X = 4.2
const COMPACT_GROUND_HEIGHT = -2.4
const EXPANDED_GROUND_HEIGHT = -2.1
const EXPANDED_LAYOUT_SCALE = 0.818
const COMPACT_PANEL_HEIGHT_TRIM = 0.75
const BEVEL_FACE_CORNER_RATIO = 0.28
const PANEL_LAYOUT = [
  { centerX: -3.39, depth: 7.6, worldWidth: 4.34, worldHeight: 6.4, yaw: 0.04, logicalScale: 1, verticalOffset: 0 },
  { centerX: 1.09, depth: 8.8, worldWidth: 4.34, worldHeight: 6.4, yaw: 0.08, logicalScale: 1, verticalOffset: 0.38 },
  { centerX: 6.13, depth: 10.2, worldWidth: 4.34, worldHeight: 6.4, yaw: 0.12, logicalScale: 1, verticalOffset: 0.37 },
] as const

export type PlaneName = "client" | "view" | "content"
export type PlaneRange = { x: number; y: number; width: number; height: number }
export type QuadPoints = [Coordinate, Coordinate, Coordinate, Coordinate]

export type PlaneDefinition = {
  width: number
  height: number
  labelX: number
  labelY: number
  placement: ChildPlacement
  worldQuad: readonly [Vector3, Vector3, Vector3, Vector3]
  fill: ReturnType<typeof rgba>
  stroke: ReturnType<typeof rgba>
}

export type PlaneBasis = {
  origin: Vector3
  horizontal: Vector3
  vertical: Vector3
  normal: Vector3
}

export type PlaneBevelFaceProfile = {
  rect: Rect
  radiusX: number
  radiusY: number
}

function progressBetween(value: number, start: number, end: number) {
  return Math.min(1, Math.max(0, (value - start) / (end - start)))
}

export const planePalette = {
  client: {
    fill: rgba(90, 190, 236, 0.14),
    stroke: rgba(77, 178, 224, 0.9),
  },
  view: {
    fill: rgba(72, 114, 235, 0.15),
    stroke: rgba(67, 112, 230, 0.92),
  },
  content: {
    fill: rgba(51, 180, 121, 0.14),
    stroke: rgba(45, 151, 108, 0.92),
  },
} as const

export function createCoordinateCamera() {
  return new PerspectiveCamera({
    position: [CAMERA_POSITION_X, 0, 0],
    target: [CAMERA_POSITION_X, 0, -1],
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
  const logicalBaseWidth = Math.max(120, Math.min(280, height * 0.58))
  const aspect = width / Math.max(1, height)
  const halfFieldHeight = Math.tan(CAMERA_FIELD_OF_VIEW / 2)
  const panelStageScale = Math.min(1.08, 1 + Math.max(0, height - 80) / 800)
  const stageExpansion = Math.min(
    progressBetween(width, 1250, 1390),
    progressBetween(height, 439, 453),
  )
  const layoutScale = 1 + (EXPANDED_LAYOUT_SCALE - 1) * stageExpansion
  const groundHeight = COMPACT_GROUND_HEIGHT
    + (EXPANDED_GROUND_HEIGHT - COMPACT_GROUND_HEIGHT) * stageExpansion

  const projectWorldPoint = (point: Vector3): Coordinate => {
    const depth = -point[2]
    return {
      x: ((point[0] - CAMERA_POSITION_X) / (depth * halfFieldHeight * aspect) + 1) * width / 2,
      y: (1 - point[1] / (depth * halfFieldHeight)) * height / 2,
    }
  }

  const panelWorldQuad = ({
    centerX,
    depth,
    worldWidth,
    worldHeight,
    yaw,
    verticalOffset,
  }: typeof PANEL_LAYOUT[number]): [Vector3, Vector3, Vector3, Vector3] => {
    const horizontal: Vector3 = [Math.cos(yaw), 0, -Math.sin(yaw)]
    const scaledCenterX = CAMERA_POSITION_X + (centerX - CAMERA_POSITION_X) * layoutScale
    const halfWidth = worldWidth * panelStageScale * layoutScale / 2
    const scaledHeight = worldHeight * panelStageScale * layoutScale
      - COMPACT_PANEL_HEIGHT_TRIM * (1 - stageExpansion)
    const bottomHeight = groundHeight + verticalOffset
    const leftBottom: Vector3 = [
      scaledCenterX - horizontal[0] * halfWidth,
      bottomHeight,
      -depth - horizontal[2] * halfWidth,
    ]
    const rightBottom: Vector3 = [
      scaledCenterX + horizontal[0] * halfWidth,
      bottomHeight,
      -depth + horizontal[2] * halfWidth,
    ]
    return [
      [leftBottom[0], bottomHeight + scaledHeight, leftBottom[2]],
      [rightBottom[0], bottomHeight + scaledHeight, rightBottom[2]],
      rightBottom,
      leftBottom,
    ]
  }

  const definition = (name: PlaneName, index: number): PlaneDefinition => {
    const layout = PANEL_LAYOUT[index]
    const planeWidth = logicalBaseWidth * layout.logicalScale
    const worldQuad = panelWorldQuad(layout)
    const worldWidth = Math.hypot(
      worldQuad[1][0] - worldQuad[0][0],
      worldQuad[1][1] - worldQuad[0][1],
      worldQuad[1][2] - worldQuad[0][2],
    )
    const worldHeight = Math.hypot(
      worldQuad[3][0] - worldQuad[0][0],
      worldQuad[3][1] - worldQuad[0][1],
      worldQuad[3][2] - worldQuad[0][2],
    )
    const planeHeight = planeWidth * worldHeight / worldWidth
    const [topLeft, topRight, bottomRight, bottomLeft] = worldQuad.map(projectWorldPoint) as QuadPoints
    return {
      width: planeWidth,
      height: planeHeight,
      labelX: (topLeft.x + topRight.x) / 2,
      labelY: Math.min(topLeft.y, topRight.y) + Math.max(18, height * 0.04),
      placement: projectivePlacementFromQuad(
        { x: 0, y: 0, width: planeWidth, height: planeHeight },
        { topLeft, topRight, bottomRight, bottomLeft },
      ),
      worldQuad,
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

export function createPlaneBasis(plane: PlaneDefinition): PlaneBasis {
  const [origin, right, , bottom] = plane.worldQuad
  const horizontal: Vector3 = [right[0] - origin[0], right[1] - origin[1], right[2] - origin[2]]
  const vertical: Vector3 = [bottom[0] - origin[0], bottom[1] - origin[1], bottom[2] - origin[2]]
  const normal: Vector3 = [
    vertical[1] * horizontal[2] - vertical[2] * horizontal[1],
    vertical[2] * horizontal[0] - vertical[0] * horizontal[2],
    vertical[0] * horizontal[1] - vertical[1] * horizontal[0],
  ]
  const normalLength = Math.hypot(...normal)
  return {
    origin,
    horizontal,
    vertical,
    normal: [normal[0] / normalLength, normal[1] / normalLength, normal[2] / normalLength],
  }
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
    basis.origin[0] + basis.horizontal[0] * horizontal + basis.vertical[0] * vertical
      + basis.normal[0] * depthOffset,
    basis.origin[1] + basis.horizontal[1] * horizontal + basis.vertical[1] * vertical
      + basis.normal[1] * depthOffset,
    basis.origin[2] + basis.horizontal[2] * horizontal + basis.vertical[2] * vertical
      + basis.normal[2] * depthOffset,
  ]
}

export function worldLineMeshGeometry(
  start: Readonly<Vector3>,
  end: Readonly<Vector3>,
  width: number,
): MeshGeometryInput {
  if (!Number.isFinite(width) || width <= 0) {
    throw new RangeError("world line width must be a positive finite number")
  }
  const deltaX = end[0] - start[0]
  const deltaY = end[1] - start[1]
  const screenPlaneLength = Math.hypot(deltaX, deltaY)
  if (screenPlaneLength < 1e-8) return emptyMeshGeometry()
  const halfWidth = width / 2
  const perpendicularX = deltaY / screenPlaneLength * halfWidth
  const perpendicularY = -deltaX / screenPlaneLength * halfWidth
  const offset = (point: Readonly<Vector3>, direction: 1 | -1): Vector3 => [
    point[0] + perpendicularX * direction,
    point[1] + perpendicularY * direction,
    point[2],
  ]
  const builder: GeometryBuilder = { positions: [], normals: [], indices: [] }
  appendQuadWithComputedNormal(builder, [
    offset(start, 1),
    offset(end, 1),
    offset(end, -1),
    offset(start, -1),
  ])
  return builder
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

function appendQuadWithComputedNormal(
  builder: GeometryBuilder,
  points: readonly [Vector3, Vector3, Vector3, Vector3],
) {
  const first = points[0]
  const along = points[1].map((value, index) => value - first[index]) as [number, number, number]
  const across = points[3].map((value, index) => value - first[index]) as [number, number, number]
  const normal: Vector3 = [
    along[1] * across[2] - along[2] * across[1],
    along[2] * across[0] - along[0] * across[2],
    along[0] * across[1] - along[1] * across[0],
  ]
  const length = Math.hypot(...normal)
  appendQuad(builder, points, [normal[0] / length, normal[1] / length, normal[2] / length])
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
    [points[0], points[3], points[2], points[1]]
      .map((point) => planeWorldPoint(plane, basis, point, depthOffset)),
    basis.normal,
  )
}

function roundedRectPoints(
  rect: Readonly<Rect>,
  radiusX: number,
  radiusY: number,
  segments: number,
): Coordinate[] {
  if (!Number.isInteger(segments) || segments < 1) {
    throw new RangeError("rounded rectangle segments must be a positive integer")
  }
  if (
    !Number.isFinite(radiusX)
    || !Number.isFinite(radiusY)
    || radiusX <= 0
    || radiusY <= 0
    || radiusX > rect.width / 2
    || radiusY > rect.height / 2
  ) {
    throw new RangeError("rounded rectangle radii must fit inside its bounds")
  }
  const corners = [
    { x: rect.x + rect.width - radiusX, y: rect.y + radiusY, start: -Math.PI / 2 },
    { x: rect.x + rect.width - radiusX, y: rect.y + rect.height - radiusY, start: 0 },
    { x: rect.x + radiusX, y: rect.y + rect.height - radiusY, start: Math.PI / 2 },
    { x: rect.x + radiusX, y: rect.y + radiusY, start: Math.PI },
  ]
  return corners.flatMap((corner) =>
    Array.from({ length: segments + 1 }, (_, index) => {
      const angle = corner.start + Math.PI / 2 * index / segments
      return {
        x: corner.x + Math.cos(angle) * radiusX,
        y: corner.y + Math.sin(angle) * radiusY,
      }
    }))
}

export function createPlaneBevelFaceProfile(
  plane: PlaneDefinition,
  basis: PlaneBasis,
  bevelRadius: number,
): PlaneBevelFaceProfile {
  const insetX = bevelRadius / Math.hypot(...basis.horizontal) * plane.width
  const insetY = bevelRadius / Math.hypot(...basis.vertical) * plane.height
  return {
    rect: {
      x: insetX,
      y: insetY,
      width: plane.width - insetX * 2,
      height: plane.height - insetY * 2,
    },
    radiusX: insetX * BEVEL_FACE_CORNER_RATIO,
    radiusY: insetY * BEVEL_FACE_CORNER_RATIO,
  }
}

export function roundedRectMeshGeometry(
  plane: PlaneDefinition,
  basis: PlaneBasis,
  rect: Readonly<Rect>,
  radiusX: number,
  radiusY: number,
  segments: number,
  depthOffset: number,
): MeshGeometryInput {
  const perimeter = roundedRectPoints(rect, radiusX, radiusY, segments)
  const center = planeWorldPoint(plane, basis, {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  }, depthOffset)
  const builder: GeometryBuilder = { positions: [...center], normals: [...basis.normal], indices: [] }
  perimeter.forEach((point) => {
    builder.positions.push(...planeWorldPoint(plane, basis, point, depthOffset))
    builder.normals.push(...basis.normal)
  })
  perimeter.forEach((_, index) => {
    const next = (index + 1) % perimeter.length
    builder.indices.push(0, next + 1, index + 1)
  })
  return builder
}

function appendConnectedRings(
  builder: GeometryBuilder,
  inner: readonly Vector3[],
  outer: readonly Vector3[],
) {
  for (let edge = 0; edge < inner.length; edge++) {
    const next = (edge + 1) % inner.length
    appendQuadWithComputedNormal(builder, [
      outer[next],
      outer[edge],
      inner[edge],
      inner[next],
    ])
  }
}

function roundedPlaneVolumeGeometry(
  plane: PlaneDefinition,
  basis: PlaneBasis,
  thickness: number,
  bevelRadius: number,
  bevelSegments: number,
): MeshGeometryInput {
  const builder: GeometryBuilder = { positions: [], normals: [], indices: [] }
  const horizontalLength = Math.hypot(...basis.horizontal)
  const verticalLength = Math.hypot(...basis.vertical)
  const depthRadius = Math.min(bevelRadius, thickness / 2)
  const face = createPlaneBevelFaceProfile(plane, basis, bevelRadius)
  const shoulderRadiusX = bevelRadius / horizontalLength * plane.width
  const shoulderRadiusY = bevelRadius / verticalLength * plane.height
  const rings = Array.from({ length: bevelSegments + 1 }, (_, index) => {
    const angle = Math.PI / 2 * index / bevelSegments
    const radialProgress = Math.sin(angle)
    const insetX = face.rect.x * (1 - radialProgress)
    const insetY = face.rect.y * (1 - radialProgress)
    const cornerRadiusX = face.radiusX + radialProgress * (shoulderRadiusX - face.radiusX)
    const cornerRadiusY = face.radiusY + radialProgress * (shoulderRadiusY - face.radiusY)
    const depth = thickness / 2 - depthRadius + depthRadius * Math.cos(angle)
    return roundedRectPoints(
      {
        x: insetX,
        y: insetY,
        width: plane.width - insetX * 2,
        height: plane.height - insetY * 2,
      },
      cornerRadiusX,
      cornerRadiusY,
      bevelSegments,
    ).map((point) => planeWorldPoint(plane, basis, point, depth))
  })

  for (let ringIndex = 0; ringIndex < bevelSegments; ringIndex++) {
    appendConnectedRings(builder, rings[ringIndex], rings[ringIndex + 1])
  }

  const shoulder = rings[rings.length - 1]
  const backRing = roundedRectPoints(
    { x: 0, y: 0, width: plane.width, height: plane.height },
    shoulderRadiusX,
    shoulderRadiusY,
    bevelSegments,
  ).map((point) => planeWorldPoint(plane, basis, point, -thickness / 2))
  appendConnectedRings(builder, backRing, shoulder)
  return builder
}

export function planeVolumeGeometry(
  plane: PlaneDefinition,
  basis: PlaneBasis,
  thickness: number,
  bevelRadius = 0,
  bevelSegments = 1,
): MeshGeometryInput {
  if (bevelRadius > 0 && bevelSegments > 0) {
    return roundedPlaneVolumeGeometry(plane, basis, thickness, bevelRadius, bevelSegments)
  }
  const localCorners = pointsForRect({ x: 0, y: 0, width: plane.width, height: plane.height })
  const front = localCorners.map((point) => planeWorldPoint(plane, basis, point, thickness / 2)) as
    [Vector3, Vector3, Vector3, Vector3]
  const back = localCorners.map((point) => planeWorldPoint(plane, basis, point, -thickness / 2)) as
    [Vector3, Vector3, Vector3, Vector3]
  const builder: GeometryBuilder = { positions: [], normals: [], indices: [] }
  appendQuadWithComputedNormal(builder, [back[0], back[1], front[1], front[0]])
  appendQuadWithComputedNormal(builder, [back[1], back[2], front[2], front[1]])
  appendQuadWithComputedNormal(builder, [back[2], back[3], front[3], front[2]])
  appendQuadWithComputedNormal(builder, [back[3], back[0], front[0], front[3]])
  return builder
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
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
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

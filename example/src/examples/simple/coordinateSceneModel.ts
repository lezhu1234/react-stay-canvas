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

const CAMERA_FIELD_OF_VIEW = Math.PI / 3.4
const CAMERA_POSITION_X = 4.2
const GROUND_HEIGHT = -2.8
const PANEL_LAYOUT = [
  { centerX: -2.6, depth: 8.8, worldWidth: 4.3, worldHeight: 6.6, yaw: 0.04, logicalScale: 1 },
  { centerX: 2.4, depth: 7.8, worldWidth: 4.2, worldHeight: 5.8, yaw: 0.16, logicalScale: 0.96 },
  { centerX: 6.1, depth: 7, worldWidth: 3.1, worldHeight: 5.1, yaw: 0.28, logicalScale: 0.92 },
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

export const planePalette = {
  client: {
    fill: rgba(90, 190, 236, 0.18),
    stroke: rgba(77, 178, 224, 0.9),
  },
  view: {
    fill: rgba(72, 114, 235, 0.19),
    stroke: rgba(67, 112, 230, 0.92),
  },
  content: {
    fill: rgba(51, 180, 121, 0.18),
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
  }: typeof PANEL_LAYOUT[number]): [Vector3, Vector3, Vector3, Vector3] => {
    const horizontal: Vector3 = [Math.cos(yaw), 0, -Math.sin(yaw)]
    const halfWidth = worldWidth / 2
    const leftBottom: Vector3 = [
      centerX - horizontal[0] * halfWidth,
      GROUND_HEIGHT,
      -depth - horizontal[2] * halfWidth,
    ]
    const rightBottom: Vector3 = [
      centerX + horizontal[0] * halfWidth,
      GROUND_HEIGHT,
      -depth + horizontal[2] * halfWidth,
    ]
    return [
      [leftBottom[0], GROUND_HEIGHT + worldHeight, leftBottom[2]],
      [rightBottom[0], GROUND_HEIGHT + worldHeight, rightBottom[2]],
      rightBottom,
      leftBottom,
    ]
  }

  const definition = (name: PlaneName, index: number): PlaneDefinition => {
    const layout = PANEL_LAYOUT[index]
    const planeWidth = logicalBaseWidth * layout.logicalScale
    const planeHeight = planeWidth / PLANE_ASPECT_RATIO
    const worldQuad = panelWorldQuad(layout)
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

export function floorMeshGeometry(): MeshGeometryInput {
  const points: Vector3[] = [
    [-9, GROUND_HEIGHT, -3.2],
    [9, GROUND_HEIGHT, -3.2],
    [24, GROUND_HEIGHT, -19],
    [-24, GROUND_HEIGHT, -19],
  ]
  const builder: GeometryBuilder = { positions: [], normals: [], indices: [] }
  appendQuad(builder, points, [0, 1, 0])
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
    basis.origin[0] + basis.horizontal[0] * horizontal + basis.vertical[0] * vertical
      + basis.normal[0] * depthOffset,
    basis.origin[1] + basis.horizontal[1] * horizontal + basis.vertical[1] * vertical
      + basis.normal[1] * depthOffset,
    basis.origin[2] + basis.horizontal[2] * horizontal + basis.vertical[2] * vertical
      + basis.normal[2] * depthOffset,
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

export function planeVolumeGeometry(
  plane: PlaneDefinition,
  basis: PlaneBasis,
  thickness: number,
): MeshGeometryInput {
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

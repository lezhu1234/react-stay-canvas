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
import type {
  CoordinatePlaneDomain,
  CoordinatePlaneName,
  LineSegment,
} from "./coordinateLabModel"

export const PLANE_GRID_COLUMNS = 20
export const PLANE_GRID_ROWS = 10

const CAMERA_FIELD_OF_VIEW = Math.PI / 3.4
const CAMERA_POSITION_X = 4.2
const CAMERA_NEAR = 0.1
const COMPACT_GROUND_HEIGHT = -3
const EXPANDED_GROUND_HEIGHT = -2
const EXPANDED_LAYOUT_SCALE = 0.87
const COMPACT_PANEL_HEIGHT_TRIM = 0.85
const SOURCE_FIT_MIN_SCALE = 0.28
const SHORT_SURFACE_REFERENCE_HEIGHT = 420
const SHORT_SURFACE_REFERENCE_WIDTH = 880
const SOURCE_FIT_REFERENCE_HEIGHT = 560
const SOURCE_FIT_REFERENCE_WIDTH = 1200
const BEVEL_FACE_CORNER_RATIO = 0.28
const SOURCE_GROUP_CENTER_FRACTION = 0.3
const STAGE_FLOOR_DROP = 0.65
const STAGE_PANEL_WORLD_WIDTH = 4.15
const STAGE_PANEL_WORLD_HEIGHT = 4.15
const PANEL_LAYOUT = [
  { centerFraction: 0.185, stageCenterFraction: 0.1308, stageScale: 1, compactDepth: 7.5, depth: 7.25, stageDepth: 6.99, worldWidth: 4.4, stageWorldWidth: STAGE_PANEL_WORLD_WIDTH, worldHeight: 6.2, stageWorldHeight: STAGE_PANEL_WORLD_HEIGHT, yaw: 0.18, stageYaw: 0.58, verticalOffset: 0 },
  { centerFraction: 0.43, stageCenterFraction: 0.3733, stageScale: 1, compactDepth: 9, depth: 9.2, stageDepth: 7.82, worldWidth: 4.4, stageWorldWidth: STAGE_PANEL_WORLD_WIDTH, worldHeight: 6.2, stageWorldHeight: STAGE_PANEL_WORLD_HEIGHT, yaw: 0.28, stageYaw: 0.7, verticalOffset: 0 },
  { centerFraction: 0.614, stageCenterFraction: 0.5593, stageScale: 1, compactDepth: 10.7, depth: 11.3, stageDepth: 8.59, worldWidth: 4.4, stageWorldWidth: STAGE_PANEL_WORLD_WIDTH, worldHeight: 6.2, stageWorldHeight: STAGE_PANEL_WORLD_HEIGHT, yaw: 0.38, stageYaw: 0.46, verticalOffset: 0 },
] as const

const PLANE_TITLE_X_FRACTION: Readonly<Record<PlaneName, number>> = {
  client: 0.36,
  view: 0.23,
  content: 0.27,
}

const PLANE_TITLE_Y_OFFSET: Readonly<Record<PlaneName, number>> = {
  client: 7,
  view: 0,
  content: -2,
}

export type PlaneName = CoordinatePlaneName
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

export type PlanePresentationMetrics = {
  detailSize: number
  dotRadius: number
  projectedWidth: number
  rangeSize: number
  titleSize: number
  valueOffset: number
}

export type CoordinateSceneLayout = {
  console: Rect
  output: Rect
  outputGroundGap: number
  outputHeaderHeight: number
}

export const COORDINATE_CONSOLE_CONTROL_NAMES = [
  "css-reset",
  "scale-x",
  "scale-y",
  "translate-x",
  "translate-y",
  "zoom-in",
  "zoom-out",
  "pan",
  "viewport-reset",
  "evidence",
] as const

export type CoordinateConsoleControlName = typeof COORDINATE_CONSOLE_CONTROL_NAMES[number]

export function coordinateConsoleIsCompact(frame: Readonly<Rect>) {
  return frame.height < 110 || frame.width < 900
}

function progressBetween(value: number, start: number, end: number) {
  return Math.min(1, Math.max(0, (value - start) / (end - start)))
}

/**
 * Defines the installation in the root StayCanvas View space. DOM surfaces may
 * consume this layout as mounting geometry, but DOM measurements must never be
 * fed back into the scene as its source of truth.
 */
export function createCoordinateSceneLayout(
  width: number,
  height: number,
): CoordinateSceneLayout {
  const short = height <= 700
  const mediumHeight = height <= 840
  const narrow = width <= 1040
  const consoleInset = width <= 1100 ? 36 : 90
  const consoleRightInset = width >= 1600 ? 110 : consoleInset
  const consoleHeight = short ? 82 : mediumHeight ? 144 : 162
  const consoleBottom = short ? 12 : mediumHeight ? 12 : 57
  const consoleY = height - consoleHeight - consoleBottom
  const outputWidth = narrow
    ? width >= 320 ? Math.min(300, width - 48) : 300
    : Math.round(Math.min(560, width * 0.335))
  const outputInset = width >= 1390 ? 0 : 24
  const outputX = width - outputWidth - outputInset
  const outputY = short
    ? 30
    : mediumHeight
      ? 96
      : Math.round(Math.min(166, height * 0.166))
  const preferredOutputHeight = short
    ? 443
    : mediumHeight
      ? Math.min(460, height - outputY - 176)
      : 500
  // Below 260px the resize stress path preserves the last meaningful facade.
  // At interactive sizes the Output is bounded by the Console, which both
  // prevents input interception and keeps the front-facing quad below the
  // camera horizon by a sufficient margin.
  const outputConsoleGap = short
    ? Math.min(28, Math.max(4, (height - 240) * 0.2))
    : 16
  const outputHeight = height < 260
    ? 300
    : Math.max(1, Math.min(
      preferredOutputHeight,
      consoleY - outputConsoleGap - outputY,
    ))

  return {
    output: {
      x: outputX,
      y: outputY,
      width: outputWidth,
      height: outputHeight,
    },
    console: {
      x: consoleInset,
      y: consoleY,
      width: width - consoleInset - consoleRightInset,
      height: consoleHeight,
    },
    outputHeaderHeight: short ? 62 : mediumHeight ? 76 : 70,
    outputGroundGap: short ? 8 : mediumHeight ? 36 : 28,
  }
}

/**
 * Defines every interactive console target in root StayCanvas View space.
 * Tests and rendering share this model so the DOM cannot become a surrogate
 * interaction tree for the visible Canvas controls.
 */
export function coordinateConsoleControlRects(
  frame: Readonly<Rect>,
): Record<CoordinateConsoleControlName, Rect> {
  const compact = coordinateConsoleIsCompact(frame)
  const hidden = { x: 0, y: 0, width: 0, height: 0 }
  if (compact) {
    const actionInset = 14
    const actionWidth = (frame.width - actionInset * 2) / 5
    const action = (index: number): Rect => ({
      x: frame.x + actionInset + actionWidth * index,
      y: frame.y + frame.height - 23,
      width: actionWidth,
      height: 22,
    })
    return {
      "css-reset": action(0),
      "scale-x": hidden,
      "scale-y": hidden,
      "translate-x": hidden,
      "translate-y": hidden,
      "zoom-in": action(1),
      "zoom-out": action(2),
      pan: hidden,
      "viewport-reset": action(3),
      evidence: action(4),
    }
  }
  const railY = frame.y + frame.height * 0.63
  const cssRail = {
    x: frame.x + frame.width * 0.048,
    y: railY - 12,
    width: frame.width * 0.154,
    height: 24,
  }
  const viewportRail = {
    x: frame.x + frame.width * 0.258,
    y: railY - 12,
    width: frame.width * 0.171,
    height: 24,
  }
  const buttonSize = Math.min(62, frame.height - 72)
  const buttonY = frame.y + (frame.height - buttonSize) * 0.41
  const button = (centerRatio: number): Rect => ({
    x: frame.x + frame.width * centerRatio - buttonSize / 2,
    y: buttonY,
    width: buttonSize,
    height: buttonSize,
  })
  return {
    "css-reset": button(0.86),
    "scale-x": cssRail,
    "scale-y": hidden,
    "translate-x": viewportRail,
    "translate-y": hidden,
    "zoom-in": hidden,
    "zoom-out": hidden,
    pan: hidden,
    "viewport-reset": button(0.933),
    evidence: button(0.787),
  }
}

function sourceFitScale(width: number, height: number) {
  // The vertical-FOV camera makes projected pixel size grow with surface height.
  // Short surfaces therefore use a smaller reference footprint and an explicit
  // world-scale cap so their on-screen panels stay readable without changing
  // the logical coordinate domain.
  const shortSurfaceMix = 1 - progressBetween(height, 450, 550)
  const referenceWidth = SOURCE_FIT_REFERENCE_WIDTH
    + (SHORT_SURFACE_REFERENCE_WIDTH - SOURCE_FIT_REFERENCE_WIDTH) * shortSurfaceMix
  const referenceHeight = SOURCE_FIT_REFERENCE_HEIGHT
    + (SHORT_SURFACE_REFERENCE_HEIGHT - SOURCE_FIT_REFERENCE_HEIGHT) * shortSurfaceMix
  const shortSurfaceScaleLimit = 1 - shortSurfaceMix * 0.18
  const mediumLandscapeScaleLimit = height <= 740 && width >= 1250 ? 0.78 : 1

  return Math.max(
    SOURCE_FIT_MIN_SCALE,
    Math.min(
      1,
      shortSurfaceScaleLimit,
      mediumLandscapeScaleLimit,
      width / referenceWidth,
      height / referenceHeight,
    ),
  )
}

function sourceStageExpansion(width: number, height: number) {
  return Math.min(
    progressBetween(width, 1250, 1390),
    progressBetween(height, 439, 453),
  )
}

function sourceSlotScale(width: number) {
  // The root View layout keeps the front-facing Output inside every supported
  // viewport. Compress the presentation world around its own center so the
  // three source planes remain a complete sequence beside that endpoint.
  if (width <= 600) return 1
  if (width <= 800) return 1 - progressBetween(width, 600, 800) * 0.34
  if (width <= 1040) return 0.66 + progressBetween(width, 800, 1040) * 0.12
  if (width <= 1280) return 0.78 + progressBetween(width, 1040, 1280) * 0.04
  return 0.82 + progressBetween(width, 1280, 1440) * 0.02
}

export const planePalette = {
  client: {
    fill: rgba(255, 252, 250, 0.12),
    stroke: rgba(24, 22, 21, 1),
  },
  view: {
    fill: rgba(248, 252, 255, 0.16),
    stroke: rgba(48, 91, 184, 1),
  },
  content: {
    fill: rgba(248, 255, 250, 0.24),
    stroke: rgba(39, 119, 76, 1),
  },
} as const

export function createCoordinateCamera() {
  return new PerspectiveCamera({
    position: [CAMERA_POSITION_X, 0, 0],
    target: [CAMERA_POSITION_X, 0, -1],
    verticalFieldOfView: CAMERA_FIELD_OF_VIEW,
    near: CAMERA_NEAR,
    far: 20,
  })
}

export function projectCoordinateWorldPoint(
  viewWidth: number,
  viewHeight: number,
  point: Readonly<Vector3>,
): Coordinate {
  if (viewWidth <= 0 || viewHeight <= 0 || point[2] >= -CAMERA_NEAR) {
    throw new RangeError("world point must project inside the coordinate camera")
  }
  const depth = -point[2]
  const halfFieldHeight = Math.tan(CAMERA_FIELD_OF_VIEW / 2)
  const aspect = viewWidth / viewHeight
  return {
    x: ((point[0] - CAMERA_POSITION_X) / (depth * halfFieldHeight * aspect) + 1) * viewWidth / 2,
    y: (1 - point[1] / (depth * halfFieldHeight)) * viewHeight / 2,
  }
}

/** Inverts the coordinate camera projection at an explicit positive depth. */
export function screenCoordinateToWorldAtDepth(
  viewWidth: number,
  viewHeight: number,
  point: Readonly<Coordinate>,
  depth: number,
): Vector3 {
  if (viewWidth <= 0 || viewHeight <= 0 || !Number.isFinite(depth)
      || depth <= CAMERA_NEAR || depth >= 20) {
    throw new RangeError("screen point depth must remain inside the coordinate camera")
  }
  const halfHeight = depth * Math.tan(CAMERA_FIELD_OF_VIEW / 2)
  const halfWidth = halfHeight * viewWidth / viewHeight
  return [
    CAMERA_POSITION_X + (point.x / viewWidth * 2 - 1) * halfWidth,
    (1 - point.y / viewHeight * 2) * halfHeight,
    -depth,
  ]
}

/**
 * Maps a root View-space rectangle onto a camera-facing world quad at a fixed
 * depth. This keeps image-backed scene geometry pixel-aligned without making
 * DOM measurements the source of truth.
 */
export function screenFacingWorldQuad(
  viewWidth: number,
  viewHeight: number,
  frame: Readonly<Rect>,
  depth: number,
): readonly [Vector3, Vector3, Vector3, Vector3] {
  if (viewWidth <= 0 || viewHeight <= 0 || frame.width <= 0 || frame.height <= 0) {
    throw new RangeError("screen-facing quad frame and view must have positive dimensions")
  }
  if (!Number.isFinite(depth) || depth <= 0.1 || depth >= 20) {
    throw new RangeError("screen-facing quad depth must remain inside the coordinate camera")
  }
  return [
    screenCoordinateToWorldAtDepth(viewWidth, viewHeight, frame, depth),
    screenCoordinateToWorldAtDepth(
      viewWidth,
      viewHeight,
      { x: frame.x + frame.width, y: frame.y },
      depth,
    ),
    screenCoordinateToWorldAtDepth(
      viewWidth,
      viewHeight,
      { x: frame.x + frame.width, y: frame.y + frame.height },
      depth,
    ),
    screenCoordinateToWorldAtDepth(
      viewWidth,
      viewHeight,
      { x: frame.x, y: frame.y + frame.height },
      depth,
    ),
  ]
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
  domain: CoordinatePlaneDomain,
): Record<PlaneName, PlaneDefinition> {
  const aspect = width / Math.max(1, height)
  const halfFieldHeight = Math.tan(CAMERA_FIELD_OF_VIEW / 2)
  const fitScale = sourceFitScale(width, height)
  const horizontalTallSceneScale = 1 - progressBetween(height, 600, 1000) * 0.33
  const verticalTallSceneScale = horizontalTallSceneScale
    + progressBetween(height, 840, 1000) * 0.15
  const responsiveSceneLift = 0.9 + progressBetween(height, 840, 1000) * 0.15
  const verticalSceneScale = fitScale * verticalTallSceneScale
  const horizontalSceneScale = fitScale * horizontalTallSceneScale * sourceSlotScale(width)
  const panelStageScale = Math.min(1.08, 1 + Math.max(0, height - 80) / 800)
  const stageExpansion = sourceStageExpansion(width, height)
  const groundSceneScale = verticalTallSceneScale + stageExpansion * 0.09
  const layoutScale = 1 + (EXPANDED_LAYOUT_SCALE - 1) * stageExpansion
  const groundHeight = (
    COMPACT_GROUND_HEIGHT
    + (EXPANDED_GROUND_HEIGHT - COMPACT_GROUND_HEIGHT) * stageExpansion
  ) * groundSceneScale

  const panelWorldQuad = ({
    centerFraction,
    stageCenterFraction,
    stageScale,
    compactDepth,
    depth,
    stageDepth,
    worldWidth,
    stageWorldWidth,
    worldHeight,
    stageWorldHeight,
    yaw,
    stageYaw,
    verticalOffset,
  }: typeof PANEL_LAYOUT[number]): [Vector3, Vector3, Vector3, Vector3] => {
    const stageLayoutMix = progressBetween(width, 1280, 1440)
    const availableDepthMix = progressBetween(width, 600, 1012)
    const responsiveDepth = compactDepth + (depth - compactDepth) * availableDepthMix
    const sceneDepth = responsiveDepth + (stageDepth - responsiveDepth) * stageLayoutMix
    const sceneYaw = yaw + (stageYaw - yaw) * stageLayoutMix
    const scenePanelScale = 1 + (stageScale - 1) * stageLayoutMix
    const horizontal: Vector3 = [Math.cos(sceneYaw), 0, -Math.sin(sceneYaw)]
    const uncompressedCenterFraction = centerFraction
      + (stageCenterFraction - centerFraction) * stageLayoutMix
    const sceneCenterFraction = SOURCE_GROUP_CENTER_FRACTION
      + (uncompressedCenterFraction - SOURCE_GROUP_CENTER_FRACTION) * sourceSlotScale(width)
    const scaledCenterX = CAMERA_POSITION_X
      + (sceneCenterFraction * 2 - 1) * sceneDepth * halfFieldHeight * aspect
    const sceneWorldWidth = worldWidth
      + (stageWorldWidth - worldWidth) * stageLayoutMix
    const sceneWorldHeight = worldHeight
      + (stageWorldHeight - worldHeight) * stageLayoutMix
    const halfWidth = sceneWorldWidth * scenePanelScale * panelStageScale * layoutScale * horizontalSceneScale / 2
    const scaledHeight = (
      sceneWorldHeight * scenePanelScale * panelStageScale * layoutScale
      - COMPACT_PANEL_HEIGHT_TRIM * (1 - stageExpansion)
    ) * verticalSceneScale
    const bottomHeight = groundHeight
      + verticalOffset * (1 - stageExpansion)
      + responsiveSceneLift
      - STAGE_FLOOR_DROP * stageExpansion
    const leftBottom: Vector3 = [
      scaledCenterX - horizontal[0] * halfWidth,
      bottomHeight,
      -sceneDepth - horizontal[2] * halfWidth,
    ]
    const rightBottom: Vector3 = [
      scaledCenterX + horizontal[0] * halfWidth,
      bottomHeight,
      -sceneDepth + horizontal[2] * halfWidth,
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
    const worldQuad = panelWorldQuad(layout)
    const [topLeft, topRight, bottomRight, bottomLeft] = worldQuad.map(
      (point) => projectCoordinateWorldPoint(width, height, point),
    ) as QuadPoints
    const projectedHeight = Math.max(
      Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y),
      Math.hypot(bottomRight.x - topRight.x, bottomRight.y - topRight.y),
    )
    return {
      width: domain.width,
      height: domain.height,
      labelX: topLeft.x + (topRight.x - topLeft.x) * PLANE_TITLE_X_FRACTION[name],
      labelY: Math.min(topLeft.y, topRight.y)
        + Math.max(28, projectedHeight * 0.157)
        + PLANE_TITLE_Y_OFFSET[name],
      placement: projectivePlacementFromQuad(
        { x: 0, y: 0, width: domain.width, height: domain.height },
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

function sharedGroundHeight(
  definitions: Readonly<Record<PlaneName, PlaneDefinition>>,
) {
  return definitions.client.worldQuad[3][1]
}

export function createFrontFacingPanelDefinition(
  viewWidth: number,
  viewHeight: number,
  frame: Readonly<Rect>,
  definitions: Readonly<Record<PlaneName, PlaneDefinition>>,
): PlaneDefinition {
  if (viewWidth <= 0 || viewHeight <= 0 || frame.width <= 0 || frame.height <= 0) {
    throw new RangeError("front-facing panel frame and view must have positive dimensions")
  }
  const aspect = viewWidth / viewHeight
  const bottomFraction = (frame.y + frame.height) / viewHeight
  const ground = sharedGroundHeight(definitions)
  const groundProjection = (1 - bottomFraction * 2) * Math.tan(CAMERA_FIELD_OF_VIEW / 2)
  if (groundProjection >= -1e-4) {
    throw new RangeError("front-facing panel must reach the projected ground below the horizon")
  }
  const depth = ground / groundProjection
  const worldPoint = (x: number, y: number): Vector3 => [
    CAMERA_POSITION_X
      + (x / viewWidth * 2 - 1) * depth * Math.tan(CAMERA_FIELD_OF_VIEW / 2) * aspect,
    (1 - y / viewHeight * 2) * depth * Math.tan(CAMERA_FIELD_OF_VIEW / 2),
    -depth,
  ]
  const worldQuad: [Vector3, Vector3, Vector3, Vector3] = [
    worldPoint(frame.x, frame.y),
    worldPoint(frame.x + frame.width, frame.y),
    worldPoint(frame.x + frame.width, frame.y + frame.height),
    worldPoint(frame.x, frame.y + frame.height),
  ]
  return {
    width: frame.width,
    height: frame.height,
    labelX: frame.x + frame.width / 2,
    labelY: frame.y,
    placement: projectivePlacementFromQuad(
      { x: 0, y: 0, width: frame.width, height: frame.height },
      {
        topLeft: { x: frame.x, y: frame.y },
        topRight: { x: frame.x + frame.width, y: frame.y },
        bottomRight: { x: frame.x + frame.width, y: frame.y + frame.height },
        bottomLeft: { x: frame.x, y: frame.y + frame.height },
      },
    ),
    worldQuad,
    fill: rgba(214, 230, 225, 0.15),
    stroke: rgba(105, 130, 123, 0.72),
  }
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

export function planePresentationMetrics(
  plane: PlaneDefinition,
): PlanePresentationMetrics {
  const topLeft = projectPlanePoint(plane, { x: 0, y: 0 })
  const topRight = projectPlanePoint(plane, { x: plane.width, y: 0 })
  const bottomLeft = projectPlanePoint(plane, { x: 0, y: plane.height })
  const bottomRight = projectPlanePoint(plane, { x: plane.width, y: plane.height })
  const edgeWidth = (left: Coordinate, right: Coordinate) => Math.hypot(
    right.x - left.x,
    right.y - left.y,
  )
  const projectedWidth = Math.max(
    edgeWidth(topLeft, topRight),
    edgeWidth(bottomLeft, bottomRight),
  )

  return {
    detailSize: Math.max(9.5, Math.min(14, projectedWidth * 0.048)),
    dotRadius: Math.max(4, Math.min(7, projectedWidth * 0.018)),
    projectedWidth,
    rangeSize: Math.max(10, Math.min(17, projectedWidth * 0.05)),
    titleSize: Math.max(22, Math.min(31, 18 + projectedWidth * 0.035)),
    valueOffset: Math.max(6, Math.min(10, projectedWidth * 0.025)),
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

export function planeBevelFacePerimeter(
  face: Readonly<PlaneBevelFaceProfile>,
  segments: number,
) {
  return roundedRectPoints(face.rect, face.radiusX, face.radiusY, segments)
}

/** Builds one UV-mapped rounded side shell from the physical front to back face. */
export function planeVolumeProfileGeometry(
  plane: PlaneDefinition,
  basis: PlaneBasis,
  thickness: number,
  bevelRadius: number,
  bevelSegments: number,
): MeshGeometryInput {
  if (!Number.isFinite(thickness) || thickness <= 0) {
    throw new RangeError("profiled plane volume thickness must be positive")
  }
  const face = createPlaneBevelFaceProfile(plane, basis, bevelRadius)
  const horizontalLength = Math.hypot(...basis.horizontal)
  const verticalLength = Math.hypot(...basis.vertical)
  const backRadiusX = bevelRadius / horizontalLength * plane.width
  const backRadiusY = bevelRadius / verticalLength * plane.height
  const front = roundedRectPoints(
    face.rect,
    face.radiusX,
    face.radiusY,
    bevelSegments,
  ).map((point) => planeWorldPoint(plane, basis, point, thickness / 2))
  const back = roundedRectPoints(
    { x: 0, y: 0, width: plane.width, height: plane.height },
    backRadiusX,
    backRadiusY,
    bevelSegments,
  ).map((point) => planeWorldPoint(plane, basis, point, -thickness / 2))
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let index = 0; index <= front.length; index += 1) {
    const sourceIndex = index % front.length
    positions.push(...front[sourceIndex], ...back[sourceIndex])
    const longitudinal = index === front.length
      ? 1
      : (index + 0.5) / front.length
    uvs.push(0, longitudinal, 1, longitudinal)
    if (index === front.length) continue
    const next = index + 1
    indices.push(
      index * 2,
      next * 2,
      next * 2 + 1,
      index * 2,
      next * 2 + 1,
      index * 2 + 1,
    )
  }
  return { positions, uvs, indices }
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
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return {
      ...emptyMeshGeometry(),
      uvs: [0, 0, 0, 0, 0, 0],
    }
  }
  const builder: GeometryBuilder = { positions: [], normals: [], indices: [] }
  appendPlaneQuad(builder, plane, basis, pointsForRect(rect), depthOffset)
  return {
    ...builder,
    // appendPlaneQuad emits top-left, bottom-left, bottom-right, top-right.
    uvs: [0, 0, 0, 1, 1, 1, 1, 0],
  }
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

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AmbientLight,
  Circle,
  type CanvasLayerConfig,
  type DrawCanvasContext,
  DirectionalLight,
  EnvironmentMap,
  GlassMaterial,
  type GlassAttenuationColor,
  ImageMaterial,
  ImageTexture,
  Line,
  type ListenerProps,
  Mesh,
  Path,
  Point,
  Polygon,
  Rectangle,
  StandardMaterial,
  StayCanvas,
  StayText,
  TransparentImageMaterial,
  UnlitMaterial,
  type Coordinate,
  type Rect,
  type ShapeDrawProps,
  type StayTools,
  type Vector3,
  type ViewportState,
} from "react-stay-canvas"

import { CanvasSurface, colors, rgba, sceneCanvasArea } from "../../components/DemoKit"
import { useI18n } from "../../i18n"
import coordinateRoomBackdropUrl from "../../assets/coordinate-room-backdrop-v1.png"
import { hasPointerPosition } from "../actionEventGuards"
import {
  clippedRectEdges,
  COORDINATE_PLANE_DOMAIN,
  containsRect,
  coordinatePlaneRange,
  correspondingRectCorners,
  formatPoint,
  formatRect,
  frameCoordinatePlaneRange,
  projectCoordinatePlanePoint,
  projectCoordinatePlaneRect,
  type CoordinateEvidence,
  type CoordinateEventEvidence,
  type CoordinateProbe,
  type LineSegment,
} from "./coordinateLabModel"
import {
  COORDINATE_CONSOLE_CONTROL_NAMES,
  coordinateConsoleControlRects,
  coordinateConsoleIsCompact,
  createCoordinateCamera,
  createCoordinateSceneLayout,
  createFrontFacingPanelDefinition,
  createPlaneBevelFaceProfile,
  createPlaneBasis,
  createPlaneDefinitions,
  emptyMeshGeometry,
  lineMeshGeometry,
  meshColor,
  type CoordinateConsoleControlName,
  planePresentationMetrics,
  planeVolumeGeometry,
  planeVolumeProfileGeometry,
  planeWorldPoint,
  PLANE_GRID_COLUMNS,
  PLANE_GRID_ROWS,
  projectCoordinateWorldPoint,
  projectPlanePoint,
  rectMeshGeometry,
  roundedRectMeshGeometry,
  screenFacingWorldQuad,
  screenCoordinateToWorldAtDepth,
  transparentMeshColor,
  worldLineMeshGeometry,
  type PlaneBasis,
  type PlaneDefinition,
  type PlaneName,
  type PlanePresentationMetrics,
  type CoordinateSceneLayout,
} from "./coordinateSceneModel"

export { createPlaneDefinitions } from "./coordinateSceneModel"
export { expandRangeToAspect } from "./coordinateLabModel"

const STACK_WIDTH = 240
const STACK_HEIGHT = 120
const POINT_LABEL_RISE_RATIO: Readonly<Record<PlaneName, number>> = {
  client: 0.17,
  view: 0.19,
  content: 0.21,
}
const BACKDROP_WEBGL_LAYER = 0
const GROUND_LAYER = 1
const WEBGL_LAYER = 2
const OVERLAY_LAYER = 3
const SIGNAL_SHADOW_SOURCE_OFFSET = 10_000
const SIGNAL_SHADOW_STORE_KEY = {
  blur: "shadowBlur",
  color: "shadowColor",
  gapColor: "shadowGapColor",
  gapAlpha: "highlightGapAlpha",
  passes: "shadowPasses",
} as const
type CoordinateSignalStyle = Readonly<{
  color: ReturnType<typeof rgba>
  layer: number
  lineWidth: number
  zIndex: number
  shadowBlur?: number
  shadowColor?: string
  shadowGapColor?: string
  shadowPasses?: number
  highlightGapAlpha?: number
}>
const COORDINATE_SIGNAL_STYLE = {
  glow: {
    color: rgba(255, 170, 150, 0.65),
    layer: OVERLAY_LAYER,
    lineWidth: 4,
    zIndex: 17,
    shadowBlur: 10,
    shadowColor: "rgb(255 110 75 / 0.65)",
    shadowGapColor: "rgb(255 110 75 / 0.10)",
    shadowPasses: 2,
  },
  highlight: {
    color: rgba(255, 250, 247, 1),
    layer: OVERLAY_LAYER,
    lineWidth: 1.6,
    zIndex: 18,
    highlightGapAlpha: 0.05,
  },
} as const satisfies Readonly<Record<"glow" | "highlight", CoordinateSignalStyle>>
const ROOM_BACKDROP_DEPTH = 19
const PANEL_THICKNESS = 0.06
const PANEL_OPTICAL_THICKNESS = 0.06
const PANEL_FACE_OFFSET = PANEL_THICKNESS / 2
const PANEL_BEVEL_RADIUS = 0.03
const PANEL_BEVEL_SEGMENTS = 8
const PANEL_FACE_ALPHA_SCALE = 1.35
const PLANE_TITLE_SCALE_X = 0.82
const PLANE_PLOT_TOP = 82
const PLANE_PLOT_INSETS: Readonly<Record<PlaneName, Readonly<{
  left: number
  right: number
  bottom: number
}>>> = {
  client: { left: 34, right: 18, bottom: 55 },
  view: { left: 38, right: 19, bottom: 66 },
  content: { left: 36, right: 28, bottom: 65 },
}
const OUTPUT_PANEL_THICKNESS = 0.06
const OUTPUT_PANEL_BEVEL_RADIUS = 0.012
const CONSOLE_PANEL_THICKNESS = 0.06
const CONSOLE_PANEL_BEVEL_RADIUS = 0.05
const PLANE_GLASS_ROUGHNESS: Readonly<Record<PlaneName, number>> = {
  client: 0.045,
  view: 0.05,
  content: 0.055,
}
const PLANE_GLASS_ATTENUATION: Readonly<Record<PlaneName, {
  color: GlassAttenuationColor
  distance: number
}>> = {
  client: { color: [1, 0.88, 0.82], distance: 2 },
  view: { color: [0.8, 0.9, 1], distance: 2 },
  content: { color: [0.8, 1, 0.86], distance: 2 },
}
const PLANE_EDGE_PROFILE_COLORS: Readonly<Record<PlaneName, Readonly<{
  inside: readonly [number, number, number]
  peak: readonly [number, number, number]
  body: readonly [number, number, number]
  secondary: readonly [number, number, number]
  outside: readonly [number, number, number]
}>>> = {
  client: {
    inside: [244, 240, 238], peak: [255, 253, 251], body: [226, 222, 219],
    secondary: [250, 247, 244], outside: [218, 212, 208],
  },
  view: {
    inside: [243, 246, 250], peak: [253, 254, 255], body: [224, 227, 231],
    secondary: [248, 250, 253], outside: [216, 222, 230],
  },
  content: {
    inside: [233, 241, 236], peak: [253, 255, 253], body: [205, 214, 208],
    secondary: [248, 252, 249], outside: [200, 212, 204],
  },
}
const PLANE_EDGE_PROFILE_WIDTH = 32
type PlaneEdgeDirection = "top" | "right" | "bottom" | "left"
type PlaneEdgeAlphaKeyframe = readonly [index: number, alpha: number]

function interpolatePlaneEdgeAlpha(keyframes: readonly PlaneEdgeAlphaKeyframe[]) {
  return Array.from({ length: PLANE_EDGE_PROFILE_WIDTH }, (_, index) => {
    const endIndex = keyframes.findIndex(([frameIndex]) => frameIndex >= index)
    if (endIndex <= 0) return keyframes[Math.max(0, endIndex)][1]
    const [startPosition, startAlpha] = keyframes[endIndex - 1]
    const [endPosition, endAlpha] = keyframes[endIndex]
    const progress = (index - startPosition) / (endPosition - startPosition)
    return Math.round(startAlpha + (endAlpha - startAlpha) * progress)
  })
}

const edgeAlpha = (...keyframes: PlaneEdgeAlphaKeyframe[]) =>
  interpolatePlaneEdgeAlpha(keyframes)

// Each pane and direction owns a complete optical response. Shared profiles
// made unlike projected edges converge to the same narrow rail even when their
// scalar weights differed; explicit keyframes preserve width, peak hierarchy,
// and peak separation as independent material properties.
const PLANE_EDGE_PROFILE_ALPHA: Readonly<Record<PlaneName, Readonly<Record<
  PlaneEdgeDirection,
  readonly number[]
>>>> = {
  client: {
    top: edgeAlpha([0, 0], [4, 30], [6, 180], [7, 180], [9, 40], [18, 0], [22, 40], [26, 0], [31, 0]),
    right: edgeAlpha([0, 0], [4, 30], [8, 195], [11, 180], [15, 55], [19, 0], [31, 0]),
    bottom: edgeAlpha([0, 0], [2, 55], [4, 115], [7, 72], [10, 40], [13, 0], [31, 0]),
    left: edgeAlpha([0, 0], [2, 0], [5, 255], [7, 110], [10, 30], [13, 0], [31, 0]),
  },
  view: {
    top: edgeAlpha([0, 0], [3, 48], [6, 245], [8, 255], [12, 42], [18, 8], [22, 100], [26, 0], [31, 0]),
    right: edgeAlpha([0, 0], [6, 10], [9, 180], [10, 240], [12, 80], [16, 20], [20, 0], [31, 0]),
    bottom: edgeAlpha([0, 0], [3, 50], [6, 125], [8, 100], [12, 40], [16, 0], [31, 0]),
    left: edgeAlpha([0, 0], [1, 0], [5, 255], [8, 100], [11, 25], [14, 0], [31, 0]),
  },
  content: {
    top: edgeAlpha([0, 0], [3, 52], [6, 250], [8, 255], [11, 30], [18, 5], [22, 55], [26, 0], [31, 0]),
    right: edgeAlpha([0, 0], [4, 8], [8, 90], [10, 160], [13, 90], [16, 35], [20, 0], [31, 0]),
    bottom: edgeAlpha([0, 0], [1, 40], [3, 155], [4, 125], [6, 35], [8, 0], [31, 0]),
    left: edgeAlpha([0, 0], [1, 0], [5, 231], [8, 140], [11, 35], [14, 0], [31, 0]),
  },
}
type PlaneEdgeSupport = Readonly<{ inside: number; outside: number }>
const PLANE_EDGE_OPTICAL_SUPPORT: Readonly<Record<PlaneName, Readonly<{
  top: PlaneEdgeSupport
  right: PlaneEdgeSupport
  bottom: PlaneEdgeSupport
  left: PlaneEdgeSupport
}>>> = {
  client: {
    top: { inside: 1.5, outside: 5 },
    right: { inside: 1.5, outside: 7.5 },
    bottom: { inside: 1.5, outside: 11.5 },
    left: { inside: 1.5, outside: 7.5 },
  },
  view: {
    top: { inside: 1.5, outside: 5 },
    right: { inside: 1.5, outside: 8 },
    bottom: { inside: 1.5, outside: 17 },
    left: { inside: 1.5, outside: 7.5 },
  },
  content: {
    top: { inside: 1.5, outside: 5 },
    right: { inside: 1.5, outside: 8 },
    bottom: { inside: 1.5, outside: 14 },
    left: { inside: 1.5, outside: 7.5 },
  },
}
const PLANE_GROUND_GLOW: Readonly<Record<PlaneName, ReturnType<typeof rgba>>> = {
  client: rgba(255, 150, 135, 0.18),
  view: rgba(110, 155, 255, 0.42),
  content: rgba(88, 190, 160, 0.14),
}
const PLANE_CONTACT_SHADOW: Readonly<Record<PlaneName, Readonly<{
  alpha: number
  blur: number
  offset: number
}>>> = {
  client: { alpha: 0.08, blur: 2, offset: 5.33 },
  view: { alpha: 0.016, blur: 2.5, offset: 6.5 },
  content: { alpha: 0.14, blur: 2, offset: 9 },
}
const unlitMaterial = (color: ReturnType<typeof rgba>) =>
  new UnlitMaterial({ color: meshColor(color) })
const standardMaterial = (
  color: ReturnType<typeof rgba>,
  metallic: number,
  roughness: number,
) => new StandardMaterial({ color: meshColor(color), metallic, roughness })

let coordinateShapeTexture: ImageTexture | undefined
let coordinateOutputEdgeTexture: ImageTexture | undefined

const PLANE_FACE_INSET = 3
const PLANE_FACE_DEPTH_OFFSET = PANEL_FACE_OFFSET + 0.004
const PLANE_FACE_TEXTURE_SIZE = 64
const PLANE_FACE_EDGE_FADE_WIDTH = 0.14

const PLANE_FACE_OPTICS: Readonly<Record<PlaneName, Readonly<{
  shadowTint: readonly [number, number, number]
  highlightTint: readonly [number, number, number]
  opacity: number
  opacityGradient: number
  reflection: Readonly<{
    screenAngle: number
    center: number
    width: number
    strength: number
  }>
}>>> = {
  client: {
    shadowTint: [154, 145, 140],
    highlightTint: [255, 250, 247],
    opacity: 0.13,
    opacityGradient: 0,
    reflection: { screenAngle: 16, center: 0, width: 1.05, strength: 1 },
  },
  view: {
    shadowTint: [158, 166, 182],
    highlightTint: [245, 250, 253],
    opacity: 0.57,
    opacityGradient: 0,
    reflection: { screenAngle: 7.5, center: 0, width: 1.05, strength: 1 },
  },
  content: {
    shadowTint: [248, 255, 250],
    highlightTint: [248, 255, 250],
    opacity: 0.48,
    opacityGradient: 0.9,
    reflection: { screenAngle: -1.5, center: 0, width: 1.05, strength: 1 },
  },
}

function coordinatePlaneFaceScreenPoint(
  plane: PlaneDefinition,
  basis: PlaneBasis,
  viewSize: Readonly<{ width: number; height: number }>,
  horizontal: number,
  vertical: number,
) {
  const localWidth = plane.width - PLANE_FACE_INSET * 2
  const localHeight = plane.height - PLANE_FACE_INSET * 2
  return projectCoordinateWorldPoint(
    viewSize.width,
    viewSize.height,
    planeWorldPoint(plane, basis, {
      x: PLANE_FACE_INSET + horizontal * localWidth,
      y: PLANE_FACE_INSET + vertical * localHeight,
    }, PLANE_FACE_DEPTH_OFFSET),
  )
}

function createCoordinatePlaneReflectionPosition(
  plane: PlaneDefinition,
  basis: PlaneBasis,
  viewSize: Readonly<{ width: number; height: number }>,
  screenAngle: number,
) {
  const angle = screenAngle * Math.PI / 180
  const screenGradient = { x: Math.cos(angle), y: Math.sin(angle) }
  const center = coordinatePlaneFaceScreenPoint(plane, basis, viewSize, 0.5, 0.5)
  const derivativeStep = 1 / PLANE_FACE_TEXTURE_SIZE
  const left = coordinatePlaneFaceScreenPoint(
    plane, basis, viewSize, 0.5 - derivativeStep, 0.5,
  )
  const right = coordinatePlaneFaceScreenPoint(
    plane, basis, viewSize, 0.5 + derivativeStep, 0.5,
  )
  const top = coordinatePlaneFaceScreenPoint(
    plane, basis, viewSize, 0.5, 0.5 - derivativeStep,
  )
  const bottom = coordinatePlaneFaceScreenPoint(
    plane, basis, viewSize, 0.5, 0.5 + derivativeStep,
  )
  const horizontalResponse = (
    (right.x - left.x) * screenGradient.x
    + (right.y - left.y) * screenGradient.y
  ) / (derivativeStep * 2)
  const verticalResponse = (
    (bottom.x - top.x) * screenGradient.x
    + (bottom.y - top.y) * screenGradient.y
  ) / (derivativeStep * 2)
  const response = Math.hypot(horizontalResponse, verticalResponse)
  if (!Number.isFinite(response) || response <= 1e-8) {
    throw new RangeError("coordinate plane face projection must have a visible gradient")
  }

  // A screen-linear scalar field keeps its gradient direction stable after
  // projective interpolation. Normalizing by the center Jacobian preserves the
  // existing UV-ramp amplitude while the projected pane changes responsively.
  return (horizontal: number, vertical: number) => {
    const screen = coordinatePlaneFaceScreenPoint(
      plane, basis, viewSize, horizontal, vertical,
    )
    return (
      (screen.x - center.x) * screenGradient.x
      + (screen.y - center.y) * screenGradient.y
    ) / response
  }
}

function createCoordinatePlaneFaceTexture(
  name: PlaneName,
  plane: PlaneDefinition,
  basis: PlaneBasis,
  viewSize: Readonly<{ width: number; height: number }>,
) {
  const width = PLANE_FACE_TEXTURE_SIZE
  const height = PLANE_FACE_TEXTURE_SIZE
  const data = new Uint8Array(width * height * 4)
  const optics = PLANE_FACE_OPTICS[name]
  const reflectionPositionAt = createCoordinatePlaneReflectionPosition(
    plane,
    basis,
    viewSize,
    optics.reflection.screenAngle,
  )
  for (let y = 0; y < height; y += 1) {
    const vertical = y / (height - 1)
    for (let x = 0; x < width; x += 1) {
      const horizontal = x / (width - 1)
      const edgeDistance = Math.min(horizontal, 1 - horizontal, vertical, 1 - vertical)
      const edgeFadeProgress = Math.max(
        0,
        Math.min(1, edgeDistance / PLANE_FACE_EDGE_FADE_WIDTH),
      )
      const edgeFade = edgeFadeProgress * edgeFadeProgress * (3 - 2 * edgeFadeProgress)
      const reflectionPosition = reflectionPositionAt(horizontal, vertical)
      const reflectionProgress = Math.max(0, Math.min(
        1,
        (reflectionPosition - optics.reflection.center) / optics.reflection.width + 0.5,
      ))
      const reflection = reflectionProgress * reflectionProgress * (3 - 2 * reflectionProgress)
      const tone = 0.5 + (reflection - 0.5) * optics.reflection.strength
      const alpha = Math.max(0, Math.min(
        1,
        optics.opacity + (reflection - 0.5) * optics.opacityGradient,
      )) * edgeFade
      const offset = (y * width + x) * 4
      data[offset] = Math.round(
        optics.shadowTint[0] + (optics.highlightTint[0] - optics.shadowTint[0]) * tone,
      )
      data[offset + 1] = Math.round(
        optics.shadowTint[1] + (optics.highlightTint[1] - optics.shadowTint[1]) * tone,
      )
      data[offset + 2] = Math.round(
        optics.shadowTint[2] + (optics.highlightTint[2] - optics.shadowTint[2]) * tone,
      )
      data[offset + 3] = Math.round(alpha * 255)
    }
  }
  return new ImageTexture({ width, height, alphaMode: "straight", data })
}

export function createCoordinateShapeTexture() {
  if (coordinateShapeTexture) return coordinateShapeTexture
  const width = 128
  const height = 128
  const data = new Uint8Array(width * height * 4)
  const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const wave = Math.sin(x * 0.097 + y * 0.023) * 1.15
        + Math.cos(y * 0.083 - x * 0.019) * 0.85
      const horizontal = x / (width - 1) - 0.5
      const vertical = y / (height - 1) - 0.5
      const hash = Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263)
      const redNoise = ((hash >>> 2) & 3) - 1.5
      const greenNoise = ((hash >>> 9) & 3) - 1.5
      const blueNoise = ((hash >>> 16) & 3) - 1.5
      const offset = (y * width + x) * 4
      data[offset] = clampByte(76 + horizontal * 6 + vertical * 3.5 + wave + redNoise * 0.75)
      data[offset + 1] = clampByte(112 + horizontal * 4 + vertical * 3.5 + wave * 0.72 + greenNoise * 0.65)
      data[offset + 2] = clampByte(196 + horizontal * 3 + vertical * 3.5 + wave * 0.38 + blueNoise * 0.55)
      data[offset + 3] = 255
    }
  }
  coordinateShapeTexture = new ImageTexture({ width, height, data })
  return coordinateShapeTexture
}

export function createCoordinateOutputEdgeTexture() {
  if (coordinateOutputEdgeTexture) return coordinateOutputEdgeTexture
  const width = 32
  const height = 128
  const data = new Uint8Array(width * height * 4)
  const alphaStops = [
    [0, 0],
    [0.1, 0],
    [0.2, 0.08],
    [0.3, 0.36],
    [0.5, 0.38],
    [0.64, 0.24],
    [0.8, 0.05],
    [1, 0],
  ] as const
  const sampleAlpha = (position: number) => {
    if (position <= alphaStops[0][0] || position >= alphaStops[alphaStops.length - 1][0]) {
      return 0
    }
    const endIndex = alphaStops.findIndex(([offset]) => offset >= position)
    const [startOffset, startAlpha] = alphaStops[endIndex - 1]
    const [endOffset, endAlpha] = alphaStops[endIndex]
    const progress = (position - startOffset) / (endOffset - startOffset)
    const eased = progress * progress * (3 - 2 * progress)
    return startAlpha + (endAlpha - startAlpha) * eased
  }
  for (let y = 0; y < height; y += 1) {
    const vertical = y / (height - 1)
    const fadeProgress = Math.max(0, Math.min(1, (vertical - 0.52) / 0.4))
    const faded = fadeProgress * fadeProgress * (3 - 2 * fadeProgress)
    const shiftProgress = Math.max(0, Math.min(1, (vertical - 0.48) / 0.3))
    const shifted = shiftProgress * shiftProgress * (3 - 2 * shiftProgress)
    const alphaScale = 1 - faded * 0.96
    const phase = shifted * 0.1 + Math.sin(vertical * Math.PI * 2) * 0.012
    for (let x = 0; x < width; x += 1) {
      const alpha = sampleAlpha(x / (width - 1) - phase) * alphaScale
      const offset = (y * width + x) * 4
      data[offset] = 107
      data[offset + 1] = 74
      data[offset + 2] = 59
      data[offset + 3] = Math.round(alpha * 255)
    }
  }
  coordinateOutputEdgeTexture = new ImageTexture({
    width,
    height,
    alphaMode: "straight",
    data,
  })
  return coordinateOutputEdgeTexture
}

function emptyTexturedMeshGeometry() {
  return {
    ...emptyMeshGeometry(),
    uvs: [0, 0, 0, 0, 0, 0],
  }
}

const glassMaterial = (
  color: ReturnType<typeof rgba>,
  thickness = 0,
  roughness = 0.12,
  attenuation?: typeof PLANE_GLASS_ATTENUATION[PlaneName],
  ior = 1.5,
) =>
  new GlassMaterial({
    attenuationColor: attenuation?.color,
    attenuationDistance: attenuation?.distance,
    color: transparentMeshColor(color),
    ior,
    roughness,
    thickness,
  })

export function coordinatePlaneGlassMaterial(
  name: PlaneName,
  color: ReturnType<typeof rgba>,
  alphaScale = 1,
) {
  return glassMaterial(
    { ...color, a: color.a * alphaScale },
    PANEL_OPTICAL_THICKNESS,
    PLANE_GLASS_ROUGHNESS[name],
    PLANE_GLASS_ATTENUATION[name],
    1.22,
  )
}

export function coordinateOutputGlassMaterial() {
  return glassMaterial(rgba(200, 208, 210, 0.15), OUTPUT_PANEL_THICKNESS, 0.035, {
    color: [0.78, 0.82, 0.82],
    distance: 0.24,
  })
}

function coordinateConsoleFaceMaterial() {
  return glassMaterial(rgba(212, 216, 216, 0.27), 0.065, 0.07, {
    color: [0.92, 0.92, 0.92],
    distance: 1.2,
  }, 1.33)
}

function coordinateConsoleEdgeMaterial() {
  return glassMaterial(rgba(215, 218, 216, 0.2), 0.09, 0.09, {
    color: [0.94, 0.94, 0.94],
    distance: 1.1,
  }, 1.33)
}

function strokeCoordinateSignalGlow(this: Path, { context }: ShapeDrawProps) {
  const shadowBlur = this.shapeStore.get(SIGNAL_SHADOW_STORE_KEY.blur)
  const shadowColor = this.shapeStore.get(SIGNAL_SHADOW_STORE_KEY.color)
  const shadowGapColor = this.shapeStore.get(SIGNAL_SHADOW_STORE_KEY.gapColor)
  const shadowPasses = this.shapeStore.get(SIGNAL_SHADOW_STORE_KEY.passes)
  context.save()
  context.shadowBlur = typeof shadowBlur === "number" ? shadowBlur : 0
  context.shadowColor = typeof shadowColor === "string" ? shadowColor : "transparent"
  context.translate(-SIGNAL_SHADOW_SOURCE_OFFSET, 0)
  context.shadowOffsetX = SIGNAL_SHADOW_SOURCE_OFFSET
  context.shadowOffsetY = 0
  const passCount = typeof shadowPasses === "number" ? Math.max(1, Math.floor(shadowPasses)) : 1
  const [clientPoint, viewPoint, contentPoint, outputPoint] = this.points
  for (let pass = 0; pass < passCount; pass += 1) {
    if (!clientPoint || !viewPoint || !contentPoint || !outputPoint) {
      context.stroke(this.path)
      continue
    }
    context.beginPath()
    context.moveTo(clientPoint.x, clientPoint.y)
    context.lineTo(viewPoint.x, viewPoint.y)
    context.lineTo(contentPoint.x, contentPoint.y)
    context.stroke()
    context.shadowColor = typeof shadowGapColor === "string" ? shadowGapColor : context.shadowColor
    context.beginPath()
    context.moveTo(contentPoint.x, contentPoint.y)
    context.lineTo(outputPoint.x, outputPoint.y)
    context.stroke()
    context.shadowColor = typeof shadowColor === "string" ? shadowColor : "transparent"
  }
  context.restore()
}

function signalColor(color: ReturnType<typeof rgba>, alpha: number) {
  return `rgb(${color.r} ${color.g} ${color.b} / ${alpha})`
}

function strokeCoordinateSignalHighlight(this: Path, { context }: ShapeDrawProps) {
  const [clientPoint, viewPoint, contentPoint, outputPoint] = this.points
  if (!clientPoint || !viewPoint || !contentPoint || !outputPoint) {
    context.stroke(this.path)
    return
  }
  const gapAlpha = this.shapeStore.get(SIGNAL_SHADOW_STORE_KEY.gapAlpha)
  const middleAlpha = typeof gapAlpha === "number" ? gapAlpha : 1
  const color = this.strokeConfig.color
  context.save()
  context.strokeStyle = signalColor(color, color.a)
  context.beginPath()
  context.moveTo(clientPoint.x, clientPoint.y)
  context.lineTo(viewPoint.x, viewPoint.y)
  context.lineTo(contentPoint.x, contentPoint.y)
  context.stroke()

  const gapGradient = context.createLinearGradient(
    contentPoint.x,
    contentPoint.y,
    outputPoint.x,
    outputPoint.y,
  )
  gapGradient.addColorStop(0, signalColor(color, color.a))
  gapGradient.addColorStop(0.35, signalColor(color, color.a * middleAlpha))
  gapGradient.addColorStop(0.65, signalColor(color, color.a * middleAlpha))
  gapGradient.addColorStop(1, signalColor(color, color.a))
  context.strokeStyle = gapGradient
  context.beginPath()
  context.moveTo(contentPoint.x, contentPoint.y)
  context.lineTo(outputPoint.x, outputPoint.y)
  context.stroke()
  context.restore()
}

export function createCoordinateSignalPath(style: CoordinateSignalStyle) {
  return new Path({
    points: [],
    layer: style.layer,
    zIndex: style.zIndex,
    shapeStore: new Map<string, unknown>([
      [SIGNAL_SHADOW_STORE_KEY.blur, style.shadowBlur ?? 0],
      [SIGNAL_SHADOW_STORE_KEY.color, style.shadowColor ?? "transparent"],
      [SIGNAL_SHADOW_STORE_KEY.gapColor, style.shadowGapColor ?? style.shadowColor ?? "transparent"],
      [SIGNAL_SHADOW_STORE_KEY.gapAlpha, style.highlightGapAlpha ?? 1],
      [SIGNAL_SHADOW_STORE_KEY.passes, style.shadowPasses ?? 1],
    ]),
    stateDrawFuncMap: style.shadowBlur
      ? { default: { stroke: strokeCoordinateSignalGlow } }
      : style.highlightGapAlpha
        ? { default: { stroke: strokeCoordinateSignalHighlight } }
        : undefined,
    strokeConfig: {
      color: style.color,
      lineWidth: style.lineWidth,
      lineCap: "round",
      lineJoin: "round",
    },
  })
}

function createCoordinateEnvironment() {
  const width = 128
  const height = 64
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const vertical = y / (height - 1)
    const horizon = Math.exp(-Math.pow((vertical - 0.5) / 0.18, 2))
    const ground = Math.max(0, (vertical - 0.5) * 2)
    for (let x = 0; x < width; x++) {
      const horizontal = x / (width - 1)
      const softbox = Math.exp(-(
        Math.pow((horizontal - 0.68) / 0.16, 2)
        + Math.pow((vertical - 0.38) / 0.18, 2)
      ))
      const offset = (y * width + x) * 4
      data[offset] = Math.min(
        255,
        Math.round(158 + horizon * 24 - ground * 8 + softbox * 92),
      )
      data[offset + 1] = Math.min(
        255,
        Math.round(164 + horizon * 26 - ground * 7 + softbox * 94),
      )
      data[offset + 2] = Math.min(
        255,
        Math.round(170 + horizon * 28 - ground * 5 + softbox * 96),
      )
      data[offset + 3] = 255
    }
  }
  return new EnvironmentMap({ width, height, data, intensity: 1.1 })
}

function createCoordinateLights(castsShadows: boolean) {
  return [
    new AmbientLight({ color: [1, 0.98, 0.94], intensity: 0.48 }),
    new DirectionalLight({
      directionToLight: [0.28, 0.84, 0.46],
      color: [1, 0.9, 0.78],
      intensity: 0.8,
      ...(castsShadows ? {
        shadow: {
          target: [5.5, -0.7, -9] as Vector3,
          distance: 14,
          width: 24,
          height: 18,
          near: 0.1,
          far: 32,
          mapSize: 1024,
          bias: 0.0001,
          filterRadius: 3.2,
        },
      } : {}),
    }),
    new DirectionalLight({
      directionToLight: [-0.35, 0.38, 0.85],
      color: [0.62, 0.76, 1],
      intensity: 0.12,
    }),
  ]
}

export type CoordinateMappingFocus = "view-client" | "content-view"

export function coverImageSourceRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  if ([sourceWidth, sourceHeight, targetWidth, targetHeight].some((value) => value <= 0)) {
    throw new RangeError("image and target dimensions must be positive")
  }
  const sourceAspect = sourceWidth / sourceHeight
  const targetAspect = targetWidth / targetHeight
  if (sourceAspect > targetAspect) {
    const width = sourceHeight * targetAspect
    return { x: (sourceWidth - width) / 2, y: 0, width, height: sourceHeight }
  }
  const height = sourceWidth / targetAspect
  return { x: 0, y: (sourceHeight - height) / 2, width: sourceWidth, height }
}

export function coordinateRoomBackdropCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  const cover = coverImageSourceRect(sourceWidth, sourceHeight, targetWidth, targetHeight)
  const zoom = 0.62
  const horizontalAlignment = 1
  const verticalAlignment = 0.66
  const width = cover.width * zoom
  const height = cover.height * zoom
  return {
    x: cover.x + (cover.width - width) * horizontalAlignment,
    y: cover.y + (cover.height - height) * verticalAlignment,
    width,
    height,
  }
}

export function coordinateRoomBackdropGeometry(
  sourceWidth: number,
  sourceHeight: number,
  viewWidth: number,
  viewHeight: number,
) {
  const crop = coordinateRoomBackdropCrop(
    sourceWidth,
    sourceHeight,
    viewWidth,
    viewHeight,
  )
  const quad = screenFacingWorldQuad(
    viewWidth,
    viewHeight,
    { x: 0, y: 0, width: viewWidth, height: viewHeight },
    ROOM_BACKDROP_DEPTH,
  )
  const left = crop.x / sourceWidth
  const top = crop.y / sourceHeight
  const right = (crop.x + crop.width) / sourceWidth
  const bottom = (crop.y + crop.height) / sourceHeight
  return {
    positions: quad.flat(),
    uvs: [left, top, right, top, right, bottom, left, bottom],
    indices: [0, 1, 2, 0, 2, 3],
  }
}

function smoothUnitRange(start: number, end: number, value: number) {
  const progress = Math.max(0, Math.min(1, (value - start) / (end - start)))
  return progress * progress * (3 - 2 * progress)
}

function coordinateRoomLightingGeometry(viewWidth: number, viewHeight: number) {
  const quad = screenFacingWorldQuad(
    viewWidth,
    viewHeight,
    { x: 0, y: 0, width: viewWidth, height: viewHeight },
    ROOM_BACKDROP_DEPTH - 0.01,
  )
  return {
    positions: quad.flat(),
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
  }
}

let coordinateRoomLightingTexture: ImageTexture | undefined

function createCoordinateRoomLightingTexture() {
  if (coordinateRoomLightingTexture) return coordinateRoomLightingTexture
  const width = 512
  const height = 288
  const data = new Uint8Array(width * height * 4)
  const writePixel = (
    offset: number,
    color: readonly [number, number, number],
    alpha: number,
  ) => {
    data[offset] = color[0]
    data[offset + 1] = color[1]
    data[offset + 2] = color[2]
    data[offset + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
  }
  for (let y = 0; y < height; y += 1) {
    const normalizedY = y / (height - 1)
    for (let x = 0; x < width; x += 1) {
      const normalizedX = x / (width - 1)
      const offset = (y * width + x) * 4
      const ceilingBoundary = 0.106
        + (normalizedX - 0.617) * (0.014 - 0.106) / (1 - 0.617)
      if (normalizedX >= 0.617 && normalizedY <= ceilingBoundary + 0.003) {
        const ceilingEdge = 1 - smoothUnitRange(
          ceilingBoundary - 0.003,
          ceilingBoundary + 0.003,
          normalizedY,
        )
        writePixel(offset, [130, 125, 120], 0.3 * ceilingEdge)
        continue
      }
      if (normalizedX >= 0.617
          && normalizedY > ceilingBoundary
          && normalizedY <= ceilingBoundary + 0.08) {
        writePixel(offset, [248, 250, 252], 0.16)
        continue
      }

      const sunLeft = 0.605
        + (normalizedY - 0.137) * (0.212 - 0.605) / (0.568 - 0.137)
      const sunFade = 1 - smoothUnitRange(0.56, 0.68, normalizedY)
      const rightEdge = 1 - smoothUnitRange(0.6035, 0.6085, normalizedX)
      let sunAlpha = 0
      if (normalizedX <= 0.61) {
        const rightFieldX = smoothUnitRange(0.54, 0.595, normalizedX)
        const rightFieldY = (normalizedY - 0.35) / 0.26
        sunAlpha += 0.45
          * rightFieldX
          * Math.exp(-(rightFieldY * rightFieldY))
          * rightEdge
        if (normalizedY >= 0.137 && normalizedY <= 0.68) {
          const edgeStrength = 1 - 0.25 * smoothUnitRange(0.137, 0.3, normalizedY)
          const edgeDirectionX = 0.512 - 0.605
          const edgeDirectionY = 0.24 - 0.137
          const edgeProgress = (
            (normalizedX - 0.605) * edgeDirectionX
            + (normalizedY - 0.137) * edgeDirectionY
          ) / (edgeDirectionX * edgeDirectionX + edgeDirectionY * edgeDirectionY)
          const boundedEdgeProgress = Math.max(0, Math.min(1, edgeProgress))
          const edgeFeather = 0.0025 + 0.002 * boundedEdgeProgress
          const hardEdge = smoothUnitRange(
            sunLeft - edgeFeather,
            sunLeft + edgeFeather,
            normalizedX,
          )
          const hardEdgePresence = 1 - smoothUnitRange(0.86, 1.14, edgeProgress)
          sunAlpha += hardEdge
            * hardEdgePresence
            * edgeStrength
            * sunFade
            * rightEdge
        }
      }

      const shadeHorizontal = smoothUnitRange(0.29, 0.38, normalizedX)
        * (1 - smoothUnitRange(0.56, 0.64, normalizedX))
      const shadeVertical = 1 - smoothUnitRange(0.5, 0.68, normalizedY)
      const wallFootHorizontal = 1 - smoothUnitRange(0.03, 0.23, normalizedX)
      const wallFootAmbient = 0.42
        * smoothUnitRange(0.48, 0.58, normalizedY)
        * (1 - smoothUnitRange(0.66, 0.72, normalizedY))
      const wallFootContact = 0.25
        * smoothUnitRange(0.645, 0.66, normalizedY)
        * (1 - smoothUnitRange(0.66, 0.685, normalizedY))
      const shadeAlpha = Math.min(
        1,
        0.22 * shadeHorizontal * shadeVertical
          + wallFootHorizontal * (wallFootAmbient + wallFootContact),
      )
      const clampedSunAlpha = Math.min(1, sunAlpha)
      const combinedAlpha = clampedSunAlpha + shadeAlpha * (1 - clampedSunAlpha)
      if (combinedAlpha > 0) {
        const shadeContribution = shadeAlpha * (1 - clampedSunAlpha)
        writePixel(offset, [
          Math.round((255 * clampedSunAlpha + 82 * shadeContribution) / combinedAlpha),
          Math.round((250 * clampedSunAlpha + 75 * shadeContribution) / combinedAlpha),
          Math.round((244 * clampedSunAlpha + 71 * shadeContribution) / combinedAlpha),
        ], combinedAlpha)
      }
    }
  }
  coordinateRoomLightingTexture = new ImageTexture({
    width,
    height,
    alphaMode: "straight",
    data,
  })
  return coordinateRoomLightingTexture
}

let coordinateRoomTexturePromise: Promise<ImageTexture> | undefined

function coordinateRoomWindowSourceY(normalizedY: number) {
  const ceilingAnchor = 0.353
  const mountainDestination = 0.506
  const mountainSource = 0.455
  const floorAnchor = 0.592
  if (normalizedY <= ceilingAnchor || normalizedY >= floorAnchor) return normalizedY
  if (normalizedY <= mountainDestination) {
    const progress = (normalizedY - ceilingAnchor)
      / (mountainDestination - ceilingAnchor)
    return ceilingAnchor + (mountainSource - ceilingAnchor) * progress
  }
  const progress = (normalizedY - mountainDestination)
    / (floorAnchor - mountainDestination)
  return mountainSource + (floorAnchor - mountainSource) * progress
}

function sharpenCoordinateRoomPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const sharpened = new Uint8ClampedArray(pixels)
  if (width < 3 || height < 3) return sharpened
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1] as const
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const centerOffset = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        let blurred = 0
        let kernelIndex = 0
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const sampleOffset = ((y + offsetY) * width + x + offsetX) * 4 + channel
            blurred += pixels[sampleOffset] * kernel[kernelIndex]
            kernelIndex += 1
          }
        }
        const center = pixels[centerOffset + channel]
        sharpened[centerOffset + channel] = center + (center - blurred / 16)
      }
    }
  }
  return sharpened
}

export function gradeCoordinateRoomPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  if (width <= 0 || height <= 0 || pixels.length !== width * height * 4) {
    throw new RangeError("coordinate room pixels must match positive image dimensions")
  }
  const sourcePixels = sharpenCoordinateRoomPixels(pixels, width, height)
  const graded = new Uint8ClampedArray(sourcePixels)
  const wallGrades = [32, 31, 28] as const
  const upperWindowGrades = [20, 13, 7] as const
  for (let y = 0; y < height; y += 1) {
    const normalizedY = height === 1 ? 0 : y / (height - 1)
    const sourceY = coordinateRoomWindowSourceY(normalizedY) * (height - 1)
    const sourceTop = Math.floor(sourceY)
    const sourceBottom = Math.min(height - 1, sourceTop + 1)
    const sourceProgress = sourceY - sourceTop
    for (let x = 0; x < width; x += 1) {
      const normalizedX = width === 1 ? 0 : x / (width - 1)
      const wallWeight = 1 - smoothUnitRange(0.7, 0.78, normalizedX)
      const upperWindowWeight = smoothUnitRange(0.72, 0.8, normalizedX)
        * (1 - smoothUnitRange(0.42, 0.48, normalizedY))
      const offset = (y * width + x) * 4
      const windowWeight = smoothUnitRange(0.755, 0.78, normalizedX)
      for (let channel = 0; channel < 3; channel += 1) {
        const remapped = sourcePixels[(sourceTop * width + x) * 4 + channel]
          + (sourcePixels[(sourceBottom * width + x) * 4 + channel]
            - sourcePixels[(sourceTop * width + x) * 4 + channel]) * sourceProgress
        const source = sourcePixels[offset + channel]
          + (remapped - sourcePixels[offset + channel]) * windowWeight
        const wallGrade = wallGrades[channel] * wallWeight
        graded[offset + channel] = Math.max(
          0,
          source - wallGrade - upperWindowGrades[channel] * upperWindowWeight,
        )
      }
    }
  }
  return graded
}

function loadCoordinateRoomTexture() {
  coordinateRoomTexturePromise ??= new Promise<ImageTexture>((resolve, reject) => {
    const image = new Image()
    image.decoding = "async"
    image.onload = () => {
      try {
        const decodeCanvas = document.createElement("canvas")
        decodeCanvas.width = image.naturalWidth
        decodeCanvas.height = image.naturalHeight
        const context = decodeCanvas.getContext("2d", { willReadFrequently: true })
        if (!context) throw new Error("Unable to decode the coordinate room texture")
        context.drawImage(image, 0, 0)
        const pixels = context.getImageData(
          0,
          0,
          image.naturalWidth,
          image.naturalHeight,
        ).data
        resolve(new ImageTexture({
          width: image.naturalWidth,
          height: image.naturalHeight,
          data: gradeCoordinateRoomPixels(pixels, image.naturalWidth, image.naturalHeight),
        }))
      } catch (error) {
        reject(error)
      }
    }
    image.onerror = () => reject(new Error("Unable to load the coordinate room texture"))
    image.src = coordinateRoomBackdropUrl
  }).catch((error) => {
    coordinateRoomTexturePromise = undefined
    throw error
  })
  return coordinateRoomTexturePromise
}

type PlaneMeshes = {
  frameFill: Mesh
  frameOptics: Mesh
  frameDepth: Mesh
  grid: Mesh
  axes: Mesh
  shapeFill: Mesh
  shapeEdges: Mesh
  viewportEdges?: Mesh
}

type PlaneOverlay = {
  groundGlow: Rectangle
  contactShadow: Polygon
  reflections: Polygon[]
  reflectionEdges: Line[]
  title: StayText
  rangeValue: StayText
  xAxis: StayText
  yAxis: StayText
  xTicks: StayText[]
  yTicks: StayText[]
  pointGuide: Line
  pointHalo: Circle
  dot: Circle
  value: StayText
}

type PlaneRuntime = PlaneDefinition & {
  basis: PlaneBasis
  detailsVisible: boolean
  meshes: PlaneMeshes
  overlay: PlaneOverlay
  presentation: PlanePresentationMetrics
}

type PhysicalPanelRuntime = {
  face: Mesh
  depth: Mesh
}

type OutputPanelRuntime = PhysicalPanelRuntime & {
  edgeTint: Mesh
}

type OutputPanelOverlay = {
  headerTone: Rectangle
  topRefraction: Line
  bottomRefraction: Line
  label: StayText
  title: StayText
  range: StayText
}

type ConsolePanelOverlay = {
  topHighlight: Line
  bottomHighlight: Line
  topInnerRefraction: Line
  leftInnerRefraction: Rectangle
  firstDivider: Line
  secondDivider: Line
  heading: StayText
  status: StayText
  clientLabel: StayText
  clientValue: StayText
  clientDetail: StayText
  firstArrow: StayText
  viewLabel: StayText
  viewValue: StayText
  viewDetail: StayText
  secondArrow: StayText
  contentLabel: StayText
  contentValue: StayText
  contentDetail: StayText
  displayHeading: StayText
  displayResetButton: Rectangle
  displayReset: StayText
  scaleXLabel: StayText
  scaleXValue: StayText
  scaleXUnit: StayText
  scaleYLabel: StayText
  scaleYValue: StayText
  translateXLabel: StayText
  translateXValue: StayText
  translateYLabel: StayText
  translateYValue: StayText
  scaleXRail: Line
  scaleXFill: Line
  scaleXKnob: Circle
  scaleYRail: Line
  scaleYFill: Line
  scaleYKnob: Circle
  viewportHeading: StayText
  viewportStatus: StayText
  viewportSeparator: StayText
  viewportHeight: StayText
  viewportScale: StayText
  viewportButtons: Rectangle[]
  viewportButtonBevels: Line[]
  viewportActions: StayText[]
  viewportFitIconLines: Line[]
  viewportActionLabels: StayText[]
  coordinateRail: Line
  coordinateNodes: Circle[]
}

type ConsoleControlTargets = Record<CoordinateConsoleControlName, Rectangle>
type CoordinateViewportAction = "zoom-in" | "zoom-out" | "pan" | "reset"

type HeroOverlay = {
  eyebrow: StayText
  titleFirst: StayText
  titleSecond: StayText
  subtitle: StayText
}

type EvidenceOverlay = {
  panel: Rectangle
  heading: StayText
  intro: StayText
  labels: StayText[]
  values: StayText[]
}

type OutputSignalOverlay = {
  groundGlow: Rectangle
  contactShadow: Rectangle
  outputReflections: [Rectangle, Rectangle, Rectangle]
  outputReflectionEdges: [Line, Line, Line]
  consoleContactShadow: Rectangle
  consoleReflections: [Rectangle, Rectangle, Rectangle]
  consoleReflectionEdges: [Line, Line, Line]
}

type StackRuntime = {
  planes: Record<PlaneName, PlaneRuntime>
  definitions: Record<PlaneName, PlaneDefinition>
  outputPanel: OutputPanelRuntime
  outputOverlay: OutputPanelOverlay
  consolePanel: PhysicalPanelRuntime
  consoleOverlay: ConsolePanelOverlay
  consoleControlTargets: ConsoleControlTargets
  heroOverlay: HeroOverlay
  evidenceOverlay: EvidenceOverlay
  outputSignal: OutputSignalOverlay
  viewSize: { width: number; height: number }
  clientViewLinks: [Line, Line, Line, Line]
  viewContentLinks: [Line, Line, Line, Line]
  signalMeshes: [Mesh, Mesh, Mesh]
  signalGlowPath: Path
  signalHighlightPath: Path
  materialFocus?: CoordinateMappingFocus
}

function planeRange(
  name: PlaneName,
  probe: CoordinateProbe,
  clientRange: Readonly<Rect>,
  shape: Readonly<Rect>,
): Rect {
  return frameCoordinatePlaneRange(
    name,
    coordinatePlaneRange(name, COORDINATE_PLANE_DOMAIN, probe, clientRange),
    shape,
  )
}

function pointOnPlane(value: Coordinate, range: Rect) {
  return projectCoordinatePlanePoint(value, range, COORDINATE_PLANE_DOMAIN)
}

function rectOnPlane(value: Rect, range: Rect): Rect {
  return projectCoordinatePlaneRect(value, range, COORDINATE_PLANE_DOMAIN)
}

function planeIsActive(name: PlaneName, mappingFocus: CoordinateMappingFocus) {
  return name === "view"
    || (mappingFocus === "view-client" && name === "client")
    || (mappingFocus === "content-view" && name === "content")
}

function clippedRect(rect: Rect, clip: Rect): Rect | undefined {
  const x = Math.max(clip.x, rect.x)
  const y = Math.max(clip.y, rect.y)
  const right = Math.min(clip.x + clip.width, rect.x + rect.width)
  const bottom = Math.min(clip.y + clip.height, rect.y + rect.height)
  if (right <= x || bottom <= y) return undefined
  return { x, y, width: right - x, height: bottom - y }
}

function pointIsInsidePlane(point: Readonly<Coordinate>) {
  return point.x >= 0
    && point.y >= 0
    && point.x <= COORDINATE_PLANE_DOMAIN.width
    && point.y <= COORDINATE_PLANE_DOMAIN.height
}

function cornerSegments(rect: Readonly<Rect>): LineSegment[] {
  const length = Math.min(12, rect.width / 4, rect.height / 4)
  const left = rect.x
  const right = rect.x + rect.width
  const top = rect.y
  const bottom = rect.y + rect.height
  return [
    { x1: left, y1: top + length, x2: left, y2: top },
    { x1: left, y1: top, x2: left + length, y2: top },
    { x1: right - length, y1: top, x2: right, y2: top },
    { x1: right, y1: top, x2: right, y2: top + length },
    { x1: right, y1: bottom - length, x2: right, y2: bottom },
    { x1: right, y1: bottom, x2: right - length, y2: bottom },
    { x1: left + length, y1: bottom, x2: left, y2: bottom },
    { x1: left, y1: bottom, x2: left, y2: bottom - length },
  ]
}

function mixChannel(start: number, end: number, progress: number) {
  return Math.round(start + (end - start) * progress)
}

function planeEdgeProfileColor(
  colors: typeof PLANE_EDGE_PROFILE_COLORS[PlaneName],
  index: number,
) {
  const segment = index <= 5
    ? { startIndex: 0, endIndex: 5, start: colors.inside, end: colors.peak }
    : index <= 10
      ? { startIndex: 5, endIndex: 10, start: colors.peak, end: colors.peak }
      : index <= 16
        ? { startIndex: 10, endIndex: 16, start: colors.peak, end: colors.body }
        : index <= 28
          ? { startIndex: 16, endIndex: 28, start: colors.body, end: colors.secondary }
        : { startIndex: 28, endIndex: 31, start: colors.secondary, end: colors.outside }
  const progress = (index - segment.startIndex) / (segment.endIndex - segment.startIndex)
  return segment.start.map((channel, channelIndex) =>
    mixChannel(channel, segment.end[channelIndex], progress))
}

function planeEdgeDirectionAlpha(
  name: PlaneName,
  outward: Readonly<{ x: number; y: number }>,
  index: number,
) {
  const horizontal: PlaneEdgeDirection = outward.x < 0 ? "left" : "right"
  const vertical: PlaneEdgeDirection = outward.y < 0 ? "top" : "bottom"
  const horizontalWeight = Math.abs(outward.x)
  const verticalWeight = Math.abs(outward.y)
  const weight = horizontalWeight + verticalWeight
  const horizontalAlpha = PLANE_EDGE_PROFILE_ALPHA[name][horizontal][index]
  const verticalAlpha = PLANE_EDGE_PROFILE_ALPHA[name][vertical][index]
  return Math.round((
    horizontalAlpha * horizontalWeight + verticalAlpha * verticalWeight
  ) / weight)
}

/** One direction-aware profile texture owns every edge and rounded transition. */
export function createCoordinatePlaneEdgeTexture(name: PlaneName) {
  const width = PLANE_EDGE_PROFILE_WIDTH
  const height = 4 * (PANEL_BEVEL_SEGMENTS + 1)
  const data = new Uint8Array(width * height * 4)
  const colors = PLANE_EDGE_PROFILE_COLORS[name]
  const cornerStarts = [-Math.PI / 2, 0, Math.PI / 2, Math.PI]
  for (let row = 0; row < height; row += 1) {
    const corner = Math.floor(row / (PANEL_BEVEL_SEGMENTS + 1))
    const cornerIndex = row % (PANEL_BEVEL_SEGMENTS + 1)
    const angle = cornerStarts[corner]
      + Math.PI / 2 * cornerIndex / PANEL_BEVEL_SEGMENTS
    const outward = { x: Math.cos(angle), y: Math.sin(angle) }
    for (let index = 0; index < width; index += 1) {
      const color = planeEdgeProfileColor(colors, index)
      const offset = (row * width + index) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        data[offset + channel] = color[channel]
      }
      data[offset + 3] = planeEdgeDirectionAlpha(name, outward, index)
    }
  }
  return new ImageTexture({ width, height, alphaMode: "straight", data })
}

export function coordinatePlaneEdgeSupport(
  name: PlaneName,
  outward: Readonly<{ x: number; y: number }>,
): PlaneEdgeSupport {
  const supports = PLANE_EDGE_OPTICAL_SUPPORT[name]
  const horizontal = outward.x < 0 ? supports.left : supports.right
  const vertical = outward.y < 0 ? supports.top : supports.bottom
  return {
    inside: Math.hypot(
      outward.x * horizontal.inside,
      outward.y * vertical.inside,
    ),
    outside: Math.hypot(
      outward.x * horizontal.outside,
      outward.y * vertical.outside,
    ),
  }
}

function opticalPlaneVolumeProfileGeometry(
  name: PlaneName,
  plane: PlaneDefinition,
  basis: PlaneBasis,
  viewSize: Readonly<{ width: number; height: number }>,
) {
  const geometry = planeVolumeProfileGeometry(
    plane,
    basis,
    PANEL_THICKNESS,
    PANEL_BEVEL_RADIUS,
    PANEL_BEVEL_SEGMENTS,
  )
  const positions = Array.from(geometry.positions)
  const pairCount = positions.length / 6
  const uniquePairCount = pairCount - 1
  const frontWorld = (index: number): Vector3 => [
    positions[index * 6],
    positions[index * 6 + 1],
    positions[index * 6 + 2],
  ]
  const frontScreen = Array.from({ length: uniquePairCount }, (_, index) =>
    projectCoordinateWorldPoint(viewSize.width, viewSize.height, frontWorld(index)))

  for (let index = 0; index < uniquePairCount; index += 1) {
    const front = frontScreen[index]
    const previous = frontScreen[(index - 1 + uniquePairCount) % uniquePairCount]
    const next = frontScreen[(index + 1) % uniquePairCount]
    const tangent = { x: next.x - previous.x, y: next.y - previous.y }
    const tangentLength = Math.hypot(tangent.x, tangent.y)
    const outward = {
      x: tangent.y / tangentLength,
      y: -tangent.x / tangentLength,
    }
    const support = coordinatePlaneEdgeSupport(name, outward)
    // The transparent ribbon is an optical rim, so keep it just in front of
    // the transmissive face. Otherwise the face composites over the inward
    // shoulder and collapses the authored profile into a one-pixel outline.
    const profileDepth = -frontWorld(index)[2] - 0.001
    const expandedBack = screenCoordinateToWorldAtDepth(
      viewSize.width,
      viewSize.height,
      {
        x: front.x + outward.x * support.outside,
        y: front.y + outward.y * support.outside,
      },
      profileDepth,
    )
    const expandedFront = screenCoordinateToWorldAtDepth(
      viewSize.width,
      viewSize.height,
      {
        x: front.x - outward.x * support.inside,
        y: front.y - outward.y * support.inside,
      },
      profileDepth,
    )
    positions[index * 6] = expandedFront[0]
    positions[index * 6 + 1] = expandedFront[1]
    positions[index * 6 + 2] = expandedFront[2]
    positions[index * 6 + 3] = expandedBack[0]
    positions[index * 6 + 4] = expandedBack[1]
    positions[index * 6 + 5] = expandedBack[2]
  }
  for (let offset = 0; offset < 6; offset += 1) {
    positions[uniquePairCount * 6 + offset] = positions[offset]
  }
  return { ...geometry, positions }
}

function gridPosition(index: number, count: number, size: number) {
  return index / (count + 1) * size
}

function gridSegments(name: PlaneName, plane: PlaneDefinition): LineSegment[] {
  const insets = PLANE_PLOT_INSETS[name]
  const plotBottom = plane.height - insets.bottom
  const vertical = Array.from({ length: PLANE_GRID_COLUMNS }, (_, index) => {
    const x = gridPosition(index + 1, PLANE_GRID_COLUMNS, plane.width)
    return x >= insets.left && x <= plane.width - insets.right
      ? { x1: x, y1: PLANE_PLOT_TOP, x2: x, y2: plotBottom }
      : undefined
  }).filter((segment): segment is LineSegment => segment !== undefined)
  const horizontal = Array.from({ length: PLANE_GRID_ROWS }, (_, index) => {
    const y = PLANE_PLOT_TOP + gridPosition(
      index + 1,
      PLANE_GRID_ROWS,
      plotBottom - PLANE_PLOT_TOP,
    )
    return { x1: insets.left, y1: y, x2: plane.width - insets.right, y2: y }
  })
  return [...vertical, ...horizontal]
}

function updateMeshRect(
  mesh: Mesh,
  plane: PlaneRuntime,
  rect: Rect | undefined,
  depthOffset: number,
) {
  mesh.setGeometry(rectMeshGeometry(plane, plane.basis, rect, depthOffset))
}

function updateMeshLines(
  mesh: Mesh,
  plane: PlaneRuntime,
  segments: readonly (LineSegment | undefined)[],
  width: number,
  depthOffset: number,
) {
  mesh.setGeometry(lineMeshGeometry(plane, plane.basis, segments, width, depthOffset))
}

function createPlaneRuntime(
  name: PlaneName,
  plane: PlaneDefinition,
  detailsVisible: boolean,
  viewSize: Readonly<{ width: number; height: number }>,
): { meshes: Mesh[]; overlays: Array<Circle | Line | Polygon | Rectangle | StayText>; runtime: PlaneRuntime } {
  const basis = createPlaneBasis(plane)
  const presentation = planePresentationMetrics(plane)
  const plotInsets = PLANE_PLOT_INSETS[name]
  const plotBottom = plane.height - plotInsets.bottom
  const axisColor = rgba(222, 228, 225, 0.9)
  const face = createPlaneBevelFaceProfile(plane, basis, PANEL_BEVEL_RADIUS)
  const frameFill = new Mesh({
    geometry: roundedRectMeshGeometry(
      plane,
      basis,
      face.rect,
      face.radiusX,
      face.radiusY,
      PANEL_BEVEL_SEGMENTS,
      PANEL_FACE_OFFSET,
    ),
    material: coordinatePlaneGlassMaterial(name, plane.fill, PANEL_FACE_ALPHA_SCALE),
    // The shallow facade owns a restrained transmissive projection so the
    // physical pane connects to the shared floor without becoming opaque.
    castShadow: true,
    receiveShadow: false,
  })
  const frameOptics = new Mesh({
    geometry: rectMeshGeometry(plane, basis, {
      x: PLANE_FACE_INSET,
      y: PLANE_FACE_INSET,
      width: plane.width - PLANE_FACE_INSET * 2,
      height: plane.height - PLANE_FACE_INSET * 2,
    }, PLANE_FACE_DEPTH_OFFSET),
    material: new TransparentImageMaterial({
      texture: createCoordinatePlaneFaceTexture(name, plane, basis, viewSize),
    }),
    castShadow: false,
    receiveShadow: false,
  })
  const frameDepth = new Mesh({
    geometry: opticalPlaneVolumeProfileGeometry(
      name,
      plane,
      basis,
      viewSize,
    ),
    material: new TransparentImageMaterial({
      texture: createCoordinatePlaneEdgeTexture(name),
    }),
    castShadow: false,
    receiveShadow: false,
  })
  const grid = new Mesh({
    geometry: lineMeshGeometry(plane, basis, gridSegments(name, plane).map((segment) => ({
      ...segment,
      x1: Math.max(face.rect.x, Math.min(face.rect.x + face.rect.width, segment.x1)),
      x2: Math.max(face.rect.x, Math.min(face.rect.x + face.rect.width, segment.x2)),
      y1: Math.max(face.rect.y, Math.min(face.rect.y + face.rect.height, segment.y1)),
      y2: Math.max(face.rect.y, Math.min(face.rect.y + face.rect.height, segment.y2)),
    })), 0.5, PANEL_FACE_OFFSET + 0.006),
    material: unlitMaterial(rgba(200, 210, 207, 1)),
  })
  const axes = new Mesh({
    geometry: lineMeshGeometry(plane, basis, [
      { x1: plotInsets.left, y1: plotBottom, x2: plane.width - plotInsets.right, y2: plotBottom },
      { x1: plane.width - plotInsets.right, y1: plotBottom, x2: plane.width - plotInsets.right - 7, y2: plotBottom - 4 },
      { x1: plane.width - plotInsets.right, y1: plotBottom, x2: plane.width - plotInsets.right - 7, y2: plotBottom + 4 },
      { x1: plotInsets.left, y1: PLANE_PLOT_TOP, x2: plotInsets.left, y2: plotBottom },
      { x1: plotInsets.left, y1: plotBottom, x2: plotInsets.left - 4, y2: plotBottom - 7 },
      { x1: plotInsets.left, y1: plotBottom, x2: plotInsets.left + 4, y2: plotBottom - 7 },
    ], 1, PANEL_FACE_OFFSET + 0.008),
    material: unlitMaterial(axisColor),
  })
  const shapeFill = new Mesh({
    geometry: emptyTexturedMeshGeometry(),
    material: new ImageMaterial({ texture: createCoordinateShapeTexture() }),
  })
  const shapeEdges = new Mesh({
    geometry: emptyMeshGeometry(),
    material: unlitMaterial(rgba(76, 111, 196, 1)),
  })
  const viewportEdges = name === "content" ? new Mesh({
    geometry: emptyMeshGeometry(),
    material: unlitMaterial(rgba(47, 138, 104, 0.34)),
  }) : undefined

  const title = new StayText({
    x: plane.labelX / PLANE_TITLE_SCALE_X,
    y: plane.labelY,
    text: name.toUpperCase(),
    layer: OVERLAY_LAYER,
    zIndex: 20,
    textAlign: "center",
    textBaseline: "bottom",
    font: {
      fontFamily: '"Avenir Next Condensed", "Arial Narrow", "Helvetica Neue", "PingFang SC", sans-serif',
      size: presentation.titleSize,
      fontWeight: 400,
    },
    fillConfig: { color: plane.stroke },
  })
  const rangePoint = projectPlanePoint(plane, { x: 28, y: 38 })
  const rangeValue = new StayText({
    ...rangePoint,
    text: "",
    layer: OVERLAY_LAYER,
    zIndex: 5,
    textBaseline: "top",
    font: { size: presentation.rangeSize, fontWeight: 600 },
    fillConfig: { color: rgba(68, 78, 76, detailsVisible ? 0.82 : 0) },
  })
  const axisTick = (align: CanvasTextAlign, baseline: CanvasTextBaseline) => new StayText({
    x: 0,
    y: 0,
    text: "",
    layer: OVERLAY_LAYER,
    zIndex: 8,
    textAlign: align,
    textBaseline: baseline,
    font: {
      fontFamily: '"Arial Narrow", "Helvetica Neue", "PingFang SC", sans-serif',
      size: Math.max(12, Math.min(16, presentation.rangeSize + 1)),
      fontWeight: 400,
    },
    fillConfig: { color: rgba(38, 48, 45, detailsVisible ? 0.94 : 0) },
  })
  const axisLabel = (text: "x" | "y", align: CanvasTextAlign, baseline: CanvasTextBaseline) => new StayText({
    x: 0,
    y: 0,
    text,
    layer: OVERLAY_LAYER,
    zIndex: 8,
    textAlign: align,
    textBaseline: baseline,
    font: {
      fontFamily: '"Arial Narrow", "Helvetica Neue", "PingFang SC", sans-serif',
      size: Math.max(11, Math.min(14, presentation.rangeSize)),
      fontWeight: 500,
    },
    fillConfig: { color: rgba(38, 48, 45, detailsVisible ? 0.94 : 0) },
  })
  const xAxis = axisLabel("x", "left", "middle")
  const yAxis = axisLabel("y", "center", "bottom")
  const xTicks = Array.from({ length: 5 }, () => axisTick("center", "top"))
  const yTicks = Array.from({ length: 4 }, () => axisTick("right", "middle"))
  const pointGuide = new Line({
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    layer: OVERLAY_LAYER,
    zIndex: 9,
    strokeConfig: { color: rgba(229, 109, 72, 0), lineWidth: 1.2, dash: [5, 6] },
  })
  const pointHalo = new Circle({
    x: 0,
    y: 0,
    radius: presentation.dotRadius + 3,
    layer: OVERLAY_LAYER,
    zIndex: 19,
    fillConfig: { color: rgba(229, 109, 72, 0) },
    strokeConfig: { color: rgba(229, 109, 72, 0), lineWidth: 1.4 },
  })
  const dot = new Circle({
    x: 0,
    y: 0,
    radius: presentation.dotRadius,
    layer: OVERLAY_LAYER,
    zIndex: 20,
    fillConfig: { color: rgba(255, 252, 250, 0) },
    strokeConfig: { color: rgba(255, 255, 255, 0), lineWidth: 0 },
  })
  const value = new StayText({
    x: 0,
    y: 0,
    text: "(0, 0)",
    layer: OVERLAY_LAYER,
    zIndex: 21,
    textBaseline: "bottom",
    font: {
      fontFamily: '"Arial Narrow", "Helvetica Neue", "PingFang SC", sans-serif',
      size: presentation.detailSize,
      fontWeight: 400,
    },
    fillConfig: { color: { ...colors.orange, a: detailsVisible ? 0.84 : 0 } },
  })
  const groundLeft = projectPlanePoint(plane, { x: 12, y: plane.height })
  const groundRight = projectPlanePoint(plane, { x: plane.width - 12, y: plane.height })
  const groundWidth = Math.abs(groundRight.x - groundLeft.x)
  const groundBleed = presentation.projectedWidth * 0.06
  const groundGlow = new Rectangle({
    x: Math.min(groundLeft.x, groundRight.x) - groundBleed,
    y: (groundLeft.y + groundRight.y) / 2 + 1,
    width: groundWidth + groundBleed * 2,
    height: Math.max(44, presentation.projectedWidth * 0.16),
    layer: GROUND_LAYER,
    zIndex: -20,
    filter: "blur(22px)",
    fillConfig: { color: PLANE_GROUND_GLOW[name] },
    strokeConfig: { color: rgba(0, 0, 0, 0), lineWidth: 0 },
  })
  const direction = groundRight.x >= groundLeft.x ? 1 : -1
  const contactInset = 7 * direction
  const contactShadow = new Polygon({
    points: [
      { x: groundLeft.x + contactInset, y: groundLeft.y - 1 + PLANE_CONTACT_SHADOW[name].offset },
      { x: groundRight.x - contactInset, y: groundRight.y - 1 + PLANE_CONTACT_SHADOW[name].offset },
      { x: groundRight.x - contactInset, y: groundRight.y + 3 + PLANE_CONTACT_SHADOW[name].offset },
      { x: groundLeft.x + contactInset, y: groundLeft.y + 3 + PLANE_CONTACT_SHADOW[name].offset },
    ],
    layer: GROUND_LAYER,
    zIndex: -19,
    filter: `blur(${PLANE_CONTACT_SHADOW[name].blur}px)`,
    fillConfig: { color: rgba(46, 43, 39, PLANE_CONTACT_SHADOW[name].alpha) },
    strokeConfig: { color: rgba(0, 0, 0, 0), lineWidth: 0 },
  })
  const reflectionDepth = Math.max(34, Math.min(54, presentation.projectedWidth * 0.14))
  const reflectionInset = Math.abs(groundRight.x - groundLeft.x) * 0.055 * direction
  const reflectionColor = PLANE_GROUND_GLOW[name]
  const reflections = ([
    { depth: reflectionDepth, alphaScale: 0.26, blur: 10 },
    { depth: reflectionDepth * 0.62, alphaScale: 0.19, blur: 7 },
    { depth: reflectionDepth * 0.28, alphaScale: 0.12, blur: 4 },
  ] as const).map(({ depth, alphaScale, blur }) => new Polygon({
    points: [
      { x: groundLeft.x + contactInset, y: groundLeft.y + 4 },
      { x: groundRight.x - contactInset, y: groundRight.y + 4 },
      { x: groundRight.x - reflectionInset, y: groundRight.y + depth },
      { x: groundLeft.x + reflectionInset, y: groundLeft.y + depth },
    ],
    layer: GROUND_LAYER,
    zIndex: -21,
    filter: `blur(${blur}px)`,
    fillConfig: { color: { ...reflectionColor, a: reflectionColor.a * alphaScale } },
    strokeConfig: { color: rgba(0, 0, 0, 0), lineWidth: 0 },
  }))
  const reflectionEdges = ([
    { offset: 8, alphaScale: 0.18, lineWidth: 1.2 },
    { offset: 18, alphaScale: 0.07, lineWidth: 0.9 },
  ] as const).map(({ offset, alphaScale, lineWidth }) => {
    const edgeInset = offset * 0.28 * direction
    return new Line({
      x1: groundLeft.x + contactInset + edgeInset,
      y1: groundLeft.y + offset,
      x2: groundRight.x - contactInset - edgeInset,
      y2: groundRight.y + offset,
      layer: GROUND_LAYER,
      zIndex: -20,
      strokeConfig: {
        color: { ...reflectionColor, a: reflectionColor.a * alphaScale },
        lineWidth,
        lineCap: "round",
      },
    })
  })
  const meshes: PlaneMeshes = {
    frameFill,
    frameOptics,
    frameDepth,
    grid,
    axes,
    shapeFill,
    shapeEdges,
    viewportEdges,
  }
  const overlay: PlaneOverlay = {
    groundGlow,
    contactShadow,
    reflections,
    reflectionEdges,
    title,
    rangeValue,
    xAxis,
    yAxis,
    xTicks,
    yTicks,
    pointGuide,
    pointHalo,
    dot,
    value,
  }
  return {
    meshes: Object.values(meshes).filter((mesh): mesh is Mesh => Boolean(mesh)),
    overlays: Object.values(overlay).flatMap((shape) => shape)
      .filter((shape): shape is Circle | Line | Polygon | Rectangle | StayText => Boolean(shape)),
    runtime: { ...plane, basis, detailsVisible, meshes, overlay, presentation },
  }
}

function updateShapeProjection(plane: PlaneRuntime, rect: Rect) {
  const clip = { x: 0, y: 0, width: plane.width, height: plane.height }
  const visible = clippedRect(rect, clip)
  updateMeshRect(plane.meshes.shapeFill, plane, visible, PANEL_FACE_OFFSET + 0.012)
  updateMeshLines(
    plane.meshes.shapeEdges,
    plane,
    clippedRectEdges(rect, clip),
    1,
    PANEL_FACE_OFFSET + 0.014,
  )
}

function updateViewportProjection(plane: PlaneRuntime, rect: Rect, projectionVisible: boolean) {
  const { viewportEdges } = plane.meshes
  if (!viewportEdges) return
  const clip = { x: 0, y: 0, width: plane.width, height: plane.height }
  const visibleRect = clippedRect(rect, clip)
  updateMeshLines(
    viewportEdges,
    plane,
    projectionVisible && visibleRect ? cornerSegments(visibleRect) : [],
    1,
    PANEL_FACE_OFFSET + 0.01,
  )
}

function updateCornerLinks(
  lines: [Line, Line, Line, Line],
  fromPlane: PlaneRuntime,
  fromRect: Rect,
  toPlane: PlaneRuntime,
  toRect: Rect,
  active: boolean,
  visible = true,
) {
  if (!visible) {
    lines.forEach((line) => line.update({
      strokeConfig: { color: rgba(78, 89, 104, 0), lineWidth: 0.8, dash: [4, 6] },
    }))
    return
  }
  correspondingRectCorners(fromRect, toRect).forEach(({ from, to }, index) => {
    const start = projectPlanePoint(fromPlane, from)
    const end = projectPlanePoint(toPlane, to)
    lines[index].update({
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      strokeConfig: {
        color: rgba(78, 89, 104, active ? 0.045 : 0.012),
        lineWidth: active ? 0.9 : 0.7,
        dash: [4, 6],
      },
    })
  })
}

function updateScenePanelGeometry(
  panel: PhysicalPanelRuntime,
  frame: Readonly<Rect>,
  runtime: StackRuntime,
  thickness: number,
  bevelRadius: number,
  bevelSegments: number,
): PlaneDefinition {
  const definition = createFrontFacingPanelDefinition(
    runtime.viewSize.width,
    runtime.viewSize.height,
    frame,
    runtime.definitions,
  )
  const basis = createPlaneBasis(definition)
  const worldWidth = Math.hypot(
    definition.worldQuad[1][0] - definition.worldQuad[0][0],
    definition.worldQuad[1][1] - definition.worldQuad[0][1],
    definition.worldQuad[1][2] - definition.worldQuad[0][2],
  )
  const worldHeight = Math.hypot(
    definition.worldQuad[3][0] - definition.worldQuad[0][0],
    definition.worldQuad[3][1] - definition.worldQuad[0][1],
    definition.worldQuad[3][2] - definition.worldQuad[0][2],
  )
  const safeBevelRadius = Math.min(bevelRadius, worldWidth * 0.18, worldHeight * 0.18)
  const face = createPlaneBevelFaceProfile(definition, basis, safeBevelRadius)
  panel.face.setGeometry(roundedRectMeshGeometry(
    definition,
    basis,
    face.rect,
    face.radiusX,
    face.radiusY,
    bevelSegments,
    thickness / 2,
  ))
  panel.depth.setGeometry(planeVolumeGeometry(
    definition,
    basis,
    thickness,
    safeBevelRadius,
    bevelSegments,
  ))
  return definition
}

function createPanelText({
  color,
  family,
  size,
  weight = 600,
  align = "left",
}: {
  color: ReturnType<typeof rgba>
  family?: string
  size: number
  weight?: number
  align?: CanvasTextAlign
}) {
  return new StayText({
    x: 0,
    y: 0,
    text: "",
    layer: OVERLAY_LAYER,
    zIndex: 40,
    textAlign: align,
    textBaseline: "top",
    font: {
      fontFamily: family ?? '"Helvetica Neue", "PingFang SC", sans-serif',
      size,
      fontWeight: weight,
    },
    fillConfig: { color },
  })
}

function createOutputPanelOverlay(): OutputPanelOverlay {
  return {
    headerTone: new Rectangle({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      layer: OVERLAY_LAYER,
      zIndex: -15,
      filter: "blur(18px)",
      fillConfig: { color: rgba(150, 160, 158, 0) },
      strokeConfig: { color: rgba(0, 0, 0, 0), lineWidth: 0 },
    }),
    topRefraction: new Line({
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      layer: OVERLAY_LAYER,
      zIndex: 36,
      strokeConfig: { color: rgba(73, 82, 79, 0), lineWidth: 4, lineCap: "round" },
    }),
    bottomRefraction: new Line({
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      layer: OVERLAY_LAYER,
      zIndex: 36,
      strokeConfig: { color: rgba(255, 255, 252, 0), lineWidth: 1.4, lineCap: "round" },
    }),
    label: createPanelText({ color: rgba(200, 76, 48, 1), size: 10, weight: 760 }),
    title: createPanelText({
      color: rgba(28, 33, 32, 1),
      family: '"Arial Narrow", "Helvetica Neue", "PingFang SC", sans-serif',
      size: 22,
      weight: 680,
    }),
    range: createPanelText({ color: rgba(67, 79, 76, 0.78), size: 11, weight: 620 }),
  }
}

function drawMetalKnobPath(this: Circle, { context }: ShapeDrawProps) {
  context.beginPath()
  context.arc(this.x, this.y, this.radius, 0, Math.PI * 2)
}

function strokeMetalKnob({ context }: ShapeDrawProps) {
  context.stroke()
}

function fillMetalKnobConicFacets(
  context: DrawCanvasContext,
  x: number,
  y: number,
  radius: number,
) {
  const facets = context.createConicGradient(-Math.PI, x, y)
  facets.addColorStop(0, "rgb(153 157 154)")
  facets.addColorStop(0.125, "rgb(105 110 107)")
  facets.addColorStop(0.22, "rgb(145 150 147)")
  facets.addColorStop(0.24, "rgb(198 202 198)")
  facets.addColorStop(0.28, "rgb(240 242 237)")
  facets.addColorStop(0.375, "rgb(250 251 247)")
  facets.addColorStop(0.47, "rgb(212 216 211)")
  facets.addColorStop(0.51, "rgb(153 158 154)")
  facets.addColorStop(0.625, "rgb(118 123 120)")
  facets.addColorStop(0.74, "rgb(151 156 152)")
  facets.addColorStop(0.76, "rgb(168 173 168)")
  facets.addColorStop(0.875, "rgb(205 208 202)")
  facets.addColorStop(1, "rgb(153 157 154)")
  context.fillStyle = facets
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
}

function addMetalKnobReflection(
  context: DrawCanvasContext,
  bounds: Readonly<{ x: number; y: number; radius: number }>,
  reflection: Readonly<{
    centerX: number
    centerY: number
    color: string
    reach: number
  }>,
) {
  const gradient = context.createRadialGradient(
    reflection.centerX,
    reflection.centerY,
    0,
    reflection.centerX,
    reflection.centerY,
    reflection.reach,
  )
  gradient.addColorStop(0, reflection.color)
  gradient.addColorStop(1, "rgb(150 154 152 / 0)")
  context.fillStyle = gradient
  context.fillRect(
    bounds.x - bounds.radius,
    bounds.y - bounds.radius,
    bounds.radius * 2,
    bounds.radius * 2,
  )
}

function fillMetalKnobRadialFacets(
  context: DrawCanvasContext,
  x: number,
  y: number,
  radius: number,
) {
  const bounds = { x, y, radius }
  addMetalKnobReflection(context, bounds, {
    centerX: x + 7,
    centerY: y - 4.5,
    color: "rgb(255 255 252 / 1)",
    reach: 9.5,
  })
  addMetalKnobReflection(context, bounds, {
    centerX: x - 6,
    centerY: y + 6,
    color: "rgb(246 248 244 / 0.58)",
    reach: 10,
  })
  addMetalKnobReflection(context, bounds, {
    centerX: x - 7,
    centerY: y - 5,
    color: "rgb(38 43 41 / 0.64)",
    reach: 9,
  })
  addMetalKnobReflection(context, bounds, {
    centerX: x + 7,
    centerY: y + 6,
    color: "rgb(48 54 51 / 0.52)",
    reach: 9,
  })
}

function fillMetalKnobEdge(
  context: DrawCanvasContext,
  x: number,
  y: number,
  radius: number,
) {
  const edge = context.createRadialGradient(x, y, radius * 0.42, x, y, radius)
  edge.addColorStop(0, "rgb(36 42 39 / 0)")
  edge.addColorStop(0.72, "rgb(36 42 39 / 0.02)")
  edge.addColorStop(1, "rgb(36 42 39 / 0.24)")
  context.fillStyle = edge
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2)

  const highlight = context.createRadialGradient(x + 6, y - 3.5, 0, x + 6, y - 3.5, 2.6)
  highlight.addColorStop(0, "rgb(255 255 255 / 1)")
  highlight.addColorStop(1, "rgb(255 255 255 / 0)")
  context.fillStyle = highlight
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
}

function fillMetalKnob(this: Circle, { context }: ShapeDrawProps) {
  const { x, y, radius } = this
  context.save()
  context.clip()
  context.fillStyle = "rgb(150 154 152)"
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2)

  if (typeof context.createConicGradient === "function") {
    fillMetalKnobConicFacets(context, x, y, radius)
  } else {
    fillMetalKnobRadialFacets(context, x, y, radius)
  }

  fillMetalKnobEdge(context, x, y, radius)
  context.restore()
}

function drawConsoleLeftInnerRefraction(this: Rectangle, { context }: ShapeDrawProps) {
  const intensity = this.fillConfig.color.a
  const stop = (pixel: number) => pixel / this.width
  const white = (alpha: number) => `rgb(255 255 255 / ${alpha * intensity})`
  const shade = (alpha: number) => `rgb(65 72 70 / ${alpha * intensity})`
  const gradient = context.createLinearGradient(this.x, 0, this.x + this.width, 0)
  gradient.addColorStop(stop(0), white(0.06))
  gradient.addColorStop(stop(1), white(0.15))
  gradient.addColorStop(stop(2), white(0.3))
  gradient.addColorStop(stop(4), white(0.4))
  gradient.addColorStop(stop(6), white(0.42))
  gradient.addColorStop(stop(8), white(0.35))
  gradient.addColorStop(stop(10), white(0.2))
  gradient.addColorStop(stop(12), white(0.1))
  gradient.addColorStop(stop(13), "rgb(65 72 70 / 0)")
  gradient.addColorStop(stop(15), shade(0.015))
  gradient.addColorStop(stop(18), shade(0.03))
  gradient.addColorStop(stop(18), shade(0.055))
  gradient.addColorStop(stop(32), shade(0.055))
  gradient.addColorStop(stop(44), shade(0.025))
  gradient.addColorStop(1, "rgb(65 72 70 / 0)")
  context.fillStyle = gradient
  context.fillRect(this.x, this.y, this.width, this.height)
}

function createConsolePanelOverlay(): ConsolePanelOverlay {
  const label = () => createPanelText({ color: rgba(71, 82, 79, 0.72), size: 12, weight: 520, align: "center" })
  const value = () => createPanelText({ color: rgba(27, 32, 31, 0.9), size: 20, weight: 560, align: "center" })
  const detail = () => createPanelText({ color: rgba(83, 94, 91, 0.72), size: 12, weight: 560, align: "center" })
  const divider = () => new Line({
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    layer: OVERLAY_LAYER,
    zIndex: 38,
    strokeConfig: { color: rgba(64, 75, 72, 0.16), lineWidth: 1 },
  })
  const controlText = (size = 11, align: CanvasTextAlign = "left") => createPanelText({
    color: rgba(42, 51, 49, 0.78),
    family: '"Helvetica Neue", "PingFang SC", sans-serif',
    size,
    weight: 520,
    align,
  })
  const rail = (color: ReturnType<typeof rgba>, width: number) => new Line({
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    layer: OVERLAY_LAYER,
    zIndex: 40,
    strokeConfig: { color, lineWidth: width },
  })
  const knob = () => new Circle({
    x: 0,
    y: 0,
    radius: 12,
    layer: OVERLAY_LAYER,
    zIndex: 42,
    fillConfig: { color: rgba(150, 154, 152, 0.98) },
    strokeConfig: { color: rgba(80, 88, 85, 0.48), lineWidth: 1.35 },
    stateDrawFuncMap: {
      default: {
        commonDraw: drawMetalKnobPath,
        stroke: strokeMetalKnob,
        fill: fillMetalKnob,
      },
    },
  })
  const physicalButton = () => new Rectangle({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    layer: OVERLAY_LAYER,
    zIndex: 39,
    fillConfig: { color: rgba(250, 248, 242, 0) },
    strokeConfig: { color: rgba(69, 78, 75, 0), lineWidth: 1 },
  })
  const buttonBevel = () => new Line({
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    layer: OVERLAY_LAYER,
    zIndex: 40,
    strokeConfig: { color: rgba(255, 255, 255, 0), lineWidth: 1 },
  })
  const fitIconLine = () => new Line({
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    layer: OVERLAY_LAYER,
    zIndex: 41,
    strokeConfig: { color: rgba(20, 23, 22, 0), lineWidth: 1.5, lineCap: "butt" },
  })
  const coordinateNode = () => new Circle({
    x: 0,
    y: 0,
    radius: 0,
    layer: OVERLAY_LAYER,
    zIndex: 41,
    fillConfig: { color: rgba(71, 82, 79, 0) },
  })
  return {
    topHighlight: new Line({
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      layer: OVERLAY_LAYER,
      zIndex: 38,
      strokeConfig: { color: rgba(255, 255, 252, 0), lineWidth: 1.4 },
    }),
    bottomHighlight: new Line({
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      layer: OVERLAY_LAYER,
      zIndex: 37,
      strokeConfig: { color: rgba(255, 255, 255, 0), lineWidth: 1 },
    }),
    topInnerRefraction: new Line({
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      layer: OVERLAY_LAYER,
      zIndex: 37,
      strokeConfig: { color: rgba(65, 72, 70, 0), lineWidth: 1.5, lineCap: "round" },
    }),
    leftInnerRefraction: new Rectangle({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      layer: OVERLAY_LAYER,
      zIndex: 37,
      fillConfig: { color: rgba(65, 72, 70, 0) },
      strokeConfig: { color: rgba(0, 0, 0, 0), lineWidth: 0 },
      stateDrawFuncMap: {
        default: {
          fill: drawConsoleLeftInnerRefraction,
        },
      },
    }),
    firstDivider: divider(),
    secondDivider: divider(),
    heading: createPanelText({ color: rgba(35, 39, 38, 0.82), size: 14, weight: 520 }),
    status: createPanelText({ color: rgba(33, 113, 76, 0.88), size: 12, weight: 650, align: "right" }),
    clientLabel: label(),
    clientValue: value(),
    clientDetail: detail(),
    firstArrow: createPanelText({ color: rgba(73, 82, 80, 0.66), size: 18, weight: 600, align: "center" }),
    viewLabel: label(),
    viewValue: value(),
    viewDetail: detail(),
    secondArrow: createPanelText({ color: rgba(73, 82, 80, 0.66), size: 18, weight: 600, align: "center" }),
    contentLabel: label(),
    contentValue: value(),
    contentDetail: detail(),
    displayHeading: createPanelText({ color: rgba(35, 39, 38, 0.82), size: 14, weight: 520 }),
    displayResetButton: physicalButton(),
    displayReset: controlText(12, "center"),
    scaleXLabel: controlText(13),
    scaleXValue: createPanelText({ color: rgba(48, 91, 184, 0.9), size: 14, weight: 560, align: "right" }),
    scaleXUnit: createPanelText({ color: rgba(25, 29, 28, 1), size: 14, weight: 400 }),
    scaleYLabel: controlText(13),
    scaleYValue: createPanelText({ color: rgba(48, 91, 184, 0.9), size: 14, weight: 560, align: "right" }),
    translateXLabel: controlText(12),
    translateXValue: controlText(13, "center"),
    translateYLabel: controlText(12),
    translateYValue: controlText(13, "center"),
    scaleXRail: rail(rgba(67, 76, 73, 0.24), 3),
    scaleXFill: rail(rgba(54, 105, 221, 0.88), 3),
    scaleXKnob: knob(),
    scaleYRail: rail(rgba(67, 76, 73, 0.24), 3),
    scaleYFill: rail(rgba(54, 105, 221, 0.88), 3),
    scaleYKnob: knob(),
    viewportHeading: createPanelText({ color: rgba(35, 39, 38, 0.82), size: 14, weight: 520 }),
    viewportStatus: createPanelText({ color: rgba(58, 68, 65, 0.72), size: 11, weight: 520, align: "right" }),
    viewportSeparator: createPanelText({ color: rgba(25, 29, 28, 1), size: 18, weight: 400, align: "center" }),
    viewportHeight: createPanelText({ color: rgba(35, 76, 171, 1), size: 18, weight: 400 }),
    viewportScale: createPanelText({ color: rgba(45, 52, 50, 1), size: 14, weight: 400 }),
    viewportButtons: Array.from({ length: 5 }, physicalButton),
    viewportButtonBevels: Array.from({ length: 20 }, buttonBevel),
    viewportActions: ["zoom in", "zoom out", "pan", "reset", "Evidence"].map(() => controlText(12, "center")),
    viewportFitIconLines: Array.from({ length: 12 }, fitIconLine),
    viewportActionLabels: ["zoom in", "zoom out", "pan", "reset", "Evidence"].map(() => controlText(9, "center")),
    coordinateRail: rail(rgba(66, 78, 74, 0), 1),
    coordinateNodes: Array.from({ length: 3 }, coordinateNode),
  }
}

function createConsoleControlTargets(): ConsoleControlTargets {
  const target = () => new Rectangle({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    layer: OVERLAY_LAYER,
    zIndex: 35,
    fillConfig: { color: rgba(255, 255, 255, 0.001) },
    strokeConfig: { color: rgba(255, 255, 255, 0), lineWidth: 0 },
  })
  return {
    "css-reset": target(),
    "scale-x": target(),
    "scale-y": target(),
    "translate-x": target(),
    "translate-y": target(),
    "zoom-in": target(),
    "zoom-out": target(),
    pan: target(),
    "viewport-reset": target(),
    evidence: target(),
  }
}

function updateConsoleControlTargets(
  targets: ConsoleControlTargets,
  frame: Readonly<Rect>,
) {
  const rects = coordinateConsoleControlRects(frame)
  for (const name of Object.keys(targets) as CoordinateConsoleControlName[]) {
    const rect = rects[name]
    targets[name].update({
      ...rect,
      fillConfig: { color: rgba(255, 255, 255, 0.001) },
      strokeConfig: { color: rgba(255, 255, 255, 0), lineWidth: 0 },
    })
  }
}

function createHeroOverlay(): HeroOverlay {
  const textShape = (
    size: number,
    color: ReturnType<typeof rgba>,
    weight: number,
    fontFamily: string,
  ) => new StayText({
    x: 0,
    y: 0,
    text: "",
    layer: OVERLAY_LAYER,
    zIndex: 45,
    textBaseline: "top",
    font: { fontFamily, size, fontWeight: weight },
    fillConfig: { color },
  })
  const sans = '"Helvetica Neue", "PingFang SC", "Noto Sans CJK SC", sans-serif'
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  return {
    eyebrow: textShape(11, rgba(33, 113, 76, 1), 760, mono),
    titleFirst: textShape(68, rgba(25, 29, 28, 1), 520, sans),
    titleSecond: textShape(68, rgba(25, 29, 28, 1), 520, sans),
    subtitle: textShape(15, rgba(65, 72, 70, 0.76), 420, sans),
  }
}

function updateHeroOverlay(
  overlay: HeroOverlay,
  viewSize: Readonly<{ width: number; height: number }>,
  copy: Readonly<{ eyebrow: string; first: string; second: string; compact: string; subtitle: string }>,
) {
  const short = viewSize.height <= 740
  const narrow = viewSize.width <= 900
  const x = short ? 12 : narrow ? 18 : 56
  const titleSize = short ? 19 : narrow ? 32 : 48
  const titleWeight = short ? 600 : 400
  const titleY = short ? 10 : narrow ? 32 : 68
  const lineGap = titleSize * 0.98
  overlay.eyebrow.update({
    x,
    y: short ? 0 : narrow ? 12 : 28,
    text: "",
  })
  overlay.titleFirst.update({
    x,
    y: titleY,
    text: short ? copy.compact : copy.first,
    font: { fontFamily: '"Helvetica Neue", "PingFang SC", "Noto Sans CJK SC", sans-serif', size: titleSize, fontWeight: titleWeight },
  })
  overlay.titleSecond.update({
    x,
    y: titleY + lineGap,
    text: short ? "" : copy.second,
    font: { fontFamily: '"Helvetica Neue", "PingFang SC", "Noto Sans CJK SC", sans-serif', size: titleSize, fontWeight: titleWeight },
  })
  overlay.subtitle.update({
    x,
    y: titleY + lineGap * 2 + (narrow ? 5 : 10),
    // Keep the accessible copy in the semantic DOM, but preserve the open
    // installation gap between the hero and the first physical pane.
    text: "",
  })
}

function createEvidenceOverlay(): EvidenceOverlay {
  const evidenceText = (
    size: number,
    weight: number,
  ) => new StayText({
    x: 0,
    y: 0,
    text: "",
    layer: OVERLAY_LAYER,
    zIndex: 49,
    textBaseline: "top",
    font: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", size, fontWeight: weight },
    fillConfig: { color: rgba(232, 238, 235, 0) },
  })
  return {
    panel: new Rectangle({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      layer: OVERLAY_LAYER,
      zIndex: 48,
      fillConfig: { color: rgba(246, 243, 235, 0) },
      strokeConfig: { color: rgba(78, 96, 89, 0), lineWidth: 1 },
    }),
    heading: evidenceText(14, 740),
    intro: evidenceText(10, 650),
    labels: Array.from({ length: 7 }, () => evidenceText(10, 650)),
    values: Array.from({ length: 7 }, () => evidenceText(12, 680)),
  }
}

function updateEvidenceOverlay(
  overlay: EvidenceOverlay,
  open: boolean,
  viewSize: Readonly<{ width: number; height: number }>,
  probe: CoordinateProbe,
  viewport: Readonly<ViewportState>,
  shapeProjection: Readonly<CoordinateEvidence["shape"]>,
  visibleContent: Readonly<Rect>,
  eventEvidence: Readonly<CoordinateEventEvidence> | undefined,
  copy: Readonly<{ heading: string; intro: string; labels: readonly string[] }>,
) {
  const width = Math.min(380, Math.max(280, viewSize.width - 40))
  const height = Math.min(430, Math.max(300, viewSize.height - 230))
  const x = viewSize.width - width - 20
  const y = 20
  const alpha = open ? 1 : 0
  overlay.panel.update({
    x,
    y,
    width,
    height,
      fillConfig: { color: rgba(239, 238, 232, open ? 0.97 : 0) },
      strokeConfig: { color: rgba(83, 98, 93, open ? 0.3 : 0), lineWidth: 1 },
  })
  overlay.heading.update({ x: x + 16, y: y + 15, text: open ? copy.heading : "", fillConfig: { color: rgba(28, 33, 32, alpha) } })
  overlay.intro.update({ x: x + 16, y: y + 40, text: open ? copy.intro : "", fillConfig: { color: rgba(71, 82, 79, alpha * 0.86) } })
  const values = [
    formatRect(shapeProjection.content),
    `${Math.round(viewport.x)}, ${Math.round(viewport.y)} / ${Math.round(viewport.scale * 100)}%`,
    `${Math.round(probe.viewSize.width)}×${Math.round(probe.viewSize.height)} → ${Math.round(probe.surface.width)}×${Math.round(probe.surface.height)}`,
    formatRect(shapeProjection.view),
    formatRect(shapeProjection.client),
    formatRect(visibleContent),
    eventEvidence
      ? `${formatPoint(eventEvidence.point)} · ${eventEvidence.matchesFacade ? "MATCH" : "MISMATCH"}`
      : "AWAITING EVENT",
  ]
  const rowGap = Math.max(43, Math.min(56, (height - 76) / values.length))
  overlay.labels.forEach((label, index) => {
    const rowY = y + 66 + index * rowGap
    label.update({
      x: x + 16,
      y: rowY,
      text: open ? copy.labels[index] : "",
      fillConfig: { color: rgba(81, 91, 88, alpha * 0.82) },
    })
    overlay.values[index].update({
      x: x + 16,
      y: rowY + 16,
      text: open ? values[index] : "",
      fillConfig: { color: rgba(28, 33, 32, alpha) },
    })
  })
}

function updateOutputPanelOverlay(
  overlay: OutputPanelOverlay,
  frame: Readonly<Rect> | undefined,
  _visibleContent: Readonly<Rect>,
) {
  if (!frame) return
  const left = frame.x + 20
  const headerHeight = Math.min(90, frame.height * 0.22)
  overlay.headerTone.update({
    x: frame.x + 12,
    y: frame.y + 5,
    width: frame.width * 0.42,
    height: Math.max(28, headerHeight - 10),
    fillConfig: { color: rgba(150, 160, 158, 0.12) },
  })
  overlay.topRefraction.update({
    x1: frame.x + 5,
    y1: frame.y + 1.5,
    x2: frame.x + frame.width - 5,
    y2: frame.y + 1.5,
    strokeConfig: { color: rgba(73, 82, 79, 0.19), lineWidth: 2.5, lineCap: "round" },
  })
  overlay.bottomRefraction.update({
    x1: frame.x + 5,
    y1: frame.y + frame.height - 1.5,
    x2: frame.x + frame.width - 5,
    y2: frame.y + frame.height - 1.5,
    strokeConfig: { color: rgba(255, 255, 252, 0.31), lineWidth: 1.8, lineCap: "round" },
  })
  overlay.label.update({ x: left, y: frame.y + 17, text: "" })
  overlay.title.update({
    x: left,
    y: frame.y + 22,
    text: "LIVE CANVAS",
    font: {
      fontFamily: '"Helvetica Neue", "PingFang SC", sans-serif',
      size: 17,
      fontWeight: 380,
    },
  })
  overlay.range.update({
    x: left,
    y: frame.y + 70,
    text: "",
  })
}

function updateConsolePanelOverlay(
  overlay: ConsolePanelOverlay,
  frame: Readonly<Rect> | undefined,
  probe: CoordinateProbe,
  viewport: Readonly<ViewportState>,
  cssDisplay: Readonly<{ offsetX: number; offsetY: number; scaleX: number; scaleY: number }>,
  eventEvidence: Readonly<CoordinateEventEvidence> | undefined,
) {
  if (!frame) return
  const compact = coordinateConsoleIsCompact(frame)
  const spacious = frame.height >= 130
  const tall = frame.height >= 190
  const controlRects = coordinateConsoleControlRects(frame)
  const left = compact ? frame.x + 20 : frame.x + frame.width * 0.497
  const right = compact ? frame.x + frame.width - 20 : frame.x + frame.width * 0.755
  const width = right - left
  const centers = [left + width * 0.14, left + width * 0.5, left + width * 0.86]
  const arrows = [left + width * 0.32, left + width * 0.68]
  const headingY = frame.y + (compact ? 8 : 27)
  const labelY = frame.y + (compact ? 23 : 47)
  const valueY = frame.y + (compact ? 40 : 92.5)
  const detailY = frame.y + (compact ? 68 : 118)

  overlay.topHighlight.update({
    x1: frame.x + 10,
    y1: frame.y + 1.5,
    x2: frame.x + frame.width - 10,
    y2: frame.y + 1.5,
    strokeConfig: { color: rgba(255, 255, 252, compact ? 0 : 0.325), lineWidth: 1.4 },
  })
  overlay.bottomHighlight.update({
    x1: frame.x + 14,
    y1: frame.y + frame.height - 2,
    x2: frame.x + frame.width - 14,
    y2: frame.y + frame.height - 2,
    strokeConfig: { color: rgba(255, 255, 255, compact ? 0 : 0.43), lineWidth: 1.3 },
  })
  overlay.topInnerRefraction.update({
    x1: frame.x + 12,
    y1: frame.y + 7,
    x2: frame.x + frame.width - 12,
    y2: frame.y + 7,
    strokeConfig: { color: rgba(65, 72, 70, compact ? 0 : 0.11), lineWidth: 1.5 },
  })
  overlay.leftInnerRefraction.update({
    x: frame.x - 3,
    y: frame.y + 12,
    width: 64,
    height: frame.height - 24,
    fillConfig: { color: rgba(65, 72, 70, compact ? 0 : 1) },
  })

  overlay.firstDivider.update({
    x1: frame.x + frame.width * 0.47,
    y1: frame.y + (compact ? 14 : 30),
    x2: frame.x + frame.width * 0.47,
    y2: frame.y + frame.height - (compact ? 14 : 34),
    strokeConfig: { color: rgba(64, 75, 72, compact ? 0 : 0.1), lineWidth: 1 },
  })
  overlay.secondDivider.update({
    x1: frame.x + frame.width * 0.795,
    y1: frame.y + (compact ? 14 : 30),
    x2: frame.x + frame.width * 0.795,
    y2: frame.y + frame.height - (compact ? 14 : 34),
    strokeConfig: { color: rgba(64, 75, 72, compact ? 0 : 0.1), lineWidth: 1 },
  })

  overlay.heading.update({
    x: left,
    y: headingY,
    text: compact ? "COORDINATE FACADE" : "",
    font: { size: compact ? 13 : 18, fontWeight: 520 },
  })
  overlay.status.update({
    x: right,
    y: headingY + 2,
    text: compact
      ? eventEvidence?.matchesFacade === false ? "● MISMATCH" : ""
      : "",
    font: { size: compact ? 10 : 12, fontWeight: 650 },
    fillConfig: { color: eventEvidence?.matchesFacade === false
      ? rgba(229, 109, 72, 1)
      : rgba(33, 113, 76, eventEvidence ? 0.96 : 0.72) },
  })
  const clientLabelFont = { size: compact ? 10 : 18, fontWeight: compact ? 520 : 400 }
  const viewLabelFont = { size: compact ? 10 : 18, fontWeight: compact ? 520 : 400 }
  const contentLabelFont = { size: compact ? 10 : 18, fontWeight: compact ? 520 : 420 }
  const clientValueFont = { size: compact ? 17 : 20, fontWeight: compact ? 560 : 350 }
  const viewValueFont = { size: compact ? 17 : 20, fontWeight: compact ? 560 : 350 }
  const contentValueFont = { size: compact ? 17 : 20, fontWeight: compact ? 560 : 350 }
  const arrowFont = { size: compact ? 14 : 16, fontWeight: 520 }
  overlay.clientLabel.update({
    x: centers[0],
    y: labelY,
    text: "CLIENT",
    font: clientLabelFont,
    fillConfig: { color: rgba(28, 32, 31, compact ? 0.72 : 1) },
  })
  overlay.clientValue.update({
    x: centers[0],
    y: valueY,
    text: formatPoint(probe.client),
    font: clientValueFont,
    fillConfig: { color: rgba(22, 22, 22, compact ? 0.92 : 1) },
  })
  overlay.firstArrow.update({ x: arrows[0], y: valueY - 1, text: "→", font: arrowFont })
  overlay.viewLabel.update({
    x: centers[1],
    y: labelY,
    text: "VIEW",
    font: viewLabelFont,
    fillConfig: { color: rgba(35, 76, 171, compact ? 0.94 : 1) },
  })
  overlay.viewValue.update({
    x: centers[1],
    y: valueY,
    text: formatPoint(probe.view),
    font: viewValueFont,
    fillConfig: { color: rgba(35, 76, 171, compact ? 0.94 : 1) },
  })
  overlay.clientDetail.update({
    x: centers[0],
    y: detailY,
    text: "",
    font: { size: 12, fontWeight: 620 },
    fillConfig: { color: rgba(63, 74, 71, 0.82) },
  })
  overlay.viewDetail.update({
    x: centers[1],
    y: detailY,
    text: "",
    font: { size: 12, fontWeight: 620 },
    fillConfig: { color: rgba(63, 74, 71, 0.82) },
  })
  overlay.secondArrow.update({ x: arrows[1], y: valueY - 1, text: "→", font: arrowFont })
  overlay.contentLabel.update({
    x: centers[2],
    y: labelY,
    text: "CONTENT",
    font: contentLabelFont,
    fillConfig: { color: rgba(31, 103, 66, compact ? 0.94 : 1) },
  })
  overlay.contentValue.update({
    x: centers[2],
    y: valueY,
    text: formatPoint(probe.content),
    font: contentValueFont,
    fillConfig: { color: rgba(31, 103, 66, compact ? 0.94 : 1) },
  })
  overlay.contentDetail.update({
    x: centers[2],
    y: detailY,
    text: "",
    font: { size: 12, fontWeight: 620 },
    fillConfig: { color: rgba(63, 74, 71, 0.82) },
  })

  const controlsAlpha = compact ? 0 : 1
  const controlColor = rgba(25, 29, 28, compact ? 0.78 : 1)
  const coordinateRailY = valueY + 33
  overlay.coordinateRail.update({
    x1: centers[0],
    y1: coordinateRailY,
    x2: centers[2],
    y2: coordinateRailY,
    strokeConfig: { color: rgba(66, 78, 74, 0), lineWidth: 1 },
  })
  const coordinateNodeColors = [
    rgba(45, 87, 96, 0.84),
    rgba(48, 91, 184, 0.84),
    rgba(39, 119, 76, 0.84),
  ] as const
  overlay.coordinateNodes.forEach((node, index) => node.update({
    x: centers[index],
    y: coordinateRailY,
    radius: 0,
    fillConfig: { color: coordinateNodeColors[index] },
  }))
  const leftStart = frame.x + (compact ? 18 : frame.width * 0.048)
  const leftEnd = frame.x + (compact ? frame.width * 0.3 : frame.width * 0.202)
  const railStart = compact ? leftStart + 74 : leftStart
  const railEnd = compact ? leftEnd - 54 : leftEnd
  const railPosition = (scale: number) => railStart
    + (railEnd - railStart) * Math.max(0, Math.min(1, (scale - 0.5) / 0.5))
  const firstRailY = frame.y + (compact ? spacious ? 68 : 49 : frame.height * 0.63)
  const secondRailY = firstRailY
  const visualRailY = compact ? firstRailY : firstRailY - 3
  overlay.displayHeading.update({
    x: leftStart,
    y: frame.y + (compact ? spacious ? 17 : 13 : 25),
    text: compact ? "" : "CSS DISPLAY",
    font: {
      fontFamily: 'Arial, "Helvetica Neue", "PingFang SC", sans-serif',
      size: compact ? 13 : 14,
      fontWeight: 400,
    },
    fillConfig: { color: rgba(25, 28, 27, compact ? 0 : 1) },
  })
  overlay.displayResetButton.update({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    fillConfig: { color: rgba(250, 248, 242, 0) },
    strokeConfig: { color: rgba(69, 78, 75, 0), lineWidth: 1 },
  })
  overlay.displayReset.update({
    x: 0,
    y: 0,
    text: "",
    font: { size: 7, fontWeight: 620 },
  })
  overlay.scaleXLabel.update({
    x: leftStart,
    y: firstRailY + 12,
    text: compact ? "" : "0.50",
    font: { size: compact ? 11 : 15.5, fontWeight: 400 },
    fillConfig: { color: rgba(45, 52, 50, compact ? 0 : 1) },
  })
  const scaleValueCenter = (railStart + railEnd) / 2
  overlay.scaleXValue.update({
    x: compact ? leftEnd : scaleValueCenter + 12,
    y: compact ? firstRailY - 7 : firstRailY - 50,
    text: compact ? "" : cssDisplay.scaleX.toFixed(2),
    textAlign: "right",
    font: { size: 20, fontWeight: compact ? 520 : 350 },
    fillConfig: { color: rgba(35, 76, 171, compact ? 0 : 1) },
  })
  overlay.scaleXUnit.update({
    x: scaleValueCenter + 18,
    y: compact ? firstRailY - 7 : firstRailY - 50,
    text: compact ? "" : "×",
    textAlign: "left",
    font: { size: 20, fontWeight: compact ? 520 : 350 },
    fillConfig: { color: rgba(25, 29, 28, compact ? 0 : 1) },
  })
  overlay.scaleYLabel.update({
    x: railEnd,
    y: firstRailY + 12,
    text: compact ? "" : "1.00",
    textAlign: "right",
    font: { size: compact ? 11 : 15.5, fontWeight: 400 },
    fillConfig: { color: rgba(45, 52, 50, compact ? 0 : 1) },
  })
  overlay.scaleYValue.update({ x: 0, y: 0, text: "" })
  const viewportRailStart = frame.x + frame.width * 0.258
  const viewportRailEnd = frame.x + frame.width * 0.429
  overlay.translateXLabel.update({
    x: viewportRailStart,
    y: secondRailY + 12,
    text: compact ? "" : "20%",
    font: { size: compact ? 12 : 15.5, fontWeight: 400 },
    fillConfig: { color: rgba(45, 52, 50, compact ? 0 : 1) },
  })
  overlay.translateXValue.update({
    x: viewportRailEnd,
    y: secondRailY + 12,
    text: compact ? "" : "300%",
    textAlign: "right",
    font: { size: compact ? 13 : 15.5, fontWeight: 400 },
    fillConfig: { color: rgba(45, 52, 50, compact ? 0 : 1) },
  })
  overlay.translateYLabel.update({ x: 0, y: 0, text: "" })
  overlay.translateYValue.update({ x: 0, y: 0, text: "" })
  const updateRail = (
    rail: Line,
    fill: Line,
    knobShape: Circle,
    start: number,
    end: number,
    y: number,
    position: number,
    accent: ReturnType<typeof rgba>,
  ) => {
    rail.update({
      x1: start,
      y1: y,
      x2: end,
      y2: y,
      strokeConfig: { color: rgba(82, 91, 88, controlsAlpha * 0.26), lineWidth: 3 },
    })
    fill.update({
      x1: start,
      y1: y,
      x2: position,
      y2: y,
      strokeConfig: { color: { ...accent, a: accent.a * controlsAlpha }, lineWidth: 3 },
    })
    knobShape.update({
      x: position,
      y,
      fillConfig: { color: rgba(150, 154, 152, controlsAlpha * 0.98) },
      strokeConfig: { color: rgba(80, 88, 85, controlsAlpha * 0.48), lineWidth: 1.35 },
    })
  }
  updateRail(
    overlay.scaleXRail,
    overlay.scaleXFill,
    overlay.scaleXKnob,
    railStart,
    railEnd,
    visualRailY,
    railPosition(cssDisplay.scaleX),
    rgba(0, 60, 160, 0.96),
  )
  const viewportRailPosition = viewportRailStart + (viewportRailEnd - viewportRailStart)
    * Math.max(0, Math.min(1, Math.log(viewport.scale / 0.2) / Math.log(3 / 0.2)))
  updateRail(
    overlay.scaleYRail,
    overlay.scaleYFill,
    overlay.scaleYKnob,
    viewportRailStart,
    viewportRailEnd,
    visualRailY,
    viewportRailPosition,
    rgba(0, 60, 160, 0.96),
  )

  const viewportLeft = compact ? frame.x + frame.width * 0.735 : viewportRailStart
  overlay.viewportHeading.update({
    x: viewportLeft,
    y: frame.y + (compact ? spacious ? 17 : 13 : 25),
    text: compact ? "" : "V\u200cI\u200cE\u200cW\u200cP\u200cO\u200cR\u200cT",
    font: {
      fontFamily: 'Arial, "Helvetica Neue", "PingFang SC", sans-serif',
      size: compact ? 13 : 14.25,
      fontWeight: 400,
    },
    fillConfig: { color: rgba(25, 28, 27, compact ? 0 : 1) },
  })
  const viewportValueCenter = (viewportRailStart + viewportRailEnd) / 2
  const viewportValueY = frame.y + (compact ? spacious ? 19 : 15 : 51)
  const viewportValueFont = { size: compact ? 11 : 20, fontWeight: compact ? 520 : 350 }
  overlay.viewportStatus.update({
    x: compact ? frame.x + frame.width - 18 : viewportValueCenter - 8,
    y: viewportValueY,
    text: compact ? "" : `${Math.round(probe.viewSize.width)}`,
    textAlign: "right",
    font: viewportValueFont,
    fillConfig: { color: rgba(35, 76, 171, compact ? 0 : 1) },
  })
  overlay.viewportSeparator.update({
    x: viewportValueCenter + 2,
    y: viewportValueY,
    text: compact ? "" : "×",
    textAlign: "center",
    font: viewportValueFont,
    fillConfig: { color: rgba(25, 29, 28, compact ? 0 : 1) },
  })
  overlay.viewportHeight.update({
    x: viewportValueCenter + 14,
    y: viewportValueY,
    text: compact ? "" : `${Math.round(probe.viewSize.height)}`,
    textAlign: "left",
    font: viewportValueFont,
    fillConfig: { color: rgba(35, 76, 171, compact ? 0 : 1) },
  })
  overlay.viewportScale.update({
    x: viewportValueCenter + 55,
    y: viewportValueY + 1,
    text: compact ? "" : `· ${Math.round(viewport.scale * 100)}%`,
    textAlign: "left",
    font: { size: compact ? 11 : 14, fontWeight: 400 },
    fillConfig: { color: rgba(45, 52, 50, compact ? 0 : 1) },
  })
  const actionNames = compact
    ? (["css-reset", "zoom-in", "zoom-out", "viewport-reset", "evidence"] as const)
    : (["css-reset", "viewport-reset", "pan", "pan", "pan"] as const)
  overlay.viewportButtons.forEach((button, index) => {
    const name = actionNames[index]
    const rect = controlRects[name]
    const visible = rect.width > 0 && rect.height > 0 && name !== "pan"
    const evidence = name === "evidence"
    const buttonSize = visible
      ? Math.min(compact ? 32 : 64, Math.min(rect.width, rect.height))
      : 0
    button.update({
      x: rect.x + (rect.width - buttonSize) / 2,
      y: rect.y + (rect.height - buttonSize) / 2,
      width: buttonSize,
      height: buttonSize,
      fillConfig: { color: evidence
        ? rgba(238, 246, 240, visible ? 0.22 : 0)
        : rgba(250, 248, 242, visible ? 0.24 : 0) },
      strokeConfig: { color: evidence
        ? rgba(39, 119, 76, visible ? 0.38 : 0)
        : rgba(69, 78, 75, visible ? 0.32 : 0), lineWidth: 1 },
    })
    const left = rect.x + (rect.width - buttonSize) / 2 + 2
    const top = rect.y + (rect.height - buttonSize) / 2 + 2
    const right = left + buttonSize - 4
    const bottom = top + buttonSize - 4
    const [topBevel, leftBevel, bottomBevel, rightBevel] = overlay.viewportButtonBevels.slice(
      index * 4,
      index * 4 + 4,
    )
    const bevelGap = compact ? 0 : 5
    const light = rgba(255, 255, 252, visible ? 0.32 : 0)
    const shade = rgba(67, 74, 72, visible ? 0.14 : 0)
    topBevel.update({
      x1: left + bevelGap,
      y1: top,
      x2: right - bevelGap,
      y2: top,
      strokeConfig: { color: light, lineWidth: 1 },
    })
    leftBevel.update({
      x1: left,
      y1: top + bevelGap,
      x2: left,
      y2: bottom - bevelGap,
      strokeConfig: { color: light, lineWidth: 1 },
    })
    bottomBevel.update({
      x1: left + bevelGap,
      y1: bottom,
      x2: right - bevelGap,
      y2: bottom,
      strokeConfig: { color: shade, lineWidth: 1 },
    })
    rightBevel.update({
      x1: right,
      y1: top + bevelGap,
      x2: right,
      y2: bottom - bevelGap,
      strokeConfig: { color: shade, lineWidth: 1 },
    })
  })
  overlay.viewportActions.forEach((action, index) => {
    const name = actionNames[index]
    const rect = controlRects[name]
    action.update({
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2 - (compact ? 5 : index === 0 ? 14 : index === 1 ? 16 : 8),
      text: compact
        ? ["CSS", "ZOOM +", "ZOOM −", "RESET", "PROOF"][index]
        : name === "css-reset" ? "□" : "",
      font: {
        size: compact ? 9 : index === 0 ? 32 : index === 1 ? 36 : 24,
        fontWeight: compact ? 400 : index === 1 ? 300 : 400,
      },
      fillConfig: { color: controlColor },
    })
  })
  const fitRect = controlRects["viewport-reset"]
  const fitCenter = {
    x: fitRect.x + fitRect.width / 2,
    y: fitRect.y + fitRect.height / 2 - 0.5,
  }
  const fitLeft = fitCenter.x - 11.5
  const fitRight = fitCenter.x + 11.5
  const fitTop = fitCenter.y - 10.5
  const fitBottom = fitCenter.y + 10.5
  const fitInner = 2.5
  const fitHead = 5
  const fitSegments = [
    [fitCenter.x - fitInner, fitCenter.y - fitInner, fitLeft, fitTop],
    [fitLeft, fitTop, fitLeft + fitHead, fitTop],
    [fitLeft, fitTop, fitLeft, fitTop + fitHead],
    [fitCenter.x + fitInner, fitCenter.y - fitInner, fitRight, fitTop],
    [fitRight, fitTop, fitRight - fitHead, fitTop],
    [fitRight, fitTop, fitRight, fitTop + fitHead],
    [fitCenter.x - fitInner, fitCenter.y + fitInner, fitLeft, fitBottom],
    [fitLeft, fitBottom, fitLeft + fitHead, fitBottom],
    [fitLeft, fitBottom, fitLeft, fitBottom - fitHead],
    [fitCenter.x + fitInner, fitCenter.y + fitInner, fitRight, fitBottom],
    [fitRight, fitBottom, fitRight - fitHead, fitBottom],
    [fitRight, fitBottom, fitRight, fitBottom - fitHead],
  ] as const
  overlay.viewportFitIconLines.forEach((line, index) => {
    const [x1, y1, x2, y2] = fitSegments[index]
    line.update({
      x1,
      y1,
      x2,
      y2,
      strokeConfig: {
        color: rgba(20, 23, 22, compact || fitRect.width <= 0 ? 0 : 1),
        lineWidth: 1.5,
        lineCap: "butt",
      },
    })
  })
  const actionLabels = compact
    ? ["", "", "", "", ""]
    : ["RESET", "FIT TO VIEW", "", "", ""]
  overlay.viewportActionLabels.forEach((label, index) => {
    const name = actionNames[index]
    const rect = controlRects[name]
    label.update({
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height + (compact ? -8 : 13),
      text: rect.width > 0 && name !== "pan" ? actionLabels[index] : "",
      font: { size: compact ? 8 : 14, fontWeight: 400 },
      fillConfig: { color: rgba(20, 23, 22, compact ? 0.78 : 1) },
    })
  })
}

export function CoordinateStack({
  clientRange,
  coordinateEvidence,
  cssDisplay,
  evidenceOpen,
  eventEvidence,
  mappingFocus,
  onCssDisplayChange,
  onEvidenceToggle,
  onSceneLayoutChange,
  onViewportAction,
  probe,
  viewport,
}: {
  clientRange: Readonly<Rect>
  coordinateEvidence?: Readonly<CoordinateEvidence>
  cssDisplay: Readonly<{ offsetX: number; offsetY: number; scaleX: number; scaleY: number }>
  evidenceOpen: boolean
  eventEvidence?: Readonly<CoordinateEventEvidence>
  mappingFocus: CoordinateMappingFocus
  onCssDisplayChange: (patch: Partial<{ offsetX: number; offsetY: number; scaleX: number; scaleY: number }>) => void
  onEvidenceToggle: () => void
  onSceneLayoutChange?: (layout: Readonly<CoordinateSceneLayout>) => void
  onViewportAction: (action: CoordinateViewportAction) => void
  probe: CoordinateProbe
  viewport: Readonly<ViewportState>
}) {
  const { text } = useI18n()
  const runtimeRef = useRef<StackRuntime>()
  const clientToRootViewRef = useRef<(point: Readonly<Coordinate>) => Coordinate>()
  const sceneMountGenerationRef = useRef(0)
  const [runtimeGeneration, setRuntimeGeneration] = useState(0)
  useEffect(() => () => {
    sceneMountGenerationRef.current += 1
  }, [])
  const camera = useMemo(() => createCoordinateCamera(), [])
  const environment = useMemo(() => createCoordinateEnvironment(), [])
  const lighting = useMemo(() => createCoordinateLights(true), [])
  const layers = useMemo<CanvasLayerConfig[]>(() => [
    {
      backend: "webgl2",
      camera,
    },
    { backend: "canvas2d" },
    {
      backend: "webgl2",
      camera,
      environment,
      lights: lighting,
    },
    { backend: "canvas2d" },
  ], [camera, environment, lighting])
  const controlListeners = useMemo<ListenerProps[]>(() => {
    const selector = COORDINATE_CONSOLE_CONTROL_NAMES
      .map((name) => `.coordinate-control-${name}`)
      .join("|")
    return [
      {
        name: "coordinate-console-controls",
        selector: ".stay-canvas",
        event: "mousedown",
        callback: ({ e, tools }) => {
          const runtime = runtimeRef.current
          if (!runtime || !hasPointerPosition(e)) return
          const [target] = tools.getContainPointChildren({
            point: e.point,
            selector,
            returnFirst: true,
            withRoot: false,
          })
          const name = target?.className.replace("coordinate-control-", "") as CoordinateConsoleControlName | undefined
          if (!name) return
          if (name === "css-reset") {
            onCssDisplayChange({ offsetX: 0, offsetY: 0, scaleX: 0.85, scaleY: 0.85 })
            return
          }
          if (name === "scale-x" || name === "scale-y") {
            const frame = createCoordinateSceneLayout(runtime.viewSize.width, runtime.viewSize.height).console
            const rect = coordinateConsoleControlRects(frame)[name]
            const railStart = rect.x + 8
            const railEnd = rect.x + rect.width - 8
            const ratio = Math.max(0, Math.min(1, (e.point.x - railStart) / (railEnd - railStart)))
            onCssDisplayChange({
              ...(name === "scale-x"
                ? {
                    scaleX: Math.round((0.5 + ratio * 0.5) * 100) / 100,
                    scaleY: Math.round((0.5 + ratio * 0.5) * 100) / 100,
                  }
                : { scaleY: Math.round((0.5 + ratio * 0.5) * 100) / 100 }),
            })
            return
          }
          if (name === "translate-x" || name === "translate-y") {
            const frame = createCoordinateSceneLayout(runtime.viewSize.width, runtime.viewSize.height).console
            const rect = coordinateConsoleControlRects(frame)[name]
            if (name === "translate-x") {
              const railStart = rect.x + 8
              const railEnd = rect.x + rect.width - 8
              const ratio = Math.max(0, Math.min(1, (e.point.x - railStart) / (railEnd - railStart)))
              const current = Math.log(viewport.scale / 0.2) / Math.log(3 / 0.2)
              onViewportAction(ratio >= current ? "zoom-in" : "zoom-out")
              return
            }
            const direction = e.point.x < rect.x + rect.width / 2 ? -1 : 1
            onCssDisplayChange({
              offsetY: Math.max(0, Math.min(96, cssDisplay.offsetY + direction * 8)),
            })
            return
          }
          if (name === "evidence") {
            onEvidenceToggle()
            return
          }
          onViewportAction(name === "viewport-reset" ? "reset" : name)
        },
      },
    ]
  }, [cssDisplay.offsetY, onCssDisplayChange, onEvidenceToggle, onViewportAction, viewport.scale])

  const update = (sample: CoordinateProbe, currentViewport: Readonly<ViewportState>) => {
    const runtime = runtimeRef.current
    if (!runtime || !coordinateEvidence) return
    const { shape: shapeProjection, visibleContent } = coordinateEvidence
    const sceneLayout = createCoordinateSceneLayout(runtime.viewSize.width, runtime.viewSize.height)
    const points: Partial<Record<PlaneName, Coordinate>> = {}
    const worldPoints: Partial<Record<PlaneName, Vector3>> = {}
    const ranges = {} as Record<PlaneName, Rect>
    const materialFocusChanged = runtime.materialFocus !== mappingFocus

    for (const name of Object.keys(runtime.planes) as PlaneName[]) {
      const plane = runtime.planes[name]
      const plotInsets = PLANE_PLOT_INSETS[name]
      const plotBottom = plane.height - plotInsets.bottom
      const range = planeRange(name, sample, clientRange, shapeProjection[name])
      ranges[name] = range
      const value = sample[name]
      const localPoint = pointOnPlane(value, range)
      const contentPoint = pointIsInsidePlane(localPoint)
        ? projectPlanePoint(plane, localPoint)
        : undefined
      const localShape = rectOnPlane(shapeProjection[name], range)
      const isActive = planeIsActive(name, mappingFocus)

      plane.overlay.rangeValue.update({
        text: "",
      })
      const tickColor = rgba(38, 48, 45, plane.detailsVisible ? 0.94 : 0)
      plane.overlay.xAxis.update({
        ...projectPlanePoint(plane, {
          x: plane.width - plotInsets.right + 7,
          y: plotBottom,
        }),
        fillConfig: { color: tickColor },
      })
      plane.overlay.yAxis.update({
        ...projectPlanePoint(plane, {
          x: plotInsets.left - 12,
          y: PLANE_PLOT_TOP - 8,
        }),
        fillConfig: { color: tickColor },
      })
      plane.overlay.xTicks.forEach((tick, index, ticks) => {
        const localX = plotInsets.left + 8
          + (plane.width - plotInsets.left - plotInsets.right - 16) * index / (ticks.length - 1)
        const localY = plotBottom + 8
        const position = projectPlanePoint(plane, { x: localX, y: localY })
        tick.update({
          ...position,
          text: String(Math.round((range.x + range.width * localX / plane.width) / 10) * 10),
          fillConfig: { color: tickColor },
        })
      })
      plane.overlay.yTicks.forEach((tick, index, ticks) => {
        const localX = plotInsets.left - 8
        const localY = plotBottom
          - (plotBottom - PLANE_PLOT_TOP) * index / (ticks.length - 1)
        const position = projectPlanePoint(plane, { x: localX, y: localY })
        tick.update({
          x: position.x - 3,
          y: position.y,
          text: String(Math.round((range.y + range.height * localY / plane.height) / 10) * 10),
          fillConfig: { color: tickColor },
        })
      })

      if (materialFocusChanged) {
        const material = coordinatePlaneGlassMaterial(
          name,
          plane.fill,
          (isActive ? 1 : 0.82) * PANEL_FACE_ALPHA_SCALE,
        )
        plane.meshes.frameFill.setMaterial(material)
      }
      plane.overlay.title.update({
        fillConfig: { color: { ...plane.stroke, a: isActive ? 0.9 : 0.72 } },
      })
      const guideStart = contentPoint
        ? projectPlanePoint(plane, { x: localPoint.x, y: PLANE_PLOT_TOP })
        : undefined
      const guideEnd = contentPoint
        ? projectPlanePoint(plane, { x: localPoint.x, y: plotBottom })
        : undefined
      plane.overlay.pointGuide.update({
        x1: guideStart?.x ?? 0,
        y1: guideStart?.y ?? 0,
        x2: guideEnd?.x ?? 0,
        y2: guideEnd?.y ?? 0,
        strokeConfig: {
          color: rgba(229, 109, 72, contentPoint ? 0.22 : 0),
          lineWidth: 1,
          dash: [5, 6],
        },
      })
      plane.overlay.dot.update({
        ...(contentPoint ?? { x: 0, y: 0 }),
        radius: plane.presentation.dotRadius,
        fillConfig: { color: rgba(255, 252, 250, contentPoint ? 0.99 : 0) },
        strokeConfig: { color: rgba(255, 255, 255, 0), lineWidth: 0 },
      })
      plane.overlay.pointHalo.update({
        ...(contentPoint ?? { x: 0, y: 0 }),
        radius: plane.presentation.dotRadius + 3,
        fillConfig: { color: rgba(229, 109, 72, contentPoint ? 0.03 : 0) },
        strokeConfig: { color: rgba(229, 109, 72, contentPoint ? 0.52 : 0), lineWidth: 1.1 },
      })
      const valueOnRight = localPoint.x < plane.width * 0.72
      const { valueOffset } = plane.presentation
      const labelRise = Math.max(
        32,
        Math.min(72, plane.presentation.projectedWidth * POINT_LABEL_RISE_RATIO[name]),
      )
      plane.overlay.value.update({
        x: contentPoint ? contentPoint.x + (valueOnRight ? valueOffset : -valueOffset) : 0,
        y: contentPoint ? Math.max(9, contentPoint.y - labelRise) : 0,
        text: `(${formatPoint(value)})`,
        textAlign: valueOnRight ? "left" : "right",
        fillConfig: {
          color: {
            ...colors.orange,
            a: contentPoint && plane.detailsVisible ? 1 : 0,
          },
        },
      })

      if (name === "content") {
        updateViewportProjection(
          plane,
          rectOnPlane(visibleContent, range),
          mappingFocus === "content-view",
        )
      }
      updateShapeProjection(plane, localShape)
      if (contentPoint) {
        points[name] = contentPoint
        worldPoints[name] = planeWorldPoint(plane, plane.basis, localPoint, PANEL_FACE_OFFSET - 0.012)
      }
    }

    const clientViewActive = mappingFocus === "view-client"
    const clientCanvasDom = rectOnPlane({
      x: sample.surface.left,
      y: sample.surface.top,
      width: sample.surface.width,
      height: sample.surface.height,
    }, ranges.client)
    const viewPlaneRect = {
      x: 0,
      y: 0,
      width: COORDINATE_PLANE_DOMAIN.width,
      height: COORDINATE_PLANE_DOMAIN.height,
    }
    const contentViewport = rectOnPlane(visibleContent, ranges.content)
    updateCornerLinks(
      runtime.clientViewLinks,
      runtime.planes.client,
      clientCanvasDom,
      runtime.planes.view,
      viewPlaneRect,
      clientViewActive,
    )
    updateCornerLinks(
      runtime.viewContentLinks,
      runtime.planes.view,
      viewPlaneRect,
      runtime.planes.content,
      contentViewport,
      !clientViewActive,
      containsRect(ranges.content, visibleContent),
    )
    const outputDefinition = updateScenePanelGeometry(
      runtime.outputPanel,
      sceneLayout.output,
      runtime,
      OUTPUT_PANEL_THICKNESS,
      OUTPUT_PANEL_BEVEL_RADIUS,
      6,
    )
    const outputBasis = createPlaneBasis(outputDefinition)
    runtime.outputPanel.edgeTint.setGeometry(rectMeshGeometry(
      outputDefinition,
      outputBasis,
      {
        x: -5,
        y: 3,
        width: 10,
        height: Math.max(0, outputDefinition.height - 6),
      },
      OUTPUT_PANEL_THICKNESS / 2 + 0.002,
    ))
    const updateSignalMesh = (
      index: 0 | 1 | 2,
      start: Readonly<Vector3> | undefined,
      end: Readonly<Vector3> | undefined,
    ) => runtime.signalMeshes[index].setGeometry(
      start && end ? worldLineMeshGeometry(start, end, 0.01) : emptyMeshGeometry(),
    )
    updateSignalMesh(0, worldPoints.client, worldPoints.view)
    updateSignalMesh(1, worldPoints.view, worldPoints.content)
    const outputPoint = clientToRootViewRef.current?.(sample.client)
    const outputWorldPoint = outputPoint
      ? planeWorldPoint(outputDefinition, outputBasis, {
        x: outputPoint.x - sceneLayout.output.x,
        y: outputPoint.y - sceneLayout.output.y,
      }, OUTPUT_PANEL_THICKNESS / 2 - 0.012)
      : undefined
    updateSignalMesh(2, worldPoints.content, outputWorldPoint)
    const signalPoints = [points.client, points.view, points.content, outputPoint]
    const hasSignal = signalPoints.every((point): point is Coordinate => point !== undefined)
    const curve = hasSignal ? signalPoints : []
    const updateSignalPath = (
      path: Path,
      color: ReturnType<typeof rgba>,
      lineWidth: number,
    ) => path.update({
      points: hasSignal
        ? curve.map((point) => new Point({ x: point.x, y: point.y }))
        : [],
      strokeConfig: {
        color: { ...color, a: hasSignal ? color.a : 0 },
        lineWidth,
      },
    })
    updateSignalPath(
      runtime.signalGlowPath,
      COORDINATE_SIGNAL_STYLE.glow.color,
      COORDINATE_SIGNAL_STYLE.glow.lineWidth,
    )
    updateSignalPath(
      runtime.signalHighlightPath,
      COORDINATE_SIGNAL_STYLE.highlight.color,
      COORDINATE_SIGNAL_STYLE.highlight.lineWidth,
    )
    runtime.outputSignal.groundGlow.update({
      x: sceneLayout.output.x + sceneLayout.output.width * 0.06,
      y: sceneLayout.output.y + sceneLayout.output.height + 4,
      width: sceneLayout.output.width * 0.84,
      height: 72,
      fillConfig: { color: rgba(95, 145, 255, 0.09) },
    })
    runtime.outputSignal.contactShadow.update({
      x: sceneLayout.output.x + 24,
      y: sceneLayout.output.y + sceneLayout.output.height + 12,
      width: sceneLayout.output.width - 48,
      height: 60,
      fillConfig: { color: rgba(42, 47, 48, 0.03) },
    })
    const outputBottom = sceneLayout.output.y + sceneLayout.output.height
    runtime.outputSignal.outputReflections.forEach((reflection, index) => {
      const depths = [72, 64, 56] as const
      const offsets = [4, 10, 16] as const
      const starts = [0.02, 0.58, 0.75] as const
      const widths = [0.42, 0.34, 0.18] as const
      const colors = [
        rgba(95, 145, 255, 0.06),
        rgba(88, 174, 210, 0.052),
        rgba(112, 158, 226, 0.035),
      ] as const
      reflection.update({
        x: sceneLayout.output.x + sceneLayout.output.width * starts[index],
        y: outputBottom + offsets[index],
        width: sceneLayout.output.width * widths[index],
        height: depths[index],
        fillConfig: { color: colors[index] },
      })
    })
    runtime.outputSignal.outputReflectionEdges.forEach((edge, index) => {
      const offsets = [10, 22, 36] as const
      const insets = [30, 36, 44] as const
      const alphas = [0.015, 0.006, 0] as const
      edge.update({
        x1: sceneLayout.output.x + insets[index],
        y1: outputBottom + offsets[index],
        x2: sceneLayout.output.x + sceneLayout.output.width - insets[index],
        y2: outputBottom + offsets[index],
        strokeConfig: { color: rgba(95, 145, 255, alphas[index]), lineWidth: 1.2 - index * 0.3 },
      })
    })
    updateScenePanelGeometry(
      runtime.consolePanel,
      sceneLayout.console,
      runtime,
      CONSOLE_PANEL_THICKNESS,
      CONSOLE_PANEL_BEVEL_RADIUS,
      6,
    )
    const consoleBottom = sceneLayout.console.y + sceneLayout.console.height
    runtime.outputSignal.consoleContactShadow.update({
      x: sceneLayout.console.x + 18,
      y: consoleBottom - 1,
      width: sceneLayout.console.width - 36,
      height: 6,
      fillConfig: { color: rgba(43, 46, 50, 0.35) },
    })
    runtime.outputSignal.consoleReflections.forEach((reflection, index) => {
      const depths = [42, 26, 12] as const
      const insets = [24, 19, 15] as const
      const alphas = [0.025, 0.035, 0.05] as const
      reflection.update({
        x: sceneLayout.console.x + insets[index],
        y: consoleBottom + 3,
        width: sceneLayout.console.width - insets[index] * 2,
        height: depths[index],
        fillConfig: { color: rgba(142, 132, 116, alphas[index]) },
      })
    })
    runtime.outputSignal.consoleReflectionEdges.forEach((edge, index) => {
      const offsets = [7, 17, 29] as const
      const insets = [16, 22, 30] as const
      const alphas = [0.06, 0.02, 0.008] as const
      edge.update({
        x1: sceneLayout.console.x + insets[index],
        y1: consoleBottom + offsets[index],
        x2: sceneLayout.console.x + sceneLayout.console.width - insets[index],
        y2: consoleBottom + offsets[index],
        strokeConfig: { color: rgba(142, 132, 116, alphas[index]), lineWidth: 1.8 - index * 0.4 },
      })
    })
    updateOutputPanelOverlay(
      runtime.outputOverlay,
      sceneLayout.output,
      visibleContent,
    )
    updateConsolePanelOverlay(
      runtime.consoleOverlay,
      sceneLayout.console,
      sample,
      currentViewport,
      cssDisplay,
      eventEvidence,
    )
    updateConsoleControlTargets(runtime.consoleControlTargets, sceneLayout.console)
    updateHeroOverlay(runtime.heroOverlay, runtime.viewSize, {
      eyebrow: text("Coordinate laboratory · 01", "坐标实验室 · 01"),
      first: text("One point,", "一个点，"),
      second: text("three spaces.", "三个空间。"),
      compact: text("One point, three spaces.", "一个点，三个空间。"),
      subtitle: text(
        "One point and one Shape, mapped across three coordinate spaces and rendered on Live Canvas.",
        "同一点与同一 Shape，在三个坐标空间中映射，最终呈现于 Live Canvas。",
      ),
    })
    updateEvidenceOverlay(
      runtime.evidenceOverlay,
      evidenceOpen,
      runtime.viewSize,
      sample,
      currentViewport,
      shapeProjection,
      visibleContent,
      eventEvidence,
      {
        heading: text("Projection evidence", "投影证据"),
        intro: text("Zoom changes the projection, not the Shape", "缩放改变投影，不改变 Shape"),
        labels: [
          text("Content Shape geometry", "Content Shape 几何"),
          "Viewport",
          text("CSS View to Client", "CSS View 到 Client"),
          text("View projection", "View 中的投影"),
          text("Client footprint", "Client 中的显示区域"),
          text("Visible Content window", "可见 Content 窗口"),
          "Canvas event · Content · e.point",
        ],
      },
    )
    onSceneLayoutChange?.(sceneLayout)
    runtime.materialFocus = mappingFocus
  }

  useEffect(
    () => update(probe, viewport),
    [clientRange, coordinateEvidence, cssDisplay, evidenceOpen, eventEvidence, mappingFocus, onSceneLayoutChange, probe, runtimeGeneration, text, viewport],
  )

  const mounted = (tools: StayTools) => {
    const sceneMountGeneration = ++sceneMountGenerationRef.current
    const canvasArea = sceneCanvasArea(tools, STACK_WIDTH, STACK_HEIGHT)
    const definitions = createPlaneDefinitions(
      canvasArea.width,
      canvasArea.height,
      COORDINATE_PLANE_DOMAIN,
    )
    const planeNames: PlaneName[] = ["client", "view", "content"]
    const detailsVisible = canvasArea.width >= 600
    const planes = {} as Record<PlaneName, PlaneRuntime>
    const outputPanel = {
      face: new Mesh({
        geometry: emptyMeshGeometry(),
        material: coordinateOutputGlassMaterial(),
        castShadow: false,
        receiveShadow: false,
      }),
      depth: new Mesh({
        geometry: emptyMeshGeometry(),
        material: unlitMaterial(rgba(236, 240, 240, 1)),
        castShadow: true,
        receiveShadow: false,
      }),
      edgeTint: new Mesh({
        geometry: emptyTexturedMeshGeometry(),
        material: new TransparentImageMaterial({
          texture: createCoordinateOutputEdgeTexture(),
        }),
        castShadow: false,
        receiveShadow: false,
      }),
    }
    const consolePanel = {
      face: new Mesh({
        geometry: emptyMeshGeometry(),
        material: coordinateConsoleFaceMaterial(),
        // The console is a screen-space control plinth, not a tall object in the
        // installation. Let it receive the room lighting without projecting a
        // false wall-sized shadow across the shared floor.
        castShadow: false,
        receiveShadow: true,
      }),
      depth: new Mesh({
        geometry: emptyMeshGeometry(),
        material: coordinateConsoleEdgeMaterial(),
        castShadow: false,
        receiveShadow: true,
      }),
    }
    const outputOverlay = createOutputPanelOverlay()
    const consoleOverlay = createConsolePanelOverlay()
    const consoleControlTargets = createConsoleControlTargets()
    const heroOverlay = createHeroOverlay()
    const evidenceOverlay = createEvidenceOverlay()
    const outputSignal: OutputSignalOverlay = {
      groundGlow: new Rectangle({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        layer: GROUND_LAYER,
        zIndex: -20,
        filter: "blur(28px)",
        fillConfig: { color: rgba(95, 145, 255, 0) },
        strokeConfig: { color: rgba(0, 0, 0, 0), lineWidth: 0 },
      }),
      contactShadow: new Rectangle({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        layer: GROUND_LAYER,
        zIndex: -19,
        filter: "blur(10px)",
        fillConfig: { color: rgba(42, 47, 48, 0) },
        strokeConfig: { color: rgba(0, 0, 0, 0), lineWidth: 0 },
      }),
      outputReflections: ([28, 24, 18] as const).map((blur) => new Rectangle({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        layer: GROUND_LAYER,
        zIndex: -21,
        filter: `blur(${blur}px)`,
        fillConfig: { color: rgba(95, 145, 255, 0) },
        strokeConfig: { color: rgba(0, 0, 0, 0), lineWidth: 0 },
      })) as [Rectangle, Rectangle, Rectangle],
      outputReflectionEdges: Array.from({ length: 3 }, () => new Line({
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        layer: GROUND_LAYER,
        zIndex: -20,
        strokeConfig: { color: rgba(95, 145, 255, 0), lineWidth: 1, lineCap: "round" },
      })) as [Line, Line, Line],
      consoleContactShadow: new Rectangle({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        layer: GROUND_LAYER,
        zIndex: -19,
        filter: "blur(2px)",
        fillConfig: { color: rgba(48, 45, 40, 0) },
        strokeConfig: { color: rgba(0, 0, 0, 0), lineWidth: 0 },
      }),
      consoleReflections: ([12, 8, 4] as const).map((blur) => new Rectangle({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        layer: GROUND_LAYER,
        zIndex: -21,
        filter: `blur(${blur}px)`,
        fillConfig: { color: rgba(142, 132, 116, 0) },
        strokeConfig: { color: rgba(0, 0, 0, 0), lineWidth: 0 },
      })) as [Rectangle, Rectangle, Rectangle],
      consoleReflectionEdges: Array.from({ length: 3 }, () => new Line({
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        layer: GROUND_LAYER,
        zIndex: -20,
        strokeConfig: { color: rgba(142, 132, 116, 0), lineWidth: 1, lineCap: "round" },
      })) as [Line, Line, Line],
    }
    const meshes: Mesh[] = [
      outputPanel.face,
      outputPanel.depth,
      outputPanel.edgeTint,
      consolePanel.face,
      consolePanel.depth,
    ]
    const overlays: Array<Circle | Line | Path | Polygon | Rectangle | StayText> = []
    const planeTitles: StayText[] = []
    const consoleShapes = Object.values(consoleOverlay).reduce<
      Array<Circle | Line | Polygon | Rectangle | StayText>
    >((result, shape) => {
      if (Array.isArray(shape)) result.push(...shape)
      else result.push(shape)
      return result
    }, [])
    overlays.push(
      ...Object.values(outputOverlay),
      ...consoleShapes,
      ...Object.values(heroOverlay),
      outputSignal.groundGlow,
      outputSignal.contactShadow,
      ...outputSignal.outputReflections,
      ...outputSignal.outputReflectionEdges,
      outputSignal.consoleContactShadow,
      ...outputSignal.consoleReflections,
      ...outputSignal.consoleReflectionEdges,
      evidenceOverlay.panel,
      evidenceOverlay.heading,
      evidenceOverlay.intro,
      ...evidenceOverlay.labels,
      ...evidenceOverlay.values,
    )

    planeNames.forEach((name) => {
      const created = createPlaneRuntime(
        name,
        definitions[name],
        detailsVisible,
        canvasArea,
      )
      planes[name] = created.runtime
      meshes.push(...created.meshes)
      overlays.push(...created.overlays.filter((shape) => shape !== created.runtime.overlay.title))
      planeTitles.push(created.runtime.overlay.title)
    })

    const createMappingLinks = () => Array.from({ length: 4 }, () => new Line({
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      layer: OVERLAY_LAYER,
      zIndex: -20,
      strokeConfig: { color: rgba(78, 89, 104, 0.12), lineWidth: 0.9, dash: [4, 6] },
    })) as [Line, Line, Line, Line]
    const clientViewLinks = createMappingLinks()
    const viewContentLinks = createMappingLinks()
    const signalMeshes: [Mesh, Mesh, Mesh] = [
      new Mesh({ geometry: emptyMeshGeometry(), material: unlitMaterial(rgba(255, 238, 232, 0.52)) }),
      new Mesh({ geometry: emptyMeshGeometry(), material: unlitMaterial(rgba(255, 238, 232, 0.52)) }),
      new Mesh({ geometry: emptyMeshGeometry(), material: unlitMaterial(rgba(255, 238, 232, 0.08)) }),
    ]
    const signalGlowPath = createCoordinateSignalPath(COORDINATE_SIGNAL_STYLE.glow)
    const signalHighlightPath = createCoordinateSignalPath(COORDINATE_SIGNAL_STYLE.highlight)
    meshes.push(...signalMeshes)
    overlays.push(
      ...clientViewLinks,
      ...viewContentLinks,
      signalGlowPath,
      signalHighlightPath,
    )

    const backdropChild = tools.webgl.appendChild({
      className: "coordinate-room-backdrop",
      layer: BACKDROP_WEBGL_LAYER,
      meshes: [],
    })
    tools.webgl.appendChild({
      className: "coordinate-native-scene",
      layer: WEBGL_LAYER,
      meshes,
    })
    void loadCoordinateRoomTexture().then((texture) => {
      if (sceneMountGenerationRef.current !== sceneMountGeneration
          || !tools.webgl.hasChild(backdropChild.id)) return
      const backdrop = new Mesh({
        geometry: coordinateRoomBackdropGeometry(
          texture.width,
          texture.height,
          canvasArea.width,
          canvasArea.height,
        ),
        material: new ImageMaterial({ texture }),
      })
      const lighting = new Mesh({
        geometry: coordinateRoomLightingGeometry(canvasArea.width, canvasArea.height),
        material: new TransparentImageMaterial({
          texture: createCoordinateRoomLightingTexture(),
        }),
        castShadow: false,
        receiveShadow: false,
      })
      backdropChild.setMeshes([backdrop, lighting])
    }).catch((error) => {
      console.error("Coordinate room WebGL texture failed", error)
    })
    tools.appendChild({ className: "coordinate-scene-overlay", shape: overlays })
    tools.appendChild({
      className: "coordinate-plane-titles",
      placement: { type: "affine", scaleX: PLANE_TITLE_SCALE_X },
      shape: planeTitles,
    })
    for (const name of Object.keys(consoleControlTargets) as CoordinateConsoleControlName[]) {
      tools.appendChild({
        className: `coordinate-control-${name}`,
        shape: [consoleControlTargets[name]],
      })
    }
    runtimeRef.current = {
      planes,
      definitions,
      outputPanel,
      outputOverlay,
      consolePanel,
      consoleOverlay,
      consoleControlTargets,
      heroOverlay,
      evidenceOverlay,
      outputSignal,
      viewSize: { width: canvasArea.width, height: canvasArea.height },
      clientViewLinks,
      viewContentLinks,
      signalMeshes,
      signalGlowPath,
      signalHighlightPath,
    }
    clientToRootViewRef.current = (point) => tools.coordinates.clientToView(point)
    onSceneLayoutChange?.(createCoordinateSceneLayout(canvasArea.width, canvasArea.height))
    setRuntimeGeneration((current) => current + 1)
  }

  return (
    <section aria-label={text("Three coordinate planes", "三层坐标空间")} className={`coordinate-source-slot coordinate-stack-exhibit coordinate-focus-${mappingFocus}`}>
      <CanvasSurface className="coordinate-stack-surface" shrinkToViewport>
        <StayCanvas
          className="demo-canvas coordinate-stack-canvas"
          focusOnInit={false}
          height={STACK_HEIGHT}
          layers={layers}
          listenerList={controlListeners}
          mounted={mounted}
          passive={false}
          width={STACK_WIDTH}
        />
      </CanvasSurface>
    </section>
  )
}

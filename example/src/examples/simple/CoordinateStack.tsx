import { useEffect, useMemo, useRef, useState } from "react"
import {
  AmbientLight,
  Circle,
  type CanvasLayerConfig,
  DirectionalLight,
  EnvironmentMap,
  GlassMaterial,
  type GlassAttenuationColor,
  ImageMaterial,
  ImageTexture,
  Line,
  type ListenerProps,
  Mesh,
  Polygon,
  Rectangle,
  StandardMaterial,
  StayCanvas,
  StayText,
  UnlitMaterial,
  type Coordinate,
  type Rect,
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
  planeWorldPoint,
  PLANE_GRID_COLUMNS,
  PLANE_GRID_ROWS,
  projectPlanePoint,
  rectMeshGeometry,
  roundedRectMeshGeometry,
  screenFacingWorldQuad,
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
const WEBGL_LAYER = 0
const OVERLAY_LAYER = 1
const ROOM_BACKDROP_DEPTH = 19
const PANEL_THICKNESS = 0.18
const PANEL_OPTICAL_THICKNESS = 0.32
const PANEL_FACE_OFFSET = PANEL_THICKNESS / 2
const PANEL_BEVEL_RADIUS = 0.046
const PANEL_BEVEL_SEGMENTS = 6
const OUTPUT_PANEL_THICKNESS = 0.17
const OUTPUT_PANEL_BEVEL_RADIUS = 0.042
const CONSOLE_PANEL_THICKNESS = 0.11
const CONSOLE_PANEL_BEVEL_RADIUS = 0.025
const PLANE_GLASS_ROUGHNESS: Readonly<Record<PlaneName, number>> = {
  client: 0.075,
  view: 0.08,
  content: 0.085,
}
const PLANE_GLASS_ATTENUATION: Readonly<Record<PlaneName, {
  color: GlassAttenuationColor
  distance: number
}>> = {
  client: { color: [1, 0.88, 0.82], distance: 2 },
  view: { color: [0.8, 0.9, 1], distance: 2 },
  content: { color: [0.8, 1, 0.86], distance: 2 },
}
const PLANE_FRAME_COLOR: Readonly<Record<PlaneName, ReturnType<typeof rgba>>> = {
  client: rgba(250, 246, 242, 1),
  view: rgba(245, 249, 255, 1),
  content: rgba(245, 252, 247, 1),
}
const PLANE_GROUND_GLOW: Readonly<Record<PlaneName, ReturnType<typeof rgba>>> = {
  client: rgba(255, 125, 78, 0.2),
  view: rgba(75, 132, 255, 0.18),
  content: rgba(54, 180, 100, 0.2),
}
const unlitMaterial = (color: ReturnType<typeof rgba>) =>
  new UnlitMaterial({ color: meshColor(color) })
const standardMaterial = (
  color: ReturnType<typeof rgba>,
  metallic: number,
  roughness: number,
) => new StandardMaterial({ color: meshColor(color), metallic, roughness })
const glassMaterial = (
  color: ReturnType<typeof rgba>,
  thickness = 0,
  roughness = 0.12,
  attenuation?: typeof PLANE_GLASS_ATTENUATION[PlaneName],
) =>
  new GlassMaterial({
    attenuationColor: attenuation?.color,
    attenuationDistance: attenuation?.distance,
    color: transparentMeshColor(color),
    ior: 1.5,
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
  )
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
  const zoom = 0.82
  const horizontalAlignment = 1
  const verticalAlignment = 0.94
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

let coordinateRoomTexturePromise: Promise<ImageTexture> | undefined

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
          data: pixels,
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

type OutputPanelOverlay = {
  label: StayText
  title: StayText
  range: StayText
}

type ConsolePanelOverlay = {
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
  viewportButtons: Rectangle[]
  viewportActions: StayText[]
  viewportActionLabels: StayText[]
  coordinateRail: Line
  coordinateNodes: Circle[]
}

type ConsoleControlTargets = Record<CoordinateConsoleControlName, Rectangle>
type CoordinateViewportAction = "zoom-in" | "zoom-out" | "pan" | "reset"

function smoothSignalPoints(points: readonly Readonly<Coordinate>[], samplesPerSegment = 10) {
  if (points.length < 2) return points.map((point) => ({ ...point }))
  const result: Coordinate[] = [{ ...points[0] }]
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)]
    const p1 = points[index]
    const p2 = points[index + 1]
    const p3 = points[Math.min(points.length - 1, index + 2)]
    for (let sample = 1; sample <= samplesPerSegment; sample += 1) {
      const t = sample / samplesPerSegment
      const t2 = t * t
      const t3 = t2 * t
      result.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t
          + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2
          + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t
          + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2
          + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      })
    }
  }
  return result
}

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
  outputPanel: PhysicalPanelRuntime
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
  signalGlowLines: Line[]
  signalOverlayLines: Line[]
  materialFocus?: CoordinateMappingFocus
}

function planeRange(
  name: PlaneName,
  probe: CoordinateProbe,
  clientRange: Readonly<Rect>,
): Rect {
  return coordinatePlaneRange(name, COORDINATE_PLANE_DOMAIN, probe, clientRange)
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

function gridPosition(index: number, count: number, size: number) {
  return index / (count + 1) * size
}

function gridSegments(plane: PlaneDefinition): LineSegment[] {
  const vertical = Array.from({ length: PLANE_GRID_COLUMNS }, (_, index) => {
    const x = gridPosition(index + 1, PLANE_GRID_COLUMNS, plane.width)
    return { x1: x, y1: 0, x2: x, y2: plane.height }
  })
  const horizontal = Array.from({ length: PLANE_GRID_ROWS }, (_, index) => {
    const y = gridPosition(index + 1, PLANE_GRID_ROWS, plane.height)
    return { x1: 0, y1: y, x2: plane.width, y2: y }
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
): { meshes: Mesh[]; overlays: Array<Circle | Line | Polygon | Rectangle | StayText>; runtime: PlaneRuntime } {
  const basis = createPlaneBasis(plane)
  const presentation = planePresentationMetrics(plane)
  const axisColor = rgba(73, 87, 87, 0.72)
  const panelRoughness = PLANE_GLASS_ROUGHNESS[name]
  const panelAttenuation = PLANE_GLASS_ATTENUATION[name]
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
    material: coordinatePlaneGlassMaterial(name, plane.fill),
    // The shallow facade owns a restrained transmissive projection so the
    // physical pane connects to the shared floor without becoming opaque.
    castShadow: true,
    receiveShadow: false,
  })
  const frameDepth = new Mesh({
    geometry: planeVolumeGeometry(
      plane,
      basis,
      PANEL_THICKNESS,
      PANEL_BEVEL_RADIUS,
      PANEL_BEVEL_SEGMENTS,
    ),
    material: standardMaterial(PLANE_FRAME_COLOR[name], 0.02, 0.2),
    castShadow: true,
    receiveShadow: false,
  })
  const grid = new Mesh({
    geometry: lineMeshGeometry(plane, basis, gridSegments(plane).map((segment) => ({
      ...segment,
      x1: Math.max(face.rect.x, Math.min(face.rect.x + face.rect.width, segment.x1)),
      x2: Math.max(face.rect.x, Math.min(face.rect.x + face.rect.width, segment.x2)),
      y1: Math.max(face.rect.y, Math.min(face.rect.y + face.rect.height, segment.y1)),
      y2: Math.max(face.rect.y, Math.min(face.rect.y + face.rect.height, segment.y2)),
    })), 0.5, PANEL_FACE_OFFSET + 0.006),
    material: unlitMaterial(rgba(142, 156, 155, 0.62)),
  })
  const axes = new Mesh({
    geometry: lineMeshGeometry(plane, basis, [
      { x1: 18, y1: plane.height - 24, x2: plane.width - 16, y2: plane.height - 24 },
      { x1: plane.width - 16, y1: plane.height - 24, x2: plane.width - 23, y2: plane.height - 28 },
      { x1: plane.width - 16, y1: plane.height - 24, x2: plane.width - 23, y2: plane.height - 20 },
      { x1: 18, y1: 24, x2: 18, y2: plane.height - 24 },
      { x1: 18, y1: plane.height - 24, x2: 14, y2: plane.height - 31 },
      { x1: 18, y1: plane.height - 24, x2: 22, y2: plane.height - 31 },
    ], 1, PANEL_FACE_OFFSET + 0.008),
    material: unlitMaterial(axisColor),
  })
  const shapeFill = new Mesh({
    geometry: emptyMeshGeometry(),
    material: unlitMaterial(rgba(52, 102, 218, 1)),
  })
  const shapeEdges = new Mesh({ geometry: emptyMeshGeometry(), material: unlitMaterial(rgba(54, 105, 221, 1)) })
  const viewportEdges = name === "content" ? new Mesh({
    geometry: emptyMeshGeometry(),
    material: unlitMaterial(rgba(47, 138, 104, 0.62)),
  }) : undefined

  const title = new StayText({
    x: plane.labelX,
    y: plane.labelY,
    text: name.toUpperCase(),
    layer: OVERLAY_LAYER,
    zIndex: 20,
    textAlign: "center",
    textBaseline: "bottom",
    font: {
      fontFamily: '"Arial Narrow", "Helvetica Neue", "PingFang SC", sans-serif',
      size: presentation.titleSize,
      fontWeight: 680,
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
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      size: Math.max(8, Math.min(10, presentation.rangeSize)),
      fontWeight: 520,
    },
    fillConfig: { color: rgba(69, 81, 78, detailsVisible ? 0.68 : 0) },
  })
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
    radius: presentation.dotRadius + 5,
    layer: OVERLAY_LAYER,
    zIndex: 9,
    fillConfig: { color: rgba(229, 109, 72, 0) },
    strokeConfig: { color: rgba(229, 109, 72, 0), lineWidth: 1.4 },
  })
  const dot = new Circle({
    x: 0,
    y: 0,
    radius: presentation.dotRadius,
    layer: OVERLAY_LAYER,
    zIndex: 10,
    fillConfig: { color: colors.orange },
    strokeConfig: { color: colors.paper, lineWidth: 2 },
  })
  const value = new StayText({
    x: 0,
    y: 0,
    text: "(0, 0)",
    layer: OVERLAY_LAYER,
    zIndex: 11,
    textBaseline: "bottom",
    font: { size: presentation.detailSize, fontWeight: 700 },
    fillConfig: { color: { ...colors.orange, a: detailsVisible ? 1 : 0 } },
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
    layer: OVERLAY_LAYER,
    zIndex: -20,
    filter: "blur(22px)",
    fillConfig: { color: PLANE_GROUND_GLOW[name] },
    strokeConfig: { color: rgba(0, 0, 0, 0), lineWidth: 0 },
  })
  const direction = groundRight.x >= groundLeft.x ? 1 : -1
  const contactInset = 7 * direction
  const contactShadow = new Polygon({
    points: [
      { x: groundLeft.x + contactInset, y: groundLeft.y - 1 },
      { x: groundRight.x - contactInset, y: groundRight.y - 1 },
      { x: groundRight.x - contactInset, y: groundRight.y + 3 },
      { x: groundLeft.x + contactInset, y: groundLeft.y + 3 },
    ],
    layer: OVERLAY_LAYER,
    zIndex: -19,
    filter: "blur(3px)",
    fillConfig: { color: rgba(46, 43, 39, 0.28) },
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
    layer: OVERLAY_LAYER,
    zIndex: -21,
    filter: `blur(${blur}px)`,
    fillConfig: { color: { ...reflectionColor, a: reflectionColor.a * alphaScale } },
    strokeConfig: { color: rgba(0, 0, 0, 0), lineWidth: 0 },
  }))
  const reflectionEdges = ([
    { offset: 8, alphaScale: 0.18, lineWidth: 1.2 },
    { offset: 18, alphaScale: 0.07, lineWidth: 0.9 },
    { offset: 30, alphaScale: 0.02, lineWidth: 0.7 },
  ] as const).map(({ offset, alphaScale, lineWidth }) => {
    const edgeInset = offset * 0.28 * direction
    return new Line({
      x1: groundLeft.x + contactInset + edgeInset,
      y1: groundLeft.y + offset,
      x2: groundRight.x - contactInset - edgeInset,
      y2: groundRight.y + offset,
      layer: OVERLAY_LAYER,
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
  updateMeshRect(plane.meshes.shapeFill, plane, visible, 0.006)
  updateMeshLines(plane.meshes.shapeEdges, plane, clippedRectEdges(rect, clip), 1.8, 0.008)
}

function updateViewportProjection(plane: PlaneRuntime, rect: Rect) {
  const { viewportEdges } = plane.meshes
  if (!viewportEdges) return
  const clip = { x: 0, y: 0, width: plane.width, height: plane.height }
  const visible = clippedRect(rect, clip)
  updateMeshLines(viewportEdges, plane, visible ? cornerSegments(visible) : [], 1.4, 0.007)
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
    radius: 6,
    layer: OVERLAY_LAYER,
    zIndex: 42,
    fillConfig: { color: rgba(248, 248, 244, 0.96) },
    strokeConfig: { color: rgba(47, 135, 91, 0.9), lineWidth: 1.5 },
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
  const coordinateNode = () => new Circle({
    x: 0,
    y: 0,
    radius: 0,
    layer: OVERLAY_LAYER,
    zIndex: 41,
    fillConfig: { color: rgba(71, 82, 79, 0) },
  })
  return {
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
    viewportButtons: Array.from({ length: 5 }, physicalButton),
    viewportActions: ["zoom in", "zoom out", "pan", "reset", "Evidence"].map(() => controlText(12, "center")),
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
  const x = short ? 12 : narrow ? 18 : 52
  const titleSize = short ? 19 : narrow ? 32 : Math.min(51, Math.max(48, viewSize.width * 0.0354))
  const titleWeight = short ? 600 : 400
  const titleY = short ? 10 : narrow ? 32 : 58
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
    text: short ? "" : copy.subtitle,
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
  overlay.label.update({ x: left, y: frame.y + 17, text: "" })
  overlay.title.update({
    x: left,
    y: frame.y + 22,
    text: "LIVE CANVAS",
    font: {
      fontFamily: '"Helvetica Neue", "PingFang SC", sans-serif',
      size: 14,
      fontWeight: 450,
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
  const compact = frame.height < 110
  const spacious = frame.height >= 150
  const tall = frame.height >= 190
  const controlRects = coordinateConsoleControlRects(frame)
  const left = compact ? frame.x + 20 : frame.x + frame.width * 0.34
  const right = compact ? frame.x + frame.width - 20 : frame.x + frame.width * 0.68
  const width = right - left
  const centers = [left + width * 0.14, left + width * 0.5, left + width * 0.86]
  const arrows = [left + width * 0.32, left + width * 0.68]
  const headingY = frame.y + (compact ? 8 : tall ? 28 : spacious ? 19 : 15)
  const labelY = frame.y + (compact ? 23 : tall ? 100 : spacious ? 54 : 50)
  const valueY = frame.y + (compact ? 40 : tall ? 128 : spacious ? 78 : 69)
  const detailY = frame.y + (compact ? 68 : tall ? 162 : spacious ? 111 : 94)

  overlay.firstDivider.update({
    x1: frame.x + frame.width * 0.32,
    y1: frame.y + 14,
    x2: frame.x + frame.width * 0.32,
    y2: frame.y + frame.height - 14,
    strokeConfig: { color: rgba(64, 75, 72, compact ? 0 : 0.1), lineWidth: 1 },
  })
  overlay.secondDivider.update({
    x1: frame.x + frame.width * 0.7,
    y1: frame.y + 14,
    x2: frame.x + frame.width * 0.7,
    y2: frame.y + frame.height - 14,
    strokeConfig: { color: rgba(64, 75, 72, compact ? 0 : 0.1), lineWidth: 1 },
  })

  overlay.heading.update({
    x: left,
    y: headingY,
    text: compact ? "COORDINATE FACADE" : "COORDINATES",
    font: { size: 13, fontWeight: 520 },
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
  const labelFont = { size: compact ? 10 : 12, fontWeight: 520 }
  const valueFont = { size: compact ? 17 : 20, fontWeight: 560 }
  const arrowFont = { size: compact ? 14 : 16, fontWeight: 520 }
  overlay.clientLabel.update({ x: centers[0], y: labelY, text: "CLIENT", font: labelFont })
  overlay.clientValue.update({
    x: centers[0],
    y: valueY,
    text: formatPoint(probe.client),
    font: valueFont,
    fillConfig: { color: rgba(38, 42, 41, 0.92) },
  })
  overlay.firstArrow.update({ x: arrows[0], y: valueY - 1, text: "→", font: arrowFont })
  overlay.viewLabel.update({ x: centers[1], y: labelY, text: "VIEW", font: labelFont })
  overlay.viewValue.update({
    x: centers[1],
    y: valueY,
    text: formatPoint(probe.view),
    font: valueFont,
    fillConfig: { color: rgba(48, 91, 184, 0.94) },
  })
  overlay.clientDetail.update({
    x: centers[0],
    y: detailY,
    text: compact ? "" : `ORIGIN ${Math.round(probe.surface.left)}, ${Math.round(probe.surface.top)}`,
    font: { size: 12, fontWeight: 620 },
    fillConfig: { color: rgba(63, 74, 71, 0.82) },
  })
  overlay.viewDetail.update({
    x: centers[1],
    y: detailY,
    text: compact ? "" : `− ORIGIN · ÷ ${cssDisplay.scaleX.toFixed(2)}`,
    font: { size: 12, fontWeight: 620 },
    fillConfig: { color: rgba(63, 74, 71, 0.82) },
  })
  overlay.secondArrow.update({ x: arrows[1], y: valueY - 1, text: "→", font: arrowFont })
  overlay.contentLabel.update({ x: centers[2], y: labelY, text: "CONTENT", font: labelFont })
  overlay.contentValue.update({
    x: centers[2],
    y: valueY,
    text: formatPoint(probe.content),
    font: valueFont,
    fillConfig: { color: rgba(39, 119, 76, 0.94) },
  })
  overlay.contentDetail.update({
    x: centers[2],
    y: detailY,
    text: compact ? "" : `÷ ${viewport.scale.toFixed(2)} · LIVE CANVAS`,
    font: { size: 12, fontWeight: 620 },
    fillConfig: { color: rgba(63, 74, 71, 0.82) },
  })

  const controlsAlpha = compact ? 0 : 1
  const controlColor = rgba(42, 51, 49, compact ? 0.78 : 0.9)
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
  const leftStart = frame.x + 18
  const leftEnd = frame.x + frame.width * 0.3
  const railStart = leftStart + 74
  const railEnd = leftEnd - 54
  const railPosition = (scale: number) => railStart
    + (railEnd - railStart) * Math.max(0, Math.min(1, (scale - 0.5) / 0.5))
  const firstRailY = frame.y + (tall ? 110 : spacious ? 68 : 49)
  const secondRailY = frame.y + (tall ? 174 : spacious ? 112 : 73)
  overlay.displayHeading.update({
    x: leftStart,
    y: frame.y + (tall ? 27 : spacious ? 17 : 13),
    text: compact ? "" : "CSS DISPLAY",
    font: { size: 13, fontWeight: 520 },
    fillConfig: { color: rgba(35, 39, 38, compact ? 0 : 0.76) },
  })
  const resetRect = controlRects["css-reset"]
  overlay.displayResetButton.update({
    x: resetRect.x + 10,
    y: resetRect.y + 3,
    width: compact ? 0 : resetRect.width - 20,
    height: compact ? 0 : resetRect.height - 6,
    fillConfig: { color: rgba(250, 248, 242, compact ? 0 : 0.16) },
    strokeConfig: { color: rgba(69, 78, 75, compact ? 0 : 0.26), lineWidth: 1 },
  })
  overlay.displayReset.update({
    x: resetRect.x + resetRect.width / 2,
    y: resetRect.y + resetRect.height / 2 - 5,
    text: compact ? "" : "RESET CSS",
    font: { size: 7, fontWeight: 620 },
  })
  overlay.scaleXLabel.update({ x: leftStart, y: firstRailY - 7, text: compact ? "" : "SCALE" })
  overlay.scaleXValue.update({ x: leftEnd, y: firstRailY - 7, text: compact ? "" : `${cssDisplay.scaleX.toFixed(2)} ×` })
  overlay.scaleYLabel.update({
    x: leftStart,
    y: secondRailY - 25,
    text: compact ? "" : "TRANSLATE X/Y · LINKED",
    font: { size: 11, fontWeight: 520 },
  })
  overlay.scaleYValue.update({ x: leftEnd, y: secondRailY - 25, text: compact ? "" : `${cssDisplay.offsetX}, ${cssDisplay.offsetY} px` })
  overlay.translateXLabel.update({ x: 0, y: 0, text: "" })
  overlay.translateXValue.update({ x: 0, y: 0, text: "" })
  overlay.translateYLabel.update({ x: 0, y: 0, text: "" })
  overlay.translateYValue.update({ x: 0, y: 0, text: "" })
  const updateRail = (
    rail: Line,
    fill: Line,
    knobShape: Circle,
    y: number,
    position: number,
    accent: ReturnType<typeof rgba>,
  ) => {
    rail.update({
      x1: railStart,
      y1: y,
      x2: railEnd,
      y2: y,
      strokeConfig: { color: rgba(82, 91, 88, controlsAlpha * 0.26), lineWidth: 2 },
    })
    fill.update({
      x1: railStart,
      y1: y,
      x2: position,
      y2: y,
      strokeConfig: { color: { ...accent, a: accent.a * controlsAlpha }, lineWidth: 2 },
    })
    knobShape.update({
      x: position,
      y,
      fillConfig: { color: rgba(248, 248, 244, controlsAlpha * 0.96) },
      strokeConfig: { color: { ...accent, a: accent.a * controlsAlpha }, lineWidth: 1.5 },
    })
  }
  updateRail(
    overlay.scaleXRail,
    overlay.scaleXFill,
    overlay.scaleXKnob,
    firstRailY,
    railPosition(cssDisplay.scaleX),
    rgba(54, 105, 221, 0.9),
  )
  updateRail(
    overlay.scaleYRail,
    overlay.scaleYFill,
    overlay.scaleYKnob,
    secondRailY,
    railStart + (railEnd - railStart) * cssDisplay.offsetX / 96,
    rgba(47, 135, 91, 0.9),
  )

  const viewportLeft = frame.x + frame.width * 0.735
  overlay.viewportHeading.update({
    x: viewportLeft,
    y: frame.y + (tall ? 27 : spacious ? 17 : 13),
    text: compact ? "" : "CANVAS VIEWPORT",
    font: { size: 13, fontWeight: 520 },
    fillConfig: { color: rgba(35, 39, 38, compact ? 0 : 0.76) },
  })
  overlay.viewportStatus.update({
    x: frame.x + frame.width - 18,
    y: frame.y + (tall ? 29 : spacious ? 19 : 15),
    text: compact
      ? ""
      : `VIEW ${Math.round(probe.viewSize.width)} × ${Math.round(probe.viewSize.height)} · ZOOM ${Math.round(viewport.scale * 100)}%`,
  })
  const actionNames = compact
    ? (["css-reset", "zoom-in", "zoom-out", "viewport-reset", "evidence"] as const)
    : (["zoom-in", "zoom-out", "viewport-reset", "evidence", "pan"] as const)
  overlay.viewportButtons.forEach((button, index) => {
    const name = actionNames[index]
    const rect = controlRects[name]
    const visible = rect.width > 0 && rect.height > 0 && name !== "pan"
    const evidence = name === "evidence"
    const buttonSize = visible ? Math.min(32, Math.min(rect.width, rect.height) - 8) : 0
    button.update({
      x: rect.x + (rect.width - buttonSize) / 2,
      y: rect.y + (rect.height - buttonSize) / 2,
      width: buttonSize,
      height: buttonSize,
      fillConfig: { color: evidence
        ? rgba(238, 246, 240, visible ? 0.22 : 0)
        : rgba(250, 248, 242, visible ? 0.18 : 0) },
      strokeConfig: { color: evidence
        ? rgba(39, 119, 76, visible ? 0.38 : 0)
        : rgba(69, 78, 75, visible ? 0.28 : 0), lineWidth: 1 },
    })
  })
  overlay.viewportActions.forEach((action, index) => {
    const name = actionNames[index]
    const rect = controlRects[name]
    action.update({
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2 - (compact ? 5 : index < 2 ? 11 : 8),
      text: compact
        ? ["CSS reset", "zoom in", "zoom out", "view reset", "Evidence"][index]
        : ["+", "−", "FIT", "i", ""][index],
      font: { size: compact ? 10 : index < 2 ? 16 : index === 2 ? 9 : 13, fontWeight: 500 },
      fillConfig: { color: controlColor },
    })
  })
  const actionLabels = compact
    ? ["CSS", "ZOOM IN", "ZOOM OUT", "RESET", "PROOF"]
    : ["ZOOM IN", "ZOOM OUT", "FIT", "DETAILS", ""]
  overlay.viewportActionLabels.forEach((label, index) => {
    const name = actionNames[index]
    const rect = controlRects[name]
    label.update({
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height + (compact ? -8 : 5),
      text: rect.width > 0 && name !== "pan" ? actionLabels[index] : "",
      font: { size: compact ? 8 : 9, fontWeight: 560 },
      fillConfig: { color: rgba(42, 51, 49, compact ? 0.78 : 0.7) },
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
              onCssDisplayChange({
                offsetX: Math.round(ratio * 96),
                offsetY: Math.round(ratio * 64),
              })
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
  }, [cssDisplay.offsetX, cssDisplay.offsetY, onCssDisplayChange, onEvidenceToggle, onViewportAction])

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
      const range = planeRange(name, sample, clientRange)
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
      const tickColor = rgba(69, 81, 78, plane.detailsVisible ? 0.68 : 0)
      plane.overlay.xTicks.forEach((tick, index, ticks) => {
        const localX = 42 + (plane.width - 70) * index / (ticks.length - 1)
        const localY = plane.height - 20
        const position = projectPlanePoint(plane, { x: localX, y: localY })
        tick.update({
          ...position,
          text: String(Math.round((range.x + range.width * localX / plane.width) / 10) * 10),
          fillConfig: { color: tickColor },
        })
      })
      plane.overlay.yTicks.forEach((tick, index, ticks) => {
        const localX = 12
        const localY = plane.height - 58 - (plane.height - 116) * index / (ticks.length - 1)
        const position = projectPlanePoint(plane, { x: localX, y: localY })
        tick.update({
          x: position.x - 3,
          y: position.y,
          text: String(Math.round((range.y + range.height * localY / plane.height) / 10) * 10),
          fillConfig: { color: tickColor },
        })
      })

      if (materialFocusChanged) {
        plane.meshes.frameFill.setMaterial(coordinatePlaneGlassMaterial(
          name,
          plane.fill,
          isActive ? 1 : 0.82,
        ))
      }
      plane.overlay.title.update({
        fillConfig: { color: { ...plane.stroke, a: isActive ? 1 : 0.78 } },
      })
      const guideStart = contentPoint
        ? projectPlanePoint(plane, { x: localPoint.x, y: 0 })
        : undefined
      const guideEnd = contentPoint
        ? projectPlanePoint(plane, { x: localPoint.x, y: plane.height })
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
        fillConfig: { color: { ...colors.orange, a: contentPoint ? 1 : 0 } },
        strokeConfig: { color: { ...colors.paper, a: contentPoint ? 1 : 0 }, lineWidth: 1.5 },
      })
      plane.overlay.pointHalo.update({
        ...(contentPoint ?? { x: 0, y: 0 }),
        radius: plane.presentation.dotRadius + 5,
        fillConfig: { color: rgba(229, 109, 72, contentPoint ? 0.09 : 0) },
        strokeConfig: { color: rgba(229, 109, 72, contentPoint ? 0.64 : 0), lineWidth: 1.4 },
      })
      const valueOnRight = localPoint.x < plane.width * 0.72
      const { valueOffset } = plane.presentation
      plane.overlay.value.update({
        x: contentPoint ? contentPoint.x + (valueOnRight ? valueOffset : -valueOffset) : 0,
        y: contentPoint ? Math.max(9, contentPoint.y - valueOffset) : 0,
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
    const updateSignalMesh = (
      index: 0 | 1 | 2,
      start: Readonly<Vector3> | undefined,
      end: Readonly<Vector3> | undefined,
    ) => runtime.signalMeshes[index].setGeometry(
      start && end ? worldLineMeshGeometry(start, end, 0.024) : emptyMeshGeometry(),
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
    const curve = hasSignal ? smoothSignalPoints(signalPoints) : []
    const updateSignalLines = (lines: readonly Line[], alpha: number, lineWidth: number) => lines.forEach((line, index) => {
      const start = curve[index]
      const end = curve[index + 1]
      line.update({
        x1: start?.x ?? 0,
        y1: start?.y ?? 0,
        x2: end?.x ?? 0,
        y2: end?.y ?? 0,
        strokeConfig: {
          color: rgba(232, 82, 39, start && end ? alpha : 0),
          lineWidth,
          lineCap: "round",
        },
      })
    })
    updateSignalLines(runtime.signalGlowLines, 0.13, 5)
    updateSignalLines(runtime.signalOverlayLines, 0.8, 1.6)
    runtime.outputSignal.groundGlow.update({
      x: sceneLayout.output.x + 18,
      y: sceneLayout.output.y + sceneLayout.output.height + 2,
      width: sceneLayout.output.width - 36,
      height: 36,
      fillConfig: { color: rgba(95, 145, 255, 0.2) },
    })
    runtime.outputSignal.contactShadow.update({
      x: sceneLayout.output.x + 24,
      y: sceneLayout.output.y + sceneLayout.output.height - 3,
      width: sceneLayout.output.width - 48,
      height: 4,
      fillConfig: { color: rgba(42, 47, 48, 0.34) },
    })
    const outputBottom = sceneLayout.output.y + sceneLayout.output.height
    runtime.outputSignal.outputReflections.forEach((reflection, index) => {
      const depths = [38, 24, 11] as const
      const insets = [34, 29, 25] as const
      const alphas = [0.035, 0.045, 0.06] as const
      reflection.update({
        x: sceneLayout.output.x + insets[index],
        y: outputBottom + 4,
        width: sceneLayout.output.width - insets[index] * 2,
        height: depths[index],
        fillConfig: { color: rgba(95, 145, 255, alphas[index]) },
      })
    })
    runtime.outputSignal.outputReflectionEdges.forEach((edge, index) => {
      const offsets = [8, 18, 30] as const
      const insets = [26, 30, 35] as const
      const alphas = [0.08, 0.03, 0.01] as const
      edge.update({
        x1: sceneLayout.output.x + insets[index],
        y1: outputBottom + offsets[index],
        x2: sceneLayout.output.x + sceneLayout.output.width - insets[index],
        y2: outputBottom + offsets[index],
        strokeConfig: { color: rgba(95, 145, 255, alphas[index]), lineWidth: 2 - index * 0.5 },
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
      y: consoleBottom - 2,
      width: sceneLayout.console.width - 36,
      height: 4,
      fillConfig: { color: rgba(48, 45, 40, 0.26) },
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
        material: glassMaterial(rgba(255, 255, 255, 0.26), 0.28, 0.08, {
          color: [0.96, 0.98, 0.97],
          distance: 2,
        }),
        castShadow: false,
        receiveShadow: false,
      }),
      depth: new Mesh({
        geometry: emptyMeshGeometry(),
        material: standardMaterial(rgba(250, 253, 253, 1), 0.02, 0.2),
        castShadow: true,
        receiveShadow: false,
      }),
    }
    const consolePanel = {
      face: new Mesh({
        geometry: emptyMeshGeometry(),
        material: glassMaterial(rgba(255, 255, 252, 0.34), 0.18, 0.1, {
          color: [0.94, 0.93, 0.89],
          distance: 2,
        }),
        // The console is a screen-space control plinth, not a tall object in the
        // installation. Let it receive the room lighting without projecting a
        // false wall-sized shadow across the shared floor.
        castShadow: false,
        receiveShadow: true,
      }),
      depth: new Mesh({
        geometry: emptyMeshGeometry(),
        material: standardMaterial(rgba(252, 250, 246, 1), 0.02, 0.2),
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
        layer: OVERLAY_LAYER,
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
        layer: OVERLAY_LAYER,
        zIndex: -19,
        filter: "blur(2px)",
        fillConfig: { color: rgba(42, 47, 48, 0) },
        strokeConfig: { color: rgba(0, 0, 0, 0), lineWidth: 0 },
      }),
      outputReflections: ([10, 7, 4] as const).map((blur) => new Rectangle({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        layer: OVERLAY_LAYER,
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
        layer: OVERLAY_LAYER,
        zIndex: -20,
        strokeConfig: { color: rgba(95, 145, 255, 0), lineWidth: 1, lineCap: "round" },
      })) as [Line, Line, Line],
      consoleContactShadow: new Rectangle({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        layer: OVERLAY_LAYER,
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
        layer: OVERLAY_LAYER,
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
        layer: OVERLAY_LAYER,
        zIndex: -20,
        strokeConfig: { color: rgba(142, 132, 116, 0), lineWidth: 1, lineCap: "round" },
      })) as [Line, Line, Line],
    }
    const meshes: Mesh[] = [
      outputPanel.face,
      outputPanel.depth,
      consolePanel.face,
      consolePanel.depth,
    ]
    const overlays: Array<Circle | Line | Polygon | Rectangle | StayText> = []
    const consoleShapes = Object.values(consoleOverlay).flatMap((shape) => Array.isArray(shape) ? shape : [shape])
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
      )
      planes[name] = created.runtime
      meshes.push(...created.meshes)
      overlays.push(...created.overlays)
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
      new Mesh({ geometry: emptyMeshGeometry(), material: unlitMaterial(rgba(232, 82, 39, 0.2)) }),
      new Mesh({ geometry: emptyMeshGeometry(), material: unlitMaterial(rgba(232, 82, 39, 0.2)) }),
      new Mesh({ geometry: emptyMeshGeometry(), material: unlitMaterial(rgba(232, 82, 39, 0.2)) }),
    ]
    const signalGlowLines = Array.from({ length: 30 }, () => new Line({
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      layer: OVERLAY_LAYER,
      zIndex: 17,
      strokeConfig: { color: rgba(232, 82, 39, 0), lineWidth: 6, lineCap: "round" },
    }))
    const signalOverlayLines = Array.from({ length: 30 }, () => new Line({
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      layer: OVERLAY_LAYER,
      zIndex: 18,
      strokeConfig: { color: rgba(232, 82, 39, 0), lineWidth: 1.8, lineCap: "round" },
    }))
    meshes.push(...signalMeshes)
    overlays.push(...clientViewLinks, ...viewContentLinks, ...signalGlowLines, ...signalOverlayLines)

    const sceneChild = tools.webgl.appendChild({
      className: "coordinate-native-scene",
      layer: WEBGL_LAYER,
      meshes,
    })
    void loadCoordinateRoomTexture().then((texture) => {
      if (sceneMountGenerationRef.current !== sceneMountGeneration
          || !tools.webgl.hasChild(sceneChild.id)) return
      const backdrop = new Mesh({
        geometry: coordinateRoomBackdropGeometry(
          texture.width,
          texture.height,
          canvasArea.width,
          canvasArea.height,
        ),
        material: new ImageMaterial({ texture }),
      })
      sceneChild.setMeshes([backdrop, ...sceneChild.meshes])
    }).catch((error) => {
      console.error("Coordinate room WebGL texture failed", error)
    })
    tools.appendChild({ className: "coordinate-scene-overlay", shape: overlays })
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
      signalGlowLines,
      signalOverlayLines,
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

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AmbientLight,
  Circle,
  type CanvasLayerConfig,
  DirectionalLight,
  EnvironmentMap,
  GlassMaterial,
  type GlassAttenuationColor,
  Line,
  Mesh,
  PointLight,
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
import {
  clippedRectEdges,
  COORDINATE_PLANE_DOMAIN,
  containsRect,
  coordinatePlaneRange,
  correspondingRectCorners,
  formatPoint,
  projectCoordinatePlanePoint,
  projectCoordinatePlaneRect,
  projectContentRect,
  type CoordinateProbe,
  type LineSegment,
  visibleContentRange,
} from "./coordinateLabModel"
import {
  createCoordinateCamera,
  createPlaneBevelFaceProfile,
  createPlaneBasis,
  createPlaneDefinitions,
  emptyMeshGeometry,
  lineMeshGeometry,
  meshColor,
  planePresentationMetrics,
  planeVolumeGeometry,
  planeWorldPoint,
  PLANE_GRID_COLUMNS,
  PLANE_GRID_ROWS,
  projectPlanePoint,
  rectMeshGeometry,
  roundedRectMeshGeometry,
  transparentMeshColor,
  worldLineMeshGeometry,
  type PlaneBasis,
  type PlaneDefinition,
  type PlaneName,
  type PlanePresentationMetrics,
} from "./coordinateSceneModel"

export { createPlaneDefinitions } from "./coordinateSceneModel"
export { expandRangeToAspect } from "./coordinateLabModel"

const STACK_WIDTH = 240
const STACK_HEIGHT = 120
const WEBGL_LAYER = 0
const OVERLAY_LAYER = 1
const PANEL_THICKNESS = 0.24
const PANEL_FACE_OFFSET = PANEL_THICKNESS / 2
const PANEL_BEVEL_RADIUS = 0.12
const PANEL_BEVEL_SEGMENTS = 6
const PLANE_GLASS_ROUGHNESS: Readonly<Record<PlaneName, number>> = {
  client: 0.06,
  view: 0.09,
  content: 0.12,
}
const PLANE_GLASS_ATTENUATION: Readonly<Record<PlaneName, {
  color: GlassAttenuationColor
  distance: number
}>> = {
  client: { color: [0.55, 0.9, 1], distance: 1.5 },
  view: { color: [0.45, 0.65, 1], distance: 1.35 },
  content: { color: [0.5, 1, 0.68], distance: 1.4 },
}

const unlitMaterial = (color: ReturnType<typeof rgba>) =>
  new UnlitMaterial({ color: meshColor(color) })
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
    ior: 1.46,
    roughness,
    thickness,
  })

function createCoordinateEnvironment() {
  const width = 128
  const height = 64
  const data = new Uint8Array(width * height * 4)
  const windowCenters = [0.664, 0.771, 0.848]
  for (let y = 0; y < height; y++) {
    const vertical = y / (height - 1)
    const horizon = Math.exp(-Math.pow((vertical - 0.5) / 0.18, 2))
    const ground = Math.max(0, (vertical - 0.5) * 2)
    for (let x = 0; x < width; x++) {
      const horizontal = x / (width - 1)
      const windowLight = Math.max(...windowCenters.map((center) =>
        Math.exp(-Math.pow((horizontal - center) / 0.014, 2))))
        * Math.exp(-Math.pow((vertical - 0.5) / 0.32, 2))
      const offset = (y * width + x) * 4
      data[offset] = Math.min(
        255,
        Math.round(178 + horizon * 20 - ground * 18 + windowLight * 70),
      )
      data[offset + 1] = Math.min(
        255,
        Math.round(174 + horizon * 18 - ground * 17 + windowLight * 68),
      )
      data[offset + 2] = Math.min(
        255,
        Math.round(166 + horizon * 15 - ground * 15 + windowLight * 64),
      )
      data[offset + 3] = 255
    }
  }
  return new EnvironmentMap({ width, height, data, intensity: 1.18 })
}

export type CoordinateMappingFocus = "view-client" | "content-view"

type PlaneMeshes = {
  frameFill: Mesh
  frameDepth: Mesh
  grid: Mesh
  axes: Mesh
  shapeFill: Mesh
  shapeEdges: Mesh
  viewportFill?: Mesh
  viewportEdges?: Mesh
}

type PlaneOverlay = {
  title: StayText
  rangeValue: StayText
  pointGuide: Line
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

type StackRuntime = {
  planes: Record<PlaneName, PlaneRuntime>
  clientViewLinks: [Line, Line, Line, Line]
  viewContentLinks: [Line, Line, Line, Line]
  signalMeshes: [Mesh, Mesh]
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
): { meshes: Mesh[]; overlays: Array<Circle | Line | StayText>; runtime: PlaneRuntime } {
  const basis = createPlaneBasis(plane)
  const presentation = planePresentationMetrics(plane)
  const axisColor = rgba(49, 65, 61, 0.42)
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
    material: glassMaterial(
      plane.fill,
      PANEL_THICKNESS,
      panelRoughness,
      panelAttenuation,
    ),
    castShadow: true,
    receiveShadow: true,
  })
  const frameDepth = new Mesh({
    geometry: planeVolumeGeometry(
      plane,
      basis,
      PANEL_THICKNESS,
      PANEL_BEVEL_RADIUS,
      PANEL_BEVEL_SEGMENTS,
    ),
    material: glassMaterial(
      { ...plane.stroke, a: 0.42 },
      PANEL_THICKNESS,
      panelRoughness,
      panelAttenuation,
    ),
    receiveShadow: true,
  })
  const grid = new Mesh({
    geometry: lineMeshGeometry(plane, basis, gridSegments(plane).map((segment) => ({
      ...segment,
      x1: Math.max(face.rect.x, Math.min(face.rect.x + face.rect.width, segment.x1)),
      x2: Math.max(face.rect.x, Math.min(face.rect.x + face.rect.width, segment.x2)),
      y1: Math.max(face.rect.y, Math.min(face.rect.y + face.rect.height, segment.y1)),
      y2: Math.max(face.rect.y, Math.min(face.rect.y + face.rect.height, segment.y2)),
    })), 0.5, PANEL_FACE_OFFSET + 0.006),
    material: unlitMaterial(rgba(57, 72, 68, 0.25)),
  })
  const axes = new Mesh({
    geometry: lineMeshGeometry(plane, basis, [
      { x1: 18, y1: 24, x2: plane.width - 16, y2: 24 },
      { x1: plane.width - 16, y1: 24, x2: plane.width - 23, y2: 20 },
      { x1: plane.width - 16, y1: 24, x2: plane.width - 23, y2: 28 },
      { x1: 18, y1: 24, x2: 18, y2: plane.height - 16 },
      { x1: 18, y1: plane.height - 16, x2: 14, y2: plane.height - 23 },
      { x1: 18, y1: plane.height - 16, x2: 22, y2: plane.height - 23 },
    ], 1, PANEL_FACE_OFFSET + 0.008),
    material: unlitMaterial(axisColor),
  })
  const shapeFill = new Mesh({ geometry: emptyMeshGeometry(), material: unlitMaterial(rgba(54, 105, 221, 0.44)) })
  const shapeEdges = new Mesh({ geometry: emptyMeshGeometry(), material: unlitMaterial(rgba(54, 105, 221, 1)) })
  const viewportFill = name === "content" ? new Mesh({
    geometry: emptyMeshGeometry(),
    material: glassMaterial(rgba(70, 143, 77, 0.018)),
  }) : undefined
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
    font: { size: presentation.titleSize, fontWeight: 700 },
    fillConfig: { color: plane.stroke },
  })
  const rangePoint = projectPlanePoint(plane, { x: 28, y: 38 })
  const rangeValue = new StayText({
    ...rangePoint,
    text: "x 0—0 · y 0—0",
    layer: OVERLAY_LAYER,
    zIndex: 5,
    textBaseline: "top",
    font: { size: presentation.rangeSize, fontWeight: 600 },
    fillConfig: { color: rgba(49, 65, 61, detailsVisible ? 0.68 : 0) },
  })
  const pointGuide = new Line({
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    layer: OVERLAY_LAYER,
    zIndex: 9,
    strokeConfig: { color: rgba(229, 109, 72, 0), lineWidth: 1.2, dash: [5, 6] },
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
  const meshes: PlaneMeshes = {
    frameFill,
    frameDepth,
    grid,
    axes,
    shapeFill,
    shapeEdges,
    viewportFill,
    viewportEdges,
  }
  const overlay: PlaneOverlay = {
    title,
    rangeValue,
    pointGuide,
    dot,
    value,
  }
  return {
    meshes: Object.values(meshes).filter((mesh): mesh is Mesh => Boolean(mesh)),
    overlays: Object.values(overlay).filter((shape): shape is Circle | Line | StayText => Boolean(shape)),
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
  const { viewportFill, viewportEdges } = plane.meshes
  if (!viewportFill || !viewportEdges) return
  const clip = { x: 0, y: 0, width: plane.width, height: plane.height }
  const visible = clippedRect(rect, clip)
  updateMeshRect(viewportFill, plane, visible, 0.005)
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
        color: rgba(78, 89, 104, active ? 0.1 : 0.025),
        lineWidth: active ? 0.9 : 0.7,
        dash: [4, 6],
      },
    })
  })
}

export function CoordinateStack({
  clientRange,
  mappingFocus,
  onContentPointClientChange,
  probe,
  viewport,
}: {
  clientRange: Readonly<Rect>
  mappingFocus: CoordinateMappingFocus
  onContentPointClientChange?: (point: Coordinate) => void
  probe: CoordinateProbe
  viewport: Readonly<ViewportState>
}) {
  const { text } = useI18n()
  const runtimeRef = useRef<StackRuntime>()
  const [runtimeGeneration, setRuntimeGeneration] = useState(0)
  const viewToClientRef = useRef<(point: Coordinate) => Coordinate>()
  const camera = useMemo(() => createCoordinateCamera(), [])
  const environment = useMemo(() => createCoordinateEnvironment(), [])
  const lights = useMemo(() => [
    new AmbientLight({ color: [0.9, 0.92, 0.91], intensity: 0.22 }),
    new DirectionalLight({
      directionToLight: [0.72, 0.96, 0.5],
      color: [1, 0.96, 0.9],
      intensity: 1.3,
      shadow: {
        target: [0, -0.4, -7.2],
        distance: 11,
        width: 15,
        height: 10,
        near: 0.1,
        far: 26,
        mapSize: 512,
        bias: 0.001,
        filterRadius: 2.5,
      },
    }),
    new PointLight({
      position: [-3.8, 4.4, -5.8],
      color: [1, 0.93, 0.82],
      intensity: 24,
      range: 9,
    }),
    new PointLight({
      position: [7.2, 3.2, -5.2],
      color: [0.72, 0.88, 1],
      intensity: 14,
      range: 8,
    }),
  ], [])
  const layers = useMemo<CanvasLayerConfig[]>(() => [
    {
      backend: "webgl2",
      camera,
      environment,
      lights,
    },
    { backend: "canvas2d" },
  ], [camera, environment, lights])

  const update = (sample: CoordinateProbe, currentViewport: Readonly<ViewportState>) => {
    const runtime = runtimeRef.current
    if (!runtime) return
    const shapeProjection = projectContentRect(sample, currentViewport)
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
        text: `x ${Math.round(range.x)}—${Math.round(range.x + range.width)} · y ${Math.round(range.y)}—${Math.round(range.y + range.height)}`,
      })

      if (materialFocusChanged) {
        plane.meshes.frameFill.setMaterial(glassMaterial({
          ...plane.fill,
          a: isActive ? plane.fill.a : plane.fill.a * 0.88,
        }, PANEL_THICKNESS, PLANE_GLASS_ROUGHNESS[name], PLANE_GLASS_ATTENUATION[name]))
        plane.meshes.frameDepth.setMaterial(glassMaterial({
          ...plane.stroke,
          a: isActive ? 0.5 : 0.42,
        }, PANEL_THICKNESS, PLANE_GLASS_ROUGHNESS[name], PLANE_GLASS_ATTENUATION[name]))
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
          color: rgba(229, 109, 72, contentPoint ? 0.42 : 0),
          lineWidth: 1.2,
          dash: [5, 6],
        },
      })
      plane.overlay.dot.update({
        ...(contentPoint ?? { x: 0, y: 0 }),
        fillConfig: { color: { ...colors.orange, a: contentPoint ? 1 : 0 } },
        strokeConfig: { color: { ...colors.paper, a: contentPoint ? 1 : 0 }, lineWidth: 1.5 },
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
          rectOnPlane(visibleContentRange(sample, currentViewport), range),
        )
      }
      updateShapeProjection(plane, localShape)
      if (contentPoint) {
        points[name] = contentPoint
        worldPoints[name] = planeWorldPoint(plane, plane.basis, localPoint, PANEL_FACE_OFFSET + 0.012)
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
    const visibleContent = visibleContentRange(sample, currentViewport)
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
    const updateSignalMesh = (
      index: 0 | 1,
      start: Readonly<Vector3> | undefined,
      end: Readonly<Vector3> | undefined,
    ) => runtime.signalMeshes[index].setGeometry(
      start && end ? worldLineMeshGeometry(start, end, 0.085) : emptyMeshGeometry(),
    )
    updateSignalMesh(0, worldPoints.client, worldPoints.view)
    updateSignalMesh(1, worldPoints.view, worldPoints.content)
    const contentPoint = points.content
    if (contentPoint && viewToClientRef.current) {
      onContentPointClientChange?.(viewToClientRef.current(contentPoint))
    }
    runtime.materialFocus = mappingFocus
  }

  useEffect(
    () => update(probe, viewport),
    [clientRange, mappingFocus, probe, runtimeGeneration, viewport],
  )

  const mounted = (tools: StayTools) => {
    viewToClientRef.current = (point) => tools.coordinates.viewToClient(point)
    const canvasArea = sceneCanvasArea(tools, STACK_WIDTH, STACK_HEIGHT)
    const definitions = createPlaneDefinitions(
      canvasArea.width,
      canvasArea.height,
      COORDINATE_PLANE_DOMAIN,
    )
    const planeNames: PlaneName[] = ["client", "view", "content"]
    const detailsVisible = canvasArea.width >= 600
    const planes = {} as Record<PlaneName, PlaneRuntime>
    const meshes: Mesh[] = []
    const overlays: Array<Circle | Line | StayText> = []

    planeNames.forEach((name) => {
      const created = createPlaneRuntime(name, definitions[name], detailsVisible)
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
    const signalMeshes: [Mesh, Mesh] = [
      new Mesh({ geometry: emptyMeshGeometry(), material: unlitMaterial(rgba(224, 102, 61, 0.94)) }),
      new Mesh({ geometry: emptyMeshGeometry(), material: unlitMaterial(rgba(224, 102, 61, 0.94)) }),
    ]
    meshes.push(...signalMeshes)
    overlays.push(...clientViewLinks, ...viewContentLinks)

    tools.webgl.appendChild({ className: "coordinate-native-scene", layer: WEBGL_LAYER, meshes })
    tools.appendChild({ className: "coordinate-scene-overlay", shape: overlays })
    runtimeRef.current = { planes, clientViewLinks, viewContentLinks, signalMeshes }
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
          mounted={mounted}
          width={STACK_WIDTH}
        />
      </CanvasSurface>
    </section>
  )
}

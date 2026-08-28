import { useEffect, useMemo, useRef } from "react"
import {
  AmbientLight,
  Circle,
  type CanvasLayerConfig,
  DirectionalLight,
  LambertMaterial,
  Line,
  Mesh,
  StayCanvas,
  StayText,
  UnlitMaterial,
  type Coordinate,
  type Rect,
  type StayTools,
  type ViewportState,
} from "react-stay-canvas"

import { CanvasSurface, colors, rgba, sceneCanvasArea } from "../../components/DemoKit"
import { useI18n } from "../../i18n"
import {
  clippedRectEdges,
  containsRect,
  correspondingRectCorners,
  contentReferenceRange,
  formatPoint,
  projectContentRect,
  projectRectToRange,
  type CoordinateProbe,
  type LineSegment,
  visibleContentRange,
} from "./coordinateLabModel"
import {
  createCoordinateCamera,
  createPlaneBasis,
  createPlaneDefinitions,
  dashedSegments,
  emptyMeshGeometry,
  expandRangeToAspect,
  lineMeshGeometry,
  meshColor,
  PLANE_GRID_COLUMNS,
  PLANE_GRID_ROWS,
  projectPlanePoint,
  rectMeshGeometry,
  type PlaneBasis,
  type PlaneDefinition,
  type PlaneName,
  type PlaneRange,
} from "./coordinateSceneModel"

export { createPlaneDefinitions, expandRangeToAspect } from "./coordinateSceneModel"

const STACK_WIDTH = 240
const STACK_HEIGHT = 120
const WEBGL_LAYER = 0
const OVERLAY_LAYER = 1

const unlitMaterial = (color: ReturnType<typeof rgba>) =>
  new UnlitMaterial({ color: meshColor(color) })
const lambertMaterial = (color: ReturnType<typeof rgba>) =>
  new LambertMaterial({ color: meshColor(color) })

export type CoordinateMappingFocus = "view-client" | "content-view"

type PlaneMeshes = {
  frameFill: Mesh
  frameEdges: Mesh
  grid: Mesh
  axes: Mesh
  shapeFill: Mesh
  shapeEdges: Mesh
  canvasDomEdges?: Mesh
  viewportFill?: Mesh
  viewportEdges?: Mesh
}

type PlaneOverlay = {
  title: StayText
  dimension: StayText
  originValue: StayText
  xLabel: StayText
  yLabel: StayText
  dot: Circle
  value: StayText
  viewportLabel?: StayText
}

type PlaneRuntime = PlaneDefinition & {
  basis: PlaneBasis
  meshes: PlaneMeshes
  overlay: PlaneOverlay
}

type StackRuntime = {
  planes: Record<PlaneName, PlaneRuntime>
  clientViewLinks: [Line, Line, Line, Line]
  viewContentLinks: [Line, Line, Line, Line]
  rays: [Line, Line]
  materialFocus?: CoordinateMappingFocus
}

function planeRange(
  name: PlaneName,
  plane: PlaneDefinition,
  probe: CoordinateProbe,
  clientRange: Readonly<Rect>,
): PlaneRange {
  const range = name === "client"
    ? clientRange
    : name === "view"
      ? { x: 0, y: 0, width: probe.viewSize.width, height: probe.viewSize.height }
      : contentReferenceRange(probe)
  return expandRangeToAspect(range, plane.width / plane.height)
}

function pointOnPlane(plane: PlaneDefinition, value: Coordinate, range: PlaneRange) {
  return {
    x: (value.x - range.x) / range.width * plane.width,
    y: (value.y - range.y) / range.height * plane.height,
  }
}

function rectOnPlane(plane: PlaneDefinition, value: Rect, range: PlaneRange): Rect {
  return projectRectToRange(value, range, plane)
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

function pointIsInsidePlane(plane: PlaneDefinition, point: Readonly<Coordinate>) {
  return point.x >= 0 && point.y >= 0 && point.x <= plane.width && point.y <= plane.height
}

function frameSegments(width: number, height: number): LineSegment[] {
  return [
    { x1: 0, y1: 0, x2: width, y2: 0 },
    { x1: width, y1: 0, x2: width, y2: height },
    { x1: width, y1: height, x2: 0, y2: height },
    { x1: 0, y1: height, x2: 0, y2: 0 },
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

function createOverlayText(
  plane: PlaneDefinition,
  point: Coordinate,
  props: Omit<ConstructorParameters<typeof StayText>[0], "x" | "y" | "layer">,
) {
  const projected = projectPlanePoint(plane, point)
  return new StayText({ ...projected, ...props, layer: OVERLAY_LAYER })
}

function createPlaneRuntime(
  name: PlaneName,
  plane: PlaneDefinition,
  canvasWidth: number,
  canvasHeight: number,
): { meshes: Mesh[]; overlays: Array<Circle | Line | StayText>; runtime: PlaneRuntime } {
  const basis = createPlaneBasis(plane, canvasWidth, canvasHeight)
  const planeRect = { x: 0, y: 0, width: plane.width, height: plane.height }
  const titleSize = Math.max(9, Math.min(15, plane.width * 0.06))
  const detailSize = Math.max(7, Math.min(10, plane.width * 0.04))
  const axisColor = rgba(78, 89, 104, 0.24)

  const frameFill = new Mesh({
    geometry: rectMeshGeometry(plane, basis, planeRect, 0),
    material: lambertMaterial(plane.fill),
  })
  const frameEdges = new Mesh({
    geometry: lineMeshGeometry(plane, basis, frameSegments(plane.width, plane.height), 1.25, 0.002),
    material: unlitMaterial(plane.stroke),
  })
  const grid = new Mesh({
    geometry: lineMeshGeometry(plane, basis, gridSegments(plane), 1, 0.003),
    material: unlitMaterial({ ...plane.stroke, a: 0.1 }),
  })
  const axes = new Mesh({
    geometry: lineMeshGeometry(plane, basis, [
      { x1: 12, y1: 20, x2: plane.width - 14, y2: 20 },
      { x1: 12, y1: 20, x2: 12, y2: plane.height - 12 },
    ], 1, 0.004),
    material: unlitMaterial(axisColor),
  })
  const shapeFill = new Mesh({ geometry: emptyMeshGeometry(), material: unlitMaterial(rgba(54, 105, 221, 0.13)) })
  const shapeEdges = new Mesh({ geometry: emptyMeshGeometry(), material: unlitMaterial(rgba(54, 105, 221, 0.9)) })
  const canvasDomEdges = name === "client" ? new Mesh({
    geometry: emptyMeshGeometry(),
    material: unlitMaterial(rgba(74, 163, 214, 0.64)),
  }) : undefined
  const viewportFill = name === "content" ? new Mesh({
    geometry: emptyMeshGeometry(),
    material: unlitMaterial(rgba(70, 143, 77, 0.045)),
  }) : undefined
  const viewportEdges = name === "content" ? new Mesh({
    geometry: emptyMeshGeometry(),
    material: unlitMaterial(rgba(70, 143, 77, 0.78)),
  }) : undefined

  const title = new StayText({
    x: plane.labelX,
    y: plane.labelY,
    text: name.toUpperCase(),
    layer: OVERLAY_LAYER,
    zIndex: 20,
    textBaseline: "bottom",
    font: { size: titleSize, fontWeight: 700 },
    fillConfig: { color: plane.stroke },
  })
  const dimension = new StayText({
    x: plane.labelX,
    y: plane.labelY + detailSize + 13,
    text: "0 × 0",
    layer: OVERLAY_LAYER,
    zIndex: 20,
    textBaseline: "bottom",
    font: { size: detailSize, fontWeight: 500 },
    fillConfig: { color: colors.gray },
  })
  const originValue = createOverlayText(plane, { x: 16, y: 7 }, {
    text: "0,0",
    zIndex: 5,
    textBaseline: "top",
    font: { size: detailSize },
    fillConfig: { color: colors.gray },
  })
  const xLabel = createOverlayText(plane, { x: plane.width - 8, y: 14 }, {
    text: "X",
    zIndex: 5,
    textAlign: "right",
    textBaseline: "top",
    font: { size: detailSize, fontWeight: 700 },
    fillConfig: { color: colors.gray },
  })
  const yLabel = createOverlayText(plane, { x: 6, y: plane.height - 5 }, {
    text: "Y",
    zIndex: 5,
    textBaseline: "bottom",
    font: { size: detailSize, fontWeight: 700 },
    fillConfig: { color: colors.gray },
  })
  const dot = new Circle({
    x: 0,
    y: 0,
    radius: Math.max(3, Math.min(5, plane.width * 0.022)),
    layer: OVERLAY_LAYER,
    zIndex: 10,
    fillConfig: { color: colors.orange },
    strokeConfig: { color: colors.paper, lineWidth: 1.5 },
  })
  const value = new StayText({
    x: 0,
    y: 0,
    text: "(0, 0)",
    layer: OVERLAY_LAYER,
    zIndex: 11,
    textBaseline: "bottom",
    font: { size: detailSize, fontWeight: 700 },
    fillConfig: { color: colors.orange },
  })
  const viewportLabel = name === "content" ? new StayText({
    x: 0,
    y: 0,
    text: "VIEWPORT",
    layer: OVERLAY_LAYER,
    zIndex: 6,
    textBaseline: "top",
    font: { size: detailSize, fontWeight: 700 },
    fillConfig: { color: rgba(70, 143, 77, 0.9) },
  }) : undefined

  const meshes: PlaneMeshes = {
    frameFill,
    frameEdges,
    grid,
    axes,
    shapeFill,
    shapeEdges,
    canvasDomEdges,
    viewportFill,
    viewportEdges,
  }
  const overlay: PlaneOverlay = {
    title,
    dimension,
    originValue,
    xLabel,
    yLabel,
    dot,
    value,
    viewportLabel,
  }
  return {
    meshes: Object.values(meshes).filter((mesh): mesh is Mesh => Boolean(mesh)),
    overlays: Object.values(overlay).filter((shape): shape is Circle | StayText => Boolean(shape)),
    runtime: { ...plane, basis, meshes, overlay },
  }
}

function updateShapeProjection(plane: PlaneRuntime, rect: Rect) {
  const clip = { x: 0, y: 0, width: plane.width, height: plane.height }
  const visible = clippedRect(rect, clip)
  updateMeshRect(plane.meshes.shapeFill, plane, visible, 0.006)
  updateMeshLines(plane.meshes.shapeEdges, plane, clippedRectEdges(rect, clip), 1.4, 0.008)
}

function updateViewportProjection(plane: PlaneRuntime, rect: Rect) {
  const { viewportFill, viewportEdges } = plane.meshes
  const viewportLabel = plane.overlay.viewportLabel
  if (!viewportFill || !viewportEdges || !viewportLabel) return
  const clip = { x: 0, y: 0, width: plane.width, height: plane.height }
  const visible = clippedRect(rect, clip)
  updateMeshRect(viewportFill, plane, visible, 0.005)
  updateMeshLines(viewportEdges, plane, clippedRectEdges(rect, clip), 1.4, 0.007)
  const labelVisible = visible && visible.width >= 52 && visible.height >= 24
  const labelPoint = visible
    ? projectPlanePoint(plane, { x: visible.x + 7, y: visible.y + 6 })
    : { x: 0, y: 0 }
  viewportLabel.update({
    ...labelPoint,
    fillConfig: { color: rgba(70, 143, 77, labelVisible ? 0.9 : 0) },
  })
}

function updateClientCanvasEdges(plane: PlaneRuntime, rect: Rect) {
  const canvasDomEdges = plane.meshes.canvasDomEdges
  if (!canvasDomEdges) return
  const clip = { x: 0, y: 0, width: plane.width, height: plane.height }
  const segments = clippedRectEdges(rect, clip).flatMap((edge) =>
    edge ? dashedSegments(edge, 5, 4) : [])
  updateMeshLines(canvasDomEdges, plane, segments, 1.15, 0.007)
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
        color: rgba(78, 89, 104, active ? 0.2 : 0.065),
        lineWidth: active ? 1 : 0.8,
        dash: [4, 6],
      },
    })
  })
}

export function CoordinateStack({
  clientRange,
  mappingFocus,
  probe,
  viewport,
}: {
  clientRange: Readonly<Rect>
  mappingFocus: CoordinateMappingFocus
  probe: CoordinateProbe
  viewport: Readonly<ViewportState>
}) {
  const { text } = useI18n()
  const runtimeRef = useRef<StackRuntime>()
  const camera = useMemo(() => createCoordinateCamera(), [])
  const lights = useMemo(() => [
    new AmbientLight({ color: [0.92, 0.97, 1], intensity: 0.78 }),
    new DirectionalLight({
      directionToLight: [-0.45, 0.7, 1],
      color: [1, 0.96, 0.88],
      intensity: 0.34,
    }),
  ], [])
  const layers = useMemo<CanvasLayerConfig[]>(() => [
    {
      backend: "webgl2",
      camera,
      lights,
    },
    { backend: "canvas2d" },
  ], [camera, lights])

  const update = (sample: CoordinateProbe, currentViewport: Readonly<ViewportState>) => {
    const runtime = runtimeRef.current
    if (!runtime) return
    const shapeProjection = projectContentRect(sample, currentViewport)
    const points: Partial<Record<PlaneName, Coordinate>> = {}
    const ranges = {} as Record<PlaneName, PlaneRange>
    const materialFocusChanged = runtime.materialFocus !== mappingFocus

    for (const name of Object.keys(runtime.planes) as PlaneName[]) {
      const plane = runtime.planes[name]
      const range = planeRange(name, plane, sample, clientRange)
      ranges[name] = range
      const value = sample[name]
      const localPoint = pointOnPlane(plane, value, range)
      const contentPoint = pointIsInsidePlane(plane, localPoint)
        ? projectPlanePoint(plane, localPoint)
        : undefined
      const localShape = rectOnPlane(plane, shapeProjection[name], range)
      const isActive = planeIsActive(name, mappingFocus)

      if (materialFocusChanged) {
        plane.meshes.frameFill.setMaterial(lambertMaterial({
          ...plane.fill,
          a: isActive ? plane.fill.a : plane.fill.a * 0.72,
        }))
        plane.meshes.frameEdges.setMaterial(unlitMaterial({
          ...plane.stroke,
          a: isActive ? plane.stroke.a : plane.stroke.a * 0.68,
        }))
      }
      plane.overlay.title.update({
        fillConfig: { color: { ...plane.stroke, a: isActive ? 1 : 0.68 } },
      })
      plane.overlay.dimension.update({
        text: `${Math.round(range.width)} × ${Math.round(range.height)}`,
        fillConfig: { color: rgba(78, 89, 104, isActive ? 0.72 : 0.5) },
      })
      plane.overlay.dot.update({
        ...(contentPoint ?? { x: 0, y: 0 }),
        fillConfig: { color: { ...colors.orange, a: contentPoint ? 1 : 0 } },
        strokeConfig: { color: { ...colors.paper, a: contentPoint ? 1 : 0 }, lineWidth: 1.5 },
      })
      const valueOnRight = localPoint.x < plane.width * 0.72
      plane.overlay.value.update({
        x: contentPoint ? contentPoint.x + (valueOnRight ? 10 : -10) : 0,
        y: contentPoint ? Math.max(12, contentPoint.y - 8) : 0,
        text: `(${formatPoint(value)})`,
        textAlign: valueOnRight ? "left" : "right",
        fillConfig: { color: { ...colors.orange, a: contentPoint ? 1 : 0 } },
      })

      if (name === "content") {
        updateViewportProjection(
          plane,
          rectOnPlane(plane, visibleContentRange(sample, currentViewport), range),
        )
      }
      if (name === "client") {
        updateClientCanvasEdges(plane, rectOnPlane(plane, {
          x: sample.surface.left,
          y: sample.surface.top,
          width: sample.surface.width,
          height: sample.surface.height,
        }, range))
      }
      updateShapeProjection(plane, localShape)
      if (contentPoint) points[name] = contentPoint
    }

    const clientViewActive = mappingFocus === "view-client"
    const clientCanvasDom = rectOnPlane(runtime.planes.client, {
      x: sample.surface.left,
      y: sample.surface.top,
      width: sample.surface.width,
      height: sample.surface.height,
    }, ranges.client)
    const viewPlaneRect = {
      x: 0,
      y: 0,
      width: runtime.planes.view.width,
      height: runtime.planes.view.height,
    }
    const visibleContent = visibleContentRange(sample, currentViewport)
    const contentViewport = rectOnPlane(runtime.planes.content, visibleContent, ranges.content)
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
    const updateRay = (
      line: Line,
      start: Coordinate | undefined,
      end: Coordinate | undefined,
      alpha: number,
      lineWidth: number,
    ) => line.update({
      x1: start?.x ?? 0,
      y1: start?.y ?? 0,
      x2: end?.x ?? 0,
      y2: end?.y ?? 0,
      strokeConfig: { color: rgba(224, 102, 61, start && end ? alpha : 0), lineWidth },
    })
    updateRay(runtime.rays[0], points.client, points.view, clientViewActive ? 0.88 : 0.48, clientViewActive ? 1.7 : 1.2)
    updateRay(runtime.rays[1], points.view, points.content, clientViewActive ? 0.48 : 0.88, clientViewActive ? 1.2 : 1.7)
    runtime.materialFocus = mappingFocus
  }

  useEffect(() => update(probe, viewport), [clientRange, mappingFocus, probe, viewport])

  const mounted = (tools: StayTools) => {
    const canvasArea = sceneCanvasArea(tools, STACK_WIDTH, STACK_HEIGHT)
    const definitions = createPlaneDefinitions(canvasArea.width, canvasArea.height)
    const planeNames: PlaneName[] = ["client", "view", "content"]
    const planes = {} as Record<PlaneName, PlaneRuntime>
    const meshes: Mesh[] = []
    const overlays: Array<Circle | Line | StayText> = []

    planeNames.forEach((name) => {
      const created = createPlaneRuntime(name, definitions[name], canvasArea.width, canvasArea.height)
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
    const rayStyle = { color: rgba(224, 102, 61, 0.72), lineWidth: 1.4 }
    const rays: [Line, Line] = [
      new Line({ x1: 0, y1: 0, x2: 0, y2: 0, layer: OVERLAY_LAYER, zIndex: 9, strokeConfig: rayStyle }),
      new Line({ x1: 0, y1: 0, x2: 0, y2: 0, layer: OVERLAY_LAYER, zIndex: 9, strokeConfig: rayStyle }),
    ]
    overlays.push(...clientViewLinks, ...viewContentLinks, ...rays)

    tools.webgl.appendChild({ className: "coordinate-native-scene", layer: WEBGL_LAYER, meshes })
    tools.appendChild({ className: "coordinate-scene-overlay", shape: overlays })
    runtimeRef.current = { planes, clientViewLinks, viewContentLinks, rays }
    update(probe, viewport)
  }

  return (
    <section aria-label={text("Three coordinate planes", "三层坐标空间")} className={`coordinate-stack-exhibit coordinate-focus-${mappingFocus}`}>
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

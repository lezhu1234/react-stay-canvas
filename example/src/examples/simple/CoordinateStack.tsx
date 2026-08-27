import { useEffect, useRef } from "react"
import {
  Circle,
  Line,
  Rectangle,
  StayCanvas,
  StayText,
  type ChildTransform,
  type Coordinate,
  type Rect,
  type StayInstantChild,
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
  visibleContentRange,
} from "./coordinateLabModel"

const STACK_WIDTH = 240
const STACK_HEIGHT = 120
const PLANE_ASPECT_RATIO = 4 / 3
const PLANE_GRID_COLUMNS = 6
const PLANE_GRID_ROWS = 5

type CoordinateStackHotData = { coordinateStackRevision?: number }

const hotRuntime = (import.meta as ImportMeta & {
  hot?: { data?: CoordinateStackHotData }
}).hot
const hotData = hotRuntime?.data
const STACK_RUNTIME_REVISION = (hotData?.coordinateStackRevision ?? -1) + 1
if (hotData) hotData.coordinateStackRevision = STACK_RUNTIME_REVISION

type PlaneName = "client" | "view" | "content"

export type CoordinateMappingFocus = "view-client" | "content-view"

type PlaneRange = { x: number; y: number; width: number; height: number }

type PlaneDefinition = {
  width: number
  height: number
  labelX: number
  labelY: number
  layer: number
  transform: ChildTransform
  fill: ReturnType<typeof rgba>
  stroke: ReturnType<typeof rgba>
}

type PlaneRuntime = PlaneDefinition & {
  child: StayInstantChild
  frame: Rectangle
  shadow: Rectangle
  title: StayText
  dimension: StayText
  dot: Circle
  value: StayText
  shape: Rectangle
  shapeEdges: [Line, Line, Line, Line]
  canvasDomEdges?: [Line, Line, Line, Line]
  viewportFill?: Rectangle
  viewportEdges?: [Line, Line, Line, Line]
  viewportLabel?: StayText
}

type StackRuntime = {
  revision: number
  planes: Record<PlaneName, PlaneRuntime>
  clientViewLinks: [Line, Line, Line, Line]
  viewContentLinks: [Line, Line, Line, Line]
  rays: [Line, Line]
}

const planePalette = {
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

function createDefinitions(width: number, height: number): Record<PlaneName, PlaneDefinition> {
  const horizontalPadding = Math.max(10, width * 0.03)
  const gap = Math.max(12, width * 0.055)
  const labelSpace = Math.max(28, Math.min(44, height * 0.18))
  const bottomPadding = Math.max(8, height * 0.04)
  const widthBound = (width - horizontalPadding * 2 - gap * 2) / 3
  const heightBound = (height - labelSpace - bottomPadding) * PLANE_ASPECT_RATIO
  const planeWidth = Math.max(1, Math.min(widthBound, heightBound))
  const planeHeight = planeWidth / PLANE_ASPECT_RATIO
  const groupWidth = planeWidth * 3 + gap * 2
  const startX = (width - groupWidth) / 2
  const blockTop = Math.max(4, (height - labelSpace - planeHeight - bottomPadding) / 2)
  const planeY = blockTop + labelSpace
  const labelY = planeY - Math.min(30, labelSpace * 0.72)

  const definition = (
    name: PlaneName,
    index: number,
    rotation: number,
    skewY: number,
  ): PlaneDefinition => {
    const x = startX + index * (planeWidth + gap)
    return {
      width: planeWidth,
      height: planeHeight,
      labelX: x,
      labelY,
      layer: index,
      transform: { x, y: planeY, rotation, skewY },
      ...planePalette[name],
    }
  }

  return {
    client: definition("client", 0, -1.2, -0.25),
    view: definition("view", 1, 0.2, 0.12),
    content: definition("content", 2, 1.2, 0.25),
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

function updateShapeProjection(plane: PlaneRuntime, rect: Rect) {
  const clip = { x: 0, y: 0, width: plane.width, height: plane.height }
  const visible = clippedRect(rect, clip)
  plane.shape.update({
    ...(visible ?? { x: 0, y: 0, width: 0, height: 0 }),
    fillConfig: { color: rgba(54, 105, 221, visible ? 0.13 : 0) },
    strokeConfig: { color: rgba(54, 105, 221, 0), lineWidth: 0 },
  })
  clippedRectEdges(rect, clip).forEach((edge, index) => {
    plane.shapeEdges[index].update({
      ...(edge ?? { x1: 0, y1: 0, x2: 0, y2: 0 }),
      strokeConfig: { color: rgba(54, 105, 221, edge ? 0.9 : 0), lineWidth: 1.4 },
    })
  })
}

function updateFrameEdges(
  edges: [Line, Line, Line, Line] | undefined,
  rect: Rect,
  clip: Rect,
  color: ReturnType<typeof rgba>,
  lineWidth: number,
  dash?: number[],
) {
  if (!edges) return
  clippedRectEdges(rect, clip).forEach((edge, index) => {
    edges[index].update({
      ...(edge ?? { x1: 0, y1: 0, x2: 0, y2: 0 }),
      strokeConfig: { color: { ...color, a: edge ? color.a : 0 }, lineWidth, dash },
    })
  })
}

function updateViewportProjection(plane: PlaneRuntime, rect: Rect) {
  if (!plane.viewportFill || !plane.viewportEdges || !plane.viewportLabel) return
  const clip = { x: 0, y: 0, width: plane.width, height: plane.height }
  const visible = clippedRect(rect, clip)
  plane.viewportFill.update({
    ...(visible ?? { x: 0, y: 0, width: 0, height: 0 }),
    fillConfig: { color: rgba(70, 143, 77, visible ? 0.045 : 0) },
    strokeConfig: { color: rgba(70, 143, 77, 0), lineWidth: 0 },
  })
  updateFrameEdges(plane.viewportEdges, rect, clip, rgba(70, 143, 77, 0.78), 1.4)
  const labelVisible = visible && visible.width >= 52 && visible.height >= 24
  plane.viewportLabel.update({
    x: visible ? visible.x + 7 : 0,
    y: visible ? visible.y + 6 : 0,
    fillConfig: { color: rgba(70, 143, 77, labelVisible ? 0.9 : 0) },
  })
}

function gridPosition(index: number, count: number, size: number) {
  return index / (count + 1) * size
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
  correspondingRectCorners(fromRect, toRect).forEach(({ from, to }, index) => {
    const start = fromPlane.child.toContentPoint(from)
    const end = toPlane.child.toContentPoint(to)
    lines[index].update({
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      strokeConfig: {
        color: rgba(78, 89, 104, visible ? (active ? 0.2 : 0.065) : 0),
        lineWidth: active ? 1 : 0.8,
        dash: [4, 6],
      },
    })
  })
}

function createGrid(plane: PlaneDefinition) {
  const gridColor = { ...plane.stroke, a: 0.1 }
  const gridX = Array.from({ length: PLANE_GRID_COLUMNS }, (_, index) => new Line({
    x1: gridPosition(index + 1, PLANE_GRID_COLUMNS, plane.width),
    y1: 0,
    x2: gridPosition(index + 1, PLANE_GRID_COLUMNS, plane.width),
    y2: plane.height,
    layer: plane.layer,
    zIndex: 1,
    strokeConfig: { color: gridColor, lineWidth: 1 },
  }))
  const gridY = Array.from({ length: PLANE_GRID_ROWS }, (_, index) => new Line({
    x1: 0,
    y1: gridPosition(index + 1, PLANE_GRID_ROWS, plane.height),
    x2: plane.width,
    y2: gridPosition(index + 1, PLANE_GRID_ROWS, plane.height),
    layer: plane.layer,
    zIndex: 1,
    strokeConfig: { color: gridColor, lineWidth: 1 },
  }))
  return { gridX, gridY }
}

function createPlaneRuntime(
  tools: StayTools,
  name: PlaneName,
  plane: PlaneDefinition,
): { labels: [StayText, StayText]; runtime: PlaneRuntime } {
  const { gridX, gridY } = createGrid(plane)
  const titleSize = Math.max(8, Math.min(13, plane.width * 0.06))
  const detailSize = Math.max(6, Math.min(9, plane.width * 0.04))
  const title = new StayText({
    x: plane.labelX,
    y: plane.labelY,
    text: name.toUpperCase(),
    layer: 2,
    zIndex: 20,
    textBaseline: "bottom",
    font: { size: titleSize, fontWeight: 700 },
    fillConfig: { color: plane.stroke },
  })
  const dimension = new StayText({
    x: plane.labelX,
    y: plane.labelY + detailSize + 5,
    text: "0 × 0",
    layer: 2,
    zIndex: 20,
    textBaseline: "bottom",
    font: { size: detailSize, fontWeight: 500 },
    fillConfig: { color: colors.gray },
  })
  const shadow = new Rectangle({
    x: 4,
    y: 7,
    width: plane.width,
    height: plane.height,
    layer: plane.layer,
    zIndex: -2,
    filter: "blur(9px)",
    fillConfig: { color: { ...plane.stroke, a: 0.1 } },
    strokeConfig: { color: rgba(39, 51, 67, 0), lineWidth: 0 },
  })
  const frame = new Rectangle({
    x: 0,
    y: 0,
    width: plane.width,
    height: plane.height,
    layer: plane.layer,
    zIndex: 0,
    fillConfig: { color: plane.fill },
    strokeConfig: { color: plane.stroke, lineWidth: 1.25 },
  })
  const axisColor = rgba(78, 89, 104, 0.24)
  const xAxis = new Line({
    x1: 12,
    y1: 20,
    x2: plane.width - 14,
    y2: 20,
    layer: plane.layer,
    zIndex: 3,
    strokeConfig: { color: axisColor, lineWidth: 1 },
  })
  const yAxis = new Line({
    x1: 12,
    y1: 20,
    x2: 12,
    y2: plane.height - 12,
    layer: plane.layer,
    zIndex: 3,
    strokeConfig: { color: axisColor, lineWidth: 1 },
  })
  const originValue = new StayText({
    x: 16,
    y: 7,
    text: "0,0",
    layer: plane.layer,
    zIndex: 5,
    textBaseline: "top",
    font: { size: detailSize },
    fillConfig: { color: colors.gray },
  })
  const xLabel = new StayText({
    x: plane.width - 8,
    y: 14,
    text: "X",
    layer: plane.layer,
    zIndex: 5,
    textAlign: "right",
    textBaseline: "top",
    font: { size: detailSize, fontWeight: 700 },
    fillConfig: { color: colors.gray },
  })
  const yLabel = new StayText({
    x: 6,
    y: plane.height - 5,
    text: "Y",
    layer: plane.layer,
    zIndex: 5,
    textBaseline: "bottom",
    font: { size: detailSize, fontWeight: 700 },
    fillConfig: { color: colors.gray },
  })
  const canvasDomEdges = name === "client" ? Array.from({ length: 4 }, () => new Line({
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    layer: plane.layer,
    zIndex: 4,
    strokeConfig: { color: rgba(74, 163, 214, 0.64), lineWidth: 1.15, dash: [5, 4] },
  })) as [Line, Line, Line, Line] : undefined
  const viewportFill = name === "content" ? new Rectangle({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    layer: plane.layer,
    zIndex: 4,
    fillConfig: { color: rgba(70, 143, 77, 0.045) },
    strokeConfig: { color: rgba(70, 143, 77, 0), lineWidth: 0 },
  }) : undefined
  const viewportEdges = name === "content" ? Array.from({ length: 4 }, () => new Line({
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    layer: plane.layer,
    zIndex: 5,
    strokeConfig: { color: rgba(70, 143, 77, 0.78), lineWidth: 1.4 },
  })) as [Line, Line, Line, Line] : undefined
  const viewportLabel = name === "content" ? new StayText({
    x: 0,
    y: 0,
    text: "VIEWPORT",
    layer: plane.layer,
    zIndex: 6,
    textBaseline: "top",
    font: { size: detailSize, fontWeight: 700 },
    fillConfig: { color: rgba(70, 143, 77, 0.9) },
  }) : undefined
  const shape = new Rectangle({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    layer: plane.layer,
    zIndex: 7,
    fillConfig: { color: colors.blueSoft },
    strokeConfig: { color: rgba(54, 105, 221, 0), lineWidth: 0 },
  })
  const shapeEdges = Array.from({ length: 4 }, () => new Line({
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    layer: plane.layer,
    zIndex: 8,
    strokeConfig: { color: colors.blue, lineWidth: 1.4 },
  })) as [Line, Line, Line, Line]
  const dot = new Circle({
    x: 0,
    y: 0,
    radius: Math.max(3, Math.min(5, plane.width * 0.022)),
    layer: plane.layer,
    zIndex: 10,
    fillConfig: { color: colors.orange },
    strokeConfig: { color: colors.paper, lineWidth: 1.5 },
  })
  const value = new StayText({
    x: 0,
    y: 0,
    text: "(0, 0)",
    layer: plane.layer,
    zIndex: 11,
    textBaseline: "bottom",
    font: { size: detailSize, fontWeight: 700 },
    fillConfig: { color: colors.orange },
  })
  const child = tools.appendChild({
    className: `coordinate-plane-${name}`,
    transform: plane.transform,
    shape: [
      shadow,
      frame,
      ...gridX,
      ...gridY,
      xAxis,
      yAxis,
      originValue,
      xLabel,
      yLabel,
      ...(canvasDomEdges ?? []),
      ...(viewportFill ? [viewportFill] : []),
      ...(viewportEdges ?? []),
      ...(viewportLabel ? [viewportLabel] : []),
      shape,
      ...shapeEdges,
      dot,
      value,
    ],
  })
  return {
    labels: [title, dimension],
    runtime: {
      ...plane,
      child,
      frame,
      shadow,
      title,
      dimension,
      dot,
      value,
      shape,
      shapeEdges,
      canvasDomEdges,
      viewportFill,
      viewportEdges,
      viewportLabel,
    },
  }
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

  const update = (sample: CoordinateProbe, currentViewport: Readonly<ViewportState>) => {
    const runtime = runtimeRef.current
    if (!runtime || runtime.revision !== STACK_RUNTIME_REVISION) return
    const shapeProjection = projectContentRect(sample, currentViewport)
    const points = {} as Record<PlaneName, Coordinate>
    const ranges = {} as Record<PlaneName, PlaneRange>

    for (const name of Object.keys(runtime.planes) as PlaneName[]) {
      const plane = runtime.planes[name]
      const range = planeRange(name, plane, sample, clientRange)
      ranges[name] = range
      const value = sample[name]
      const localPoint = pointOnPlane(plane, value, range)
      const localShape = rectOnPlane(plane, shapeProjection[name], range)
      const isActive = planeIsActive(name, mappingFocus)

      plane.frame.update({
        fillConfig: { color: { ...plane.fill, a: isActive ? plane.fill.a : plane.fill.a * 0.72 } },
        strokeConfig: { color: { ...plane.stroke, a: isActive ? plane.stroke.a : plane.stroke.a * 0.68 }, lineWidth: isActive ? 1.35 : 1 },
      })
      plane.shadow.update({
        fillConfig: { color: { ...plane.stroke, a: isActive ? 0.12 : 0.065 } },
      })
      plane.title.update({ fillConfig: { color: { ...plane.stroke, a: isActive ? 1 : 0.68 } } })
      plane.dimension.update({
        text: `${Math.round(range.width)} × ${Math.round(range.height)}`,
        fillConfig: { color: rgba(78, 89, 104, isActive ? 0.72 : 0.5) },
      })
      plane.dot.update(localPoint)
      const valueOnRight = localPoint.x < plane.width * 0.72
      plane.value.update({
        x: localPoint.x + (valueOnRight ? 10 : -10),
        y: Math.max(12, localPoint.y - 8),
        text: `(${formatPoint(value)})`,
        textAlign: valueOnRight ? "left" : "right",
      })
      if (name === "content") {
        updateViewportProjection(
          plane,
          rectOnPlane(plane, visibleContentRange(sample, currentViewport), range),
        )
      }
      if (name === "client") {
        updateFrameEdges(
          plane.canvasDomEdges,
          rectOnPlane(plane, {
            x: sample.surface.left,
            y: sample.surface.top,
            width: sample.surface.width,
            height: sample.surface.height,
          }, range),
          { x: 0, y: 0, width: plane.width, height: plane.height },
          rgba(74, 163, 214, 0.64),
          1.15,
          [5, 4],
        )
      }
      updateShapeProjection(plane, localShape)
      points[name] = plane.child.toContentPoint(localPoint)
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
    const contentViewport = rectOnPlane(
      runtime.planes.content,
      visibleContent,
      ranges.content,
    )
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
    runtime.rays[0].update({
      x1: points.client.x,
      y1: points.client.y,
      x2: points.view.x,
      y2: points.view.y,
      strokeConfig: { color: rgba(224, 102, 61, clientViewActive ? 0.88 : 0.48), lineWidth: clientViewActive ? 1.7 : 1.2 },
    })
    runtime.rays[1].update({
      x1: points.view.x,
      y1: points.view.y,
      x2: points.content.x,
      y2: points.content.y,
      strokeConfig: { color: rgba(224, 102, 61, clientViewActive ? 0.48 : 0.88), lineWidth: clientViewActive ? 1.2 : 1.7 },
    })
  }

  useEffect(() => update(probe, viewport), [clientRange, mappingFocus, probe, viewport])

  const mounted = (tools: StayTools) => {
    const canvasArea = sceneCanvasArea(tools, STACK_WIDTH, STACK_HEIGHT)
    const definitions = createDefinitions(canvasArea.width, canvasArea.height)
    const planeNames: PlaneName[] = ["client", "view", "content"]
    const planes = {} as Record<PlaneName, PlaneRuntime>
    const overlayLabels: StayText[] = []

    planeNames.forEach((name) => {
      const created = createPlaneRuntime(tools, name, definitions[name])
      planes[name] = created.runtime
      overlayLabels.push(...created.labels)
    })

    const rayStyle = { color: rgba(224, 102, 61, 0.72), lineWidth: 1.4 }
    const createMappingLinks = () => Array.from({ length: 4 }, () => new Line({
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      layer: 0,
      zIndex: -20,
      strokeConfig: { color: rgba(78, 89, 104, 0.12), lineWidth: 0.9, dash: [4, 6] },
    })) as [Line, Line, Line, Line]
    const clientViewLinks = createMappingLinks()
    const viewContentLinks = createMappingLinks()
    const rays: [Line, Line] = [
      new Line({ x1: 0, y1: 0, x2: 0, y2: 0, layer: 2, zIndex: 9, strokeConfig: rayStyle }),
      new Line({ x1: 0, y1: 0, x2: 0, y2: 0, layer: 2, zIndex: 9, strokeConfig: rayStyle }),
    ]
    tools.appendChild({
      className: "coordinate-projection-ray",
      shape: [...clientViewLinks, ...viewContentLinks, ...rays, ...overlayLabels],
    })
    runtimeRef.current = {
      revision: STACK_RUNTIME_REVISION,
      planes,
      clientViewLinks,
      viewContentLinks,
      rays,
    }
    update(probe, viewport)
  }

  return (
    <section aria-label={text("Three coordinate planes", "三层坐标空间")} className={`coordinate-stack-exhibit coordinate-focus-${mappingFocus}`}>
      <CanvasSurface className="coordinate-stack-surface" shrinkToViewport>
        <StayCanvas
          className="demo-canvas coordinate-stack-canvas"
          focusOnInit={false}
          height={STACK_HEIGHT}
          key={`coordinate-stack-${STACK_RUNTIME_REVISION}`}
          layers={3}
          mounted={mounted}
          width={STACK_WIDTH}
        />
      </CanvasSurface>
    </section>
  )
}

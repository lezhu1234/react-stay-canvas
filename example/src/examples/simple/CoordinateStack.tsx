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

import { CanvasCard, colors, rgba, sceneCanvasArea } from "../../components/DemoKit"
import { useI18n } from "../../i18n"
import {
  clippedRectEdges,
  containsRect,
  contentReferenceRange,
  correspondingRectCorners,
  formatPoint,
  formatRect,
  LAB_CONTENT_BOUNDS,
  projectClientPlane,
  projectContentRect,
  projectRectToRange,
  type CoordinateProbe,
  visibleContentRange,
} from "./coordinateLabModel"

const STACK_WIDTH = 320
const STACK_HEIGHT = 300
const PLANE_GRID_COLUMNS = 3
const PLANE_GRID_ROWS = 5
const CONTENT_GRID_LINES = 6
const CONTENT_GRID_SIZE = 100

type PlaneName = "client" | "view" | "content"

export type CoordinateMappingFocus = "view-client" | "content-view"

type PlaneRange = { x: number; y: number; width: number; height: number }

type PlaneDefinition = {
  width: number
  height: number
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
  description: StayText
  dot: Circle
  value: StayText
  originValue: StayText
  extentValue: StayText
  shape: Rectangle
  shapeEdges: [Line, Line, Line, Line]
  shapeValue: StayText
  gridX: Line[]
  gridY: Line[]
  contentBounds: Rectangle
  contentBoundsEdges: [Line, Line, Line, Line]
  canvasDom?: Rectangle
  visibleWindow?: Rectangle
  visibleWindowValue?: StayText
}

type StackRuntime = {
  planes: Record<PlaneName, PlaneRuntime>
  rays: [Line, Line]
  clientViewLinks: [Line, Line, Line, Line]
  viewContentLinks: [Line, Line, Line, Line]
  transformLabels: [StayText, StayText, StayText, StayText]
}

function createDefinitions(width: number, height: number): Record<PlaneName, PlaneDefinition> {
  const planeWidth = width * 0.245
  const planeHeight = height * 0.58
  return {
    client: {
      width: planeWidth,
      height: planeHeight,
      layer: 0,
      transform: { x: width * 0.075, y: height * 0.245, rotation: -2.5, skewY: -1.5 },
      fill: rgba(225, 229, 226, 0.5),
      stroke: rgba(124, 132, 145, 0.72),
    },
    view: {
      width: planeWidth,
      height: planeHeight,
      layer: 1,
      transform: { x: width * 0.375, y: height * 0.205, rotation: 1, skewY: 1.25 },
      fill: rgba(54, 105, 221, 0.12),
      stroke: rgba(54, 105, 221, 0.82),
    },
    content: {
      width: planeWidth,
      height: planeHeight,
      layer: 2,
      transform: { x: width * 0.675, y: height * 0.245, rotation: 2.5, skewY: 1.5 },
      fill: rgba(44, 137, 91, 0.12),
      stroke: rgba(44, 137, 91, 0.88),
    },
  }
}

function planeRange(
  name: PlaneName,
  probe: CoordinateProbe,
  clientRange: Readonly<Rect>,
): PlaneRange {
  if (name === "client") {
    return clientRange
  }
  if (name === "view") {
    return { x: 0, y: 0, width: probe.viewSize.width, height: probe.viewSize.height }
  }
  return contentReferenceRange(probe)
}

function valueForPlane(name: PlaneName, probe: CoordinateProbe) {
  return probe[name]
}

function pointOnPlane(plane: PlaneDefinition, value: Coordinate, range: PlaneRange) {
  return {
    x: (value.x - range.x) / Math.max(1, range.width) * plane.width,
    y: (value.y - range.y) / Math.max(1, range.height) * plane.height,
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

function gridPosition(index: number, count: number, start: number, size: number) {
  return start + index / (count + 1) * size
}

function createGrid(
  plane: PlaneDefinition,
  columns: number,
  rows: number,
) {
  const gridColor = rgba(78, 89, 104, 0.12)
  const gridX = Array.from({ length: columns }, (_, index) => new Line({
    x1: gridPosition(index + 1, columns, 0, plane.width),
    y1: 0,
    x2: gridPosition(index + 1, columns, 0, plane.width),
    y2: plane.height,
    layer: plane.layer,
    zIndex: 2,
    strokeConfig: { color: gridColor, lineWidth: 1 },
  }))
  const gridY = Array.from({ length: rows }, (_, index) => new Line({
    x1: 0,
    y1: gridPosition(index + 1, rows, 0, plane.height),
    x2: plane.width,
    y2: gridPosition(index + 1, rows, 0, plane.height),
    layer: plane.layer,
    zIndex: 2,
    strokeConfig: { color: gridColor, lineWidth: 1 },
  }))
  return { gridX, gridY }
}

function updateClippedProjection({
  fill,
  edges,
  rect,
  plane,
  color,
  fillAlpha,
  strokeAlpha,
  clip = { x: 0, y: 0, width: plane.width, height: plane.height },
}: {
  fill: Rectangle
  edges: [Line, Line, Line, Line]
  rect: Rect
  plane: PlaneDefinition
  color: { r: number; g: number; b: number }
  fillAlpha: number
  strokeAlpha: number
  clip?: Rect
}) {
  const visible = clippedRect(rect, clip)
  fill.update({
    ...(visible ?? { x: 0, y: 0, width: 0, height: 0 }),
    fillConfig: { color: { ...color, a: visible ? fillAlpha : 0 } },
    strokeConfig: { color: { ...color, a: 0 }, lineWidth: 0 },
  })
  clippedRectEdges(rect, clip)
    .forEach((edge, index) => {
      edges[index].update({
        ...(edge ?? { x1: 0, y1: 0, x2: 0, y2: 0 }),
        strokeConfig: { color: { ...color, a: edge ? strokeAlpha : 0 }, lineWidth: 2 },
      })
    })
  return visible
}

function updateContentReference(
  plane: PlaneRuntime,
  probe: CoordinateProbe,
  viewport: Readonly<ViewportState>,
) {
  const range = contentReferenceRange(probe)
  const firstX = Math.ceil(range.x / CONTENT_GRID_SIZE) * CONTENT_GRID_SIZE
  const firstY = Math.ceil(range.y / CONTENT_GRID_SIZE) * CONTENT_GRID_SIZE
  plane.gridX.forEach((line, index) => {
    const coordinate = firstX + index * CONTENT_GRID_SIZE
    const x = (coordinate - range.x) / range.width * plane.width
    const visible = coordinate <= range.x + range.width
    line.update({
      x1: x,
      y1: 0,
      x2: x,
      y2: plane.height,
      strokeConfig: { color: rgba(44, 137, 91, visible ? 0.07 : 0), lineWidth: 1 },
    })
  })
  plane.gridY.forEach((line, index) => {
    const coordinate = firstY + index * CONTENT_GRID_SIZE
    const y = (coordinate - range.y) / range.height * plane.height
    const visible = coordinate <= range.y + range.height
    line.update({
      x1: 0,
      y1: y,
      x2: plane.width,
      y2: y,
      strokeConfig: { color: rgba(44, 137, 91, visible ? 0.07 : 0), lineWidth: 1 },
    })
  })

  const visibleRange = visibleContentRange(probe, viewport)
  const containsVisibleWindow = containsRect(range, visibleRange)
  const projectedVisibleWindow = rectOnPlane(plane, visibleRange, range)
  const visibleWindow = clippedRect(
    projectedVisibleWindow,
    { x: 0, y: 0, width: plane.width, height: plane.height },
  )
  plane.visibleWindow?.update({
    ...(visibleWindow ?? { x: 0, y: 0, width: 0, height: 0 }),
    fillConfig: { color: rgba(44, 137, 91, visibleWindow ? 0.05 : 0) },
    strokeConfig: { color: rgba(44, 137, 91, containsVisibleWindow ? 0.64 : 0), lineWidth: 1, dash: [5, 4] },
  })
  plane.visibleWindowValue?.update({
    text: `${containsVisibleWindow ? "viewport" : "viewport extends outside reference"} ${formatRect(visibleRange)}`,
  })
  return { projectedVisibleWindow, containsVisibleWindow }
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
    if (!runtime) return
    const shapeProjection = projectContentRect(sample, currentViewport)
    const boundsProjection = projectContentRect(sample, currentViewport, LAB_CONTENT_BOUNDS)
    const points = {} as Record<PlaneName, Coordinate>
    const clientFrame = projectClientPlane(
      sample,
      currentViewport,
      clientRange,
      runtime.planes.client,
    )
    const clientCanvasDom = clientFrame.canvasDom

    for (const name of Object.keys(runtime.planes) as PlaneName[]) {
      const plane = runtime.planes[name]
      const isActive = planeIsActive(name, mappingFocus)
      const range = planeRange(name, sample, clientRange)
      const value = valueForPlane(name, sample)
      const localPoint = name === "client" ? clientFrame.point : pointOnPlane(plane, value, range)
      const localShape = name === "client" ? clientFrame.shape : rectOnPlane(plane, shapeProjection[name], range)
      const projectedContentBounds = name === "client"
        ? clientFrame.contentBounds
        : rectOnPlane(plane, boundsProjection[name], range)
      const projectionClip = name === "client"
        ? clientCanvasDom
        : { x: 0, y: 0, width: plane.width, height: plane.height }
      plane.frame.update({
        fillConfig: {
          color: {
            ...plane.fill,
            a: isActive ? plane.fill.a : plane.fill.a * 0.52,
          },
        },
        strokeConfig: {
          color: {
            ...plane.stroke,
            a: isActive ? Math.min(1, plane.stroke.a + 0.1) : plane.stroke.a * 0.42,
          },
          lineWidth: isActive ? 2 : 1,
        },
      })
      plane.shadow.update({
        fillConfig: { color: rgba(39, 51, 67, isActive ? 0.12 : 0.045) },
      })
      plane.title.update({
        fillConfig: {
          color: { ...plane.stroke, a: isActive ? 1 : 0.48 },
        },
      })
      plane.description.update({
        fillConfig: { color: rgba(78, 89, 104, isActive ? 0.9 : 0.42) },
      })
      if (name === "client") {
        plane.canvasDom?.update({
          ...projectionClip,
          fillConfig: { color: rgba(54, 105, 221, 0.035) },
          strokeConfig: { color: rgba(78, 89, 104, 0.72), lineWidth: 1, dash: [5, 4] },
        })
      }
      plane.dot.update(localPoint)
      plane.value.update({
        text: text(`pointer ${formatPoint(value)}`, `指针 ${formatPoint(value)}`),
      })
      const visibleShape = updateClippedProjection({
        fill: plane.shape,
        edges: plane.shapeEdges,
        rect: localShape,
        plane,
        color: { r: 54, g: 105, b: 221 },
        fillAlpha: 0.2,
        strokeAlpha: 0.95,
        clip: projectionClip,
      })
      updateClippedProjection({
        fill: plane.contentBounds,
        edges: plane.contentBoundsEdges,
        rect: projectedContentBounds,
        plane,
        color: { r: 44, g: 137, b: 91 },
        fillAlpha: 0.06,
        strokeAlpha: 0.88,
        clip: projectionClip,
      })
      const shapeLabelFits = visibleShape && visibleShape.width >= 48 && visibleShape.height >= 18
      plane.shapeValue.update({
        x: visibleShape ? visibleShape.x + 6 : 0,
        y: visibleShape ? visibleShape.y + 6 : 0,
        text: name === "content" ? text("Shape fixed", "Shape 固定") : "Shape",
        textBaseline: "top",
        fillConfig: { color: rgba(54, 105, 221, shapeLabelFits ? 1 : 0) },
      })
      plane.originValue.update({
        text: formatPoint(range),
      })
      plane.extentValue.update({
        text: formatPoint({ x: range.x + range.width, y: range.y + range.height }),
      })
      points[name] = plane.child.toContentPoint(localPoint)
    }

    const clientViewActive = mappingFocus === "view-client"
    const contentViewActive = mappingFocus === "content-view"
    runtime.rays[0].update({
      x1: points.client.x,
      y1: points.client.y,
      x2: points.view.x,
      y2: points.view.y,
      strokeConfig: { color: rgba(224, 113, 62, clientViewActive ? 0.7 : 0), lineWidth: clientViewActive ? 2 : 1, dash: [6, 5] },
    })
    runtime.rays[1].update({
      x1: points.view.x,
      y1: points.view.y,
      x2: points.content.x,
      y2: points.content.y,
      strokeConfig: { color: rgba(224, 113, 62, contentViewActive ? 0.7 : 0), lineWidth: contentViewActive ? 2 : 1, dash: [6, 5] },
    })
    correspondingRectCorners(
      clientCanvasDom,
      { x: 0, y: 0, width: runtime.planes.view.width, height: runtime.planes.view.height },
    ).forEach((corners, index) => {
      const start = runtime.planes.client.child.toContentPoint(corners.from)
      const end = runtime.planes.view.child.toContentPoint(corners.to)
      runtime.clientViewLinks[index].update({
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        strokeConfig: { color: rgba(78, 89, 104, clientViewActive ? 0.16 : 0), lineWidth: 1, dash: [4, 6] },
      })
    })
    const contentWindow = updateContentReference(runtime.planes.content, sample, currentViewport)
    correspondingRectCorners(
      { x: 0, y: 0, width: runtime.planes.view.width, height: runtime.planes.view.height },
      contentWindow.projectedVisibleWindow,
    ).forEach((corners, index) => {
      const start = runtime.planes.view.child.toContentPoint(corners.from)
      const end = runtime.planes.content.child.toContentPoint(corners.to)
      runtime.viewContentLinks[index].update({
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        strokeConfig: {
          color: rgba(78, 89, 104, contentWindow.containsVisibleWindow && contentViewActive ? 0.16 : 0),
          lineWidth: 1,
          dash: [4, 6],
        },
      })
    })
    runtime.transformLabels[0].update({ fillConfig: { color: clientViewActive ? colors.blue : rgba(78, 89, 104, 0.38) } })
    runtime.transformLabels[1].update({ fillConfig: { color: rgba(78, 89, 104, clientViewActive ? 0.9 : 0.32) } })
    runtime.transformLabels[2].update({ fillConfig: { color: contentViewActive ? colors.green : rgba(78, 89, 104, 0.38) } })
    runtime.transformLabels[3].update({ fillConfig: { color: rgba(78, 89, 104, contentViewActive ? 0.9 : 0.32) } })
  }

  useEffect(() => update(probe, viewport), [clientRange, mappingFocus, probe, viewport])

  const mounted = (tools: StayTools) => {
    const canvasArea = sceneCanvasArea(tools, STACK_WIDTH, STACK_HEIGHT)
    const definitions = createDefinitions(canvasArea.width, canvasArea.height)
    const planeNames: PlaneName[] = ["client", "view", "content"]
    const labels = {
      client: ["CLIENT", text("Browser window", "浏览器窗口")],
      view: ["VIEW", text("Logical Canvas", "逻辑 Canvas")],
      content: ["CONTENT", text("Scene geometry", "场景几何")],
    }
    const planes = {} as Record<PlaneName, PlaneRuntime>

    planeNames.forEach((name) => {
      const plane = definitions[name]
      const { gridX, gridY } = createGrid(
        plane,
        name === "content" ? CONTENT_GRID_LINES : PLANE_GRID_COLUMNS,
        name === "content" ? CONTENT_GRID_LINES : PLANE_GRID_ROWS,
      )
      const dot = new Circle({
        x: 0,
        y: 0,
        radius: 5,
        layer: plane.layer,
        zIndex: 10,
        fillConfig: { color: colors.orange },
        strokeConfig: { color: colors.paper, lineWidth: 2 },
      })
      const value = new StayText({
        x: plane.width - 10,
        y: 12,
        text: "0, 0",
        layer: plane.layer,
        zIndex: 11,
        textAlign: "right",
        textBaseline: "top",
        font: { size: 8, fontWeight: 700 },
        fillConfig: { color: colors.orange },
      })
      const originValue = new StayText({
        x: 10,
        y: plane.height - 9,
        text: "0, 0",
        layer: plane.layer,
        zIndex: 5,
        textBaseline: "bottom",
        font: { size: 8 },
        fillConfig: { color: colors.gray },
      })
      const extentValue = new StayText({
        x: plane.width - 10,
        y: plane.height - 9,
        text: "0, 0",
        layer: plane.layer,
        zIndex: 5,
        textAlign: "right",
        textBaseline: "bottom",
        font: { size: 8 },
        fillConfig: { color: colors.gray },
      })
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
        strokeConfig: { color: colors.blue, lineWidth: 2 },
      })) as [Line, Line, Line, Line]
      const shapeValue = new StayText({
        x: 10,
        y: 66,
        text: "Shape",
        layer: plane.layer,
        zIndex: 8,
        textBaseline: "bottom",
        font: { size: 8, fontWeight: 700 },
        fillConfig: { color: colors.blue },
      })
      const contentBounds = new Rectangle({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        layer: plane.layer,
        zIndex: 3,
        fillConfig: { color: rgba(44, 137, 91, 0.08) },
        strokeConfig: { color: rgba(44, 137, 91, 0), lineWidth: 0 },
      })
      const contentBoundsEdges = Array.from({ length: 4 }, () => new Line({
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        layer: plane.layer,
        zIndex: 4,
        strokeConfig: { color: colors.green, lineWidth: 2 },
      })) as [Line, Line, Line, Line]
      const visibleWindow = name === "content" ? new Rectangle({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        layer: plane.layer,
        zIndex: 4,
        fillConfig: { color: rgba(44, 137, 91, 0.05) },
        strokeConfig: { color: rgba(44, 137, 91, 0.64), lineWidth: 1, dash: [5, 4] },
      }) : undefined
      const visibleWindowValue = name === "content" ? new StayText({
        x: 10,
        y: plane.height - 28,
        text: "viewport",
        layer: plane.layer,
        zIndex: 6,
        textBaseline: "bottom",
        font: { size: 7, fontWeight: 700 },
        fillConfig: { color: colors.green },
      }) : undefined
      const canvasDom = name === "client" ? new Rectangle({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        layer: plane.layer,
        zIndex: 3,
        fillConfig: { color: rgba(54, 105, 221, 0.035) },
        strokeConfig: { color: rgba(78, 89, 104, 0.72), lineWidth: 1, dash: [5, 4] },
      }) : undefined
      const shadow = new Rectangle({
        x: 7,
        y: 12,
        width: plane.width,
        height: plane.height,
        layer: plane.layer,
        zIndex: -2,
        filter: "blur(10px)",
        fillConfig: { color: rgba(39, 51, 67, 0.12) },
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
        strokeConfig: { color: plane.stroke, lineWidth: 2 },
      })
      const title = new StayText({
        x: 12,
        y: 15,
        text: labels[name][0],
        layer: plane.layer,
        zIndex: 5,
        textBaseline: "top",
        font: { size: 13, fontWeight: 700 },
        fillConfig: { color: plane.stroke },
      })
      const description = new StayText({
        x: 12,
        y: 36,
        text: labels[name][1],
        layer: plane.layer,
        zIndex: 5,
        textBaseline: "top",
        font: { size: 8, fontWeight: 500 },
        fillConfig: { color: colors.gray },
      })
      const child = tools.appendChild({
        className: `coordinate-plane-${name}`,
        transform: plane.transform,
        shape: [
          shadow,
          frame,
          ...gridX,
          ...gridY,
          title,
          description,
          originValue,
          extentValue,
          ...(canvasDom ? [canvasDom] : []),
          contentBounds,
          ...contentBoundsEdges,
          ...(visibleWindow ? [visibleWindow] : []),
          shape,
          ...shapeEdges,
          shapeValue,
          ...(visibleWindowValue ? [visibleWindowValue] : []),
          dot,
          value,
        ],
      })
      planes[name] = {
        ...plane,
        child,
        frame,
        shadow,
        title,
        description,
        dot,
        value,
        originValue,
        extentValue,
        shape,
        shapeEdges,
        shapeValue,
        gridX,
        gridY,
        contentBounds,
        contentBoundsEdges,
        canvasDom,
        visibleWindow,
        visibleWindowValue,
      }
    })

    const rayStyle = { color: rgba(224, 113, 62, 0.08), lineWidth: 1, dash: [6, 5] }
    const rays: [Line, Line] = [
      new Line({ x1: 0, y1: 0, x2: 0, y2: 0, layer: 2, zIndex: 9, strokeConfig: rayStyle }),
      new Line({ x1: 0, y1: 0, x2: 0, y2: 0, layer: 2, zIndex: 9, strokeConfig: rayStyle }),
    ]
    const linkStyle = { color: rgba(78, 89, 104, 0), lineWidth: 1, dash: [4, 6] }
    const clientViewLinks = Array.from({ length: 4 }, () => new Line({
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      layer: 0,
      zIndex: -20,
      strokeConfig: linkStyle,
    })) as [Line, Line, Line, Line]
    const viewContentLinks = Array.from({ length: 4 }, () => new Line({
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      layer: 0,
      zIndex: -20,
      strokeConfig: linkStyle,
    })) as [Line, Line, Line, Line]
    const transformLabels = [
      new StayText({
        x: canvasArea.width * 0.31,
        y: canvasArea.height * 0.12,
        text: "View → Client",
        layer: 1,
        zIndex: 12,
        textBaseline: "middle",
        font: { size: 10, fontWeight: 700 },
        fillConfig: { color: colors.blue },
      }),
      new StayText({
        x: canvasArea.width * 0.31,
        y: canvasArea.height * 0.15,
        text: text("CSS display mapping", "CSS 显示映射"),
        layer: 1,
        zIndex: 12,
        textBaseline: "middle",
        font: { size: 9 },
        fillConfig: { color: colors.gray },
      }),
      new StayText({
        x: canvasArea.width * 0.61,
        y: canvasArea.height * 0.12,
        text: "Content → View",
        layer: 2,
        zIndex: 12,
        textBaseline: "middle",
        font: { size: 10, fontWeight: 700 },
        fillConfig: { color: colors.green },
      }),
      new StayText({
        x: canvasArea.width * 0.61,
        y: canvasArea.height * 0.15,
        text: text("viewport mapping", "viewport 映射"),
        layer: 2,
        zIndex: 12,
        textBaseline: "middle",
        font: { size: 9 },
        fillConfig: { color: colors.gray },
      }),
    ] as [StayText, StayText, StayText, StayText]
    tools.appendChild({ className: "coordinate-projection-ray", shape: [...clientViewLinks, ...viewContentLinks, ...rays, ...transformLabels] })
    runtimeRef.current = { planes, rays, clientViewLinks, viewContentLinks, transformLabels }
    update(probe, viewport)
  }

  return (
    <CanvasCard
      className={`coordinate-stack-card coordinate-focus-${mappingFocus}`}
      title={text("Three coordinate planes", "三层坐标空间")}
      description={text(
        mappingFocus === "view-client"
          ? "CSS changes the last projection only."
          : "Viewport changes the middle projection only.",
        mappingFocus === "view-client"
          ? "CSS 只改变最后一段投影。"
          : "Viewport 只改变中间一段投影。",
      )}
      wide
    >
      <StayCanvas
        className="demo-canvas coordinate-stack-canvas"
        focusOnInit={false}
        height={STACK_HEIGHT}
        layers={3}
        mounted={mounted}
        width={STACK_WIDTH}
      />
    </CanvasCard>
  )
}

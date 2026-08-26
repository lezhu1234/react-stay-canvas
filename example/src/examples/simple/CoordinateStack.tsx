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
  clientReferenceRange,
  clippedRectEdges,
  containsRect,
  contentReferenceRange,
  correspondingRectCorners,
  formatPoint,
  formatRect,
  LAB_CONTENT_BOUNDS,
  projectContentRect,
  type CoordinateProbe,
  visibleContentRange,
} from "./coordinateLabModel"

const STACK_WIDTH = 320
const STACK_HEIGHT = 300
const PLANE_GRID_COLUMNS = 12
const PLANE_GRID_ROWS = 4
const CONTENT_GRID_LINES = 36
const CONTENT_GRID_SIZE = 50

type PlaneName = "client" | "view" | "content"

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
  canvasDomValue?: StayText
  visibleWindow?: Rectangle
  visibleWindowValue?: StayText
}

type StackRuntime = {
  planes: Record<PlaneName, PlaneRuntime>
  rays: [Line, Line]
  clientViewLinks: [Line, Line, Line, Line]
  viewContentLinks: [Line, Line, Line, Line]
}

function createDefinitions(width: number, height: number): Record<PlaneName, PlaneDefinition> {
  const planeWidth = width * 0.66
  const planeHeight = height * 0.22
  return {
    client: {
      width: planeWidth,
      height: planeHeight,
      layer: 0,
      transform: { x: width * 0.07, y: height * 0.05, skewX: -8, scaleY: 0.78 },
      fill: rgba(124, 132, 145, 0.13),
      stroke: rgba(124, 132, 145, 0.72),
    },
    view: {
      width: planeWidth,
      height: planeHeight,
      layer: 1,
      transform: { x: width * 0.15, y: height * 0.385, skewX: -8, scaleY: 0.78 },
      fill: rgba(54, 105, 221, 0.14),
      stroke: rgba(54, 105, 221, 0.82),
    },
    content: {
      width: planeWidth,
      height: planeHeight,
      layer: 2,
      transform: { x: width * 0.23, y: height * 0.72, skewX: -8, scaleY: 0.78 },
      fill: rgba(44, 137, 91, 0.16),
      stroke: rgba(44, 137, 91, 0.88),
    },
  }
}

function planeRange(
  name: PlaneName,
  probe: CoordinateProbe,
  _viewport: Readonly<ViewportState>,
): PlaneRange {
  if (name === "client") {
    return clientReferenceRange(probe)
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
  return {
    ...pointOnPlane(plane, value, range),
    width: value.width / Math.max(1, range.width) * plane.width,
    height: value.height / Math.max(1, range.height) * plane.height,
  }
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
      strokeConfig: { color: rgba(44, 137, 91, visible ? 0.11 : 0), lineWidth: 1 },
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
      strokeConfig: { color: rgba(44, 137, 91, visible ? 0.11 : 0), lineWidth: 1 },
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
  probe,
  viewport,
}: {
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
    const surfaceRect = {
      x: sample.surface.left,
      y: sample.surface.top,
      width: sample.surface.width,
      height: sample.surface.height,
    }
    const clientCanvasDom = rectOnPlane(
      runtime.planes.client,
      surfaceRect,
      clientReferenceRange(sample),
    )

    for (const name of Object.keys(runtime.planes) as PlaneName[]) {
      const plane = runtime.planes[name]
      const range = planeRange(name, sample, currentViewport)
      const value = valueForPlane(name, sample)
      const localPoint = pointOnPlane(plane, value, range)
      const localShape = rectOnPlane(plane, shapeProjection[name], range)
      const projectedContentBounds = rectOnPlane(plane, boundsProjection[name], range)
      const projectionClip = name === "client"
        ? clientCanvasDom
        : { x: 0, y: 0, width: plane.width, height: plane.height }
      if (name === "client") {
        plane.canvasDom?.update({
          ...projectionClip,
          fillConfig: { color: rgba(54, 105, 221, 0.035) },
          strokeConfig: { color: rgba(78, 89, 104, 0.72), lineWidth: 1, dash: [5, 4] },
        })
        plane.canvasDomValue?.update({
          x: projectionClip.x + 8,
          y: projectionClip.y + 8,
          text: text(
            `Canvas DOM @ ${formatPoint(surfaceRect)}`,
            `Canvas DOM @ ${formatPoint(surfaceRect)}`,
          ),
        })
      }
      plane.dot.update(localPoint)
      plane.value.update({
        x: Math.min(plane.width - 112, Math.max(12, localPoint.x + 12)),
        y: Math.max(58, localPoint.y - 9),
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
      const clientLabelFits = visibleShape && visibleShape.width >= 88 && visibleShape.height >= 22
      plane.shapeValue.update(name === "client" ? {
        x: visibleShape ? visibleShape.x + 6 : 0,
        y: visibleShape ? visibleShape.y + 6 : 0,
        text: text("Shape inside DOM", "DOM 内 Shape"),
        textBaseline: "top",
        fillConfig: { color: rgba(54, 105, 221, clientLabelFits ? 1 : 0) },
      } : {
        x: Math.min(plane.width - 170, Math.max(12, localShape.x)),
        y: Math.min(plane.height - 34, Math.max(76, localShape.y - 5)),
        text: name === "content"
          ? text(`Shape geometry ${formatRect(shapeProjection.content)} fixed`, `Shape 几何 ${formatRect(shapeProjection.content)} 不变`)
          : text(`Shape projection ${formatRect(shapeProjection[name])}`, `Shape 投影 ${formatRect(shapeProjection[name])}`),
        textBaseline: "bottom",
        fillConfig: { color: rgba(54, 105, 221, visibleShape ? 1 : 0) },
      })
      plane.originValue.update({
        text: text(
          `${name === "content" ? "reference" : name === "client" ? "browser crop" : "range"} start ${formatPoint(range)}`,
          `${name === "content" ? "参考范围" : name === "client" ? "浏览器裁切范围" : "范围"}起点 ${formatPoint(range)}`,
        ),
      })
      plane.extentValue.update({
        text: text(
          `${name === "content" ? "reference" : name === "client" ? "browser crop" : "range"} end ${formatPoint({ x: range.x + range.width, y: range.y + range.height })}`,
          `${name === "content" ? "参考范围" : name === "client" ? "浏览器裁切范围" : "范围"}终点 ${formatPoint({ x: range.x + range.width, y: range.y + range.height })}`,
        ),
      })
      points[name] = plane.child.toContentPoint(localPoint)
    }

    runtime.rays[0].update({ x1: points.client.x, y1: points.client.y, x2: points.view.x, y2: points.view.y })
    runtime.rays[1].update({ x1: points.view.x, y1: points.view.y, x2: points.content.x, y2: points.content.y })
    correspondingRectCorners(
      clientCanvasDom,
      { x: 0, y: 0, width: runtime.planes.view.width, height: runtime.planes.view.height },
    ).forEach((corners, index) => {
      const start = runtime.planes.client.child.toContentPoint(corners.from)
      const end = runtime.planes.view.child.toContentPoint(corners.to)
      runtime.clientViewLinks[index].update({ x1: start.x, y1: start.y, x2: end.x, y2: end.y })
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
          color: rgba(78, 89, 104, contentWindow.containsVisibleWindow ? 0.2 : 0),
          lineWidth: 1,
          dash: [4, 5],
        },
      })
    })
  }

  useEffect(() => update(probe, viewport), [probe, viewport])

  const mounted = (tools: StayTools) => {
    const canvasArea = sceneCanvasArea(tools, STACK_WIDTH, STACK_HEIGHT)
    const definitions = createDefinitions(canvasArea.width, canvasArea.height)
    const planeNames: PlaneName[] = ["client", "view", "content"]
    const labels = {
      client: ["CLIENT", text("Browser coordinates; dashed rect: Canvas DOM", "浏览器坐标；虚线框：Canvas DOM")],
      view: ["VIEW", text("Logical Canvas surface", "Canvas 逻辑显示面")],
      content: ["CONTENT", text("Outer: fixed reference; solid rect: Demo bounds", "外框：固定参考系；实线框：Demo 边界")],
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
        radius: 6,
        layer: plane.layer,
        zIndex: 10,
        fillConfig: { color: colors.orange },
        strokeConfig: { color: colors.paper, lineWidth: 2 },
      })
      const value = new StayText({
        x: 12,
        y: -10,
        text: "0, 0",
        layer: plane.layer,
        zIndex: 11,
        textBaseline: "bottom",
        font: { size: 11, fontWeight: 700 },
        fillConfig: { color: colors.orange },
      })
      const originValue = new StayText({
        x: 12,
        y: 51,
        text: "0, 0",
        layer: plane.layer,
        zIndex: 5,
        textBaseline: "top",
        font: { size: 9 },
        fillConfig: { color: colors.gray },
      })
      const extentValue = new StayText({
        x: plane.width - 12,
        y: plane.height - 10,
        text: "0, 0",
        layer: plane.layer,
        zIndex: 5,
        textAlign: "right",
        textBaseline: "bottom",
        font: { size: 9 },
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
        x: 12,
        y: 76,
        text: "Shape",
        layer: plane.layer,
        zIndex: 8,
        textBaseline: "bottom",
        font: { size: 9, fontWeight: 700 },
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
        x: 12,
        y: plane.height - 16,
        text: "viewport",
        layer: plane.layer,
        zIndex: 6,
        textBaseline: "bottom",
        font: { size: 8, fontWeight: 700 },
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
      const canvasDomValue = name === "client" ? new StayText({
        x: 0,
        y: 0,
        text: "Canvas DOM",
        layer: plane.layer,
        zIndex: 6,
        textBaseline: "top",
        font: { size: 8, fontWeight: 700 },
        fillConfig: { color: colors.gray },
      }) : undefined
      const child = tools.appendChild({
        className: `coordinate-plane-${name}`,
        transform: plane.transform,
        shape: [
          new Rectangle({
            x: 0,
            y: 0,
            width: plane.width,
            height: plane.height,
            layer: plane.layer,
            fillConfig: { color: plane.fill },
            strokeConfig: {
              color: name === "content" ? rgba(78, 89, 104, 0.46) : plane.stroke,
              lineWidth: name === "content" ? 1 : 2,
            },
          }),
          ...gridX,
          ...gridY,
          new StayText({
            x: 12,
            y: 14,
            text: labels[name][0],
            layer: plane.layer,
            zIndex: 5,
            textBaseline: "top",
            font: { size: 13, fontWeight: 700 },
            fillConfig: { color: plane.stroke },
          }),
          new StayText({
            x: 12,
            y: 32,
            text: labels[name][1],
            layer: plane.layer,
            zIndex: 5,
            textBaseline: "top",
            font: { size: 10 },
            fillConfig: { color: colors.gray },
          }),
          originValue,
          extentValue,
          ...(canvasDom ? [canvasDom] : []),
          ...(canvasDomValue ? [canvasDomValue] : []),
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
        canvasDomValue,
        visibleWindow,
        visibleWindowValue,
      }
    })

    const rayStyle = { color: rgba(224, 113, 62, 0.82), lineWidth: 2, dash: [6, 5] }
    const rays: [Line, Line] = [
      new Line({ x1: 0, y1: 0, x2: 0, y2: 0, layer: 2, zIndex: 9, strokeConfig: rayStyle }),
      new Line({ x1: 0, y1: 0, x2: 0, y2: 0, layer: 2, zIndex: 9, strokeConfig: rayStyle }),
    ]
    const linkStyle = { color: rgba(78, 89, 104, 0.2), lineWidth: 1, dash: [4, 5] }
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
        x: canvasArea.width * 0.68,
        y: canvasArea.height * 0.285,
        text: "View → Client",
        layer: 1,
        zIndex: 12,
        textBaseline: "middle",
        font: { size: 10, fontWeight: 700 },
        fillConfig: { color: colors.blue },
      }),
      new StayText({
        x: canvasArea.width * 0.68,
        y: canvasArea.height * 0.315,
        text: text("place the Canvas DOM and apply display scale", "叠加 Canvas DOM 位置与显示比例"),
        layer: 1,
        zIndex: 12,
        textBaseline: "middle",
        font: { size: 9 },
        fillConfig: { color: colors.gray },
      }),
      new StayText({
        x: canvasArea.width * 0.76,
        y: canvasArea.height * 0.62,
        text: "Content → View",
        layer: 2,
        zIndex: 12,
        textBaseline: "middle",
        font: { size: 10, fontWeight: 700 },
        fillConfig: { color: colors.green },
      }),
      new StayText({
        x: canvasArea.width * 0.76,
        y: canvasArea.height * 0.65,
        text: text("apply viewport offset and scale", "应用 viewport 平移与缩放"),
        layer: 2,
        zIndex: 12,
        textBaseline: "middle",
        font: { size: 9 },
        fillConfig: { color: colors.gray },
      }),
    ]
    tools.appendChild({ className: "coordinate-projection-ray", shape: [...clientViewLinks, ...viewContentLinks, ...rays, ...transformLabels] })
    runtimeRef.current = { planes, rays, clientViewLinks, viewContentLinks }
    update(probe, viewport)
  }

  return (
    <CanvasCard
      title={text("One Shape through three coordinate spaces", "同一个 Shape 的三种坐标投影")}
      description={text(
        "Client places the Canvas DOM in browser coordinates; View starts at 0,0 across the full logical surface. Gray links their visible corners; orange follows pointer input in reverse.",
        "Client 把 Canvas DOM 放进浏览器坐标；View 从 0,0 开始覆盖完整逻辑显示面。灰线连接对应可见范围，橙线表示反向的指针输入换算。",
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

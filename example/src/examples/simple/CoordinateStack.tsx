import { useEffect, useRef } from "react"
import {
  Circle,
  Line,
  Rectangle,
  StayCanvas,
  StayText,
  type ChildTransform,
  type Coordinate,
  type StayInstantChild,
  type StayTools,
  type ViewportState,
} from "react-stay-canvas"

import { CanvasCard, colors, rgba, sceneCanvasArea } from "../../components/DemoKit"
import { useI18n } from "../../i18n"

const STACK_WIDTH = 320
const STACK_HEIGHT = 300
const PLANE_GRID_COLUMNS = 12
const PLANE_GRID_ROWS = 4
const CONTENT_GRID_COLUMNS = 36
const CONTENT_GRID_ROWS = 18
const CONTENT_GRID_SIZE = 50

type PlaneName = "client" | "view" | "content"

export type CoordinateProbe = {
  client: Coordinate
  view: Coordinate
  content: Coordinate
  viewSize: { width: number; height: number }
  surface: {
    left: number
    top: number
    width: number
    height: number
    scaleX: number
    scaleY: number
  }
}

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
  xAxis: Line
  yAxis: Line
  gridX: Line[]
  gridY: Line[]
}

type StackRuntime = {
  planes: Record<PlaneName, PlaneRuntime>
  rays: [Line, Line]
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

const format = (x: number, y: number) => `${Math.round(x)}, ${Math.round(y)}`

function visibleContentRange(probe: CoordinateProbe, viewport: Readonly<ViewportState>): PlaneRange {
  return {
    x: -viewport.x / viewport.scale,
    y: -viewport.y / viewport.scale,
    width: probe.viewSize.width / viewport.scale,
    height: probe.viewSize.height / viewport.scale,
  }
}

function planeRange(
  name: PlaneName,
  probe: CoordinateProbe,
  viewport: Readonly<ViewportState>,
): PlaneRange {
  if (name === "client") {
    return {
      x: probe.surface.left,
      y: probe.surface.top,
      width: probe.surface.width,
      height: probe.surface.height,
    }
  }
  if (name === "view") {
    return { x: 0, y: 0, width: probe.viewSize.width, height: probe.viewSize.height }
  }
  return visibleContentRange(probe, viewport)
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

function updateContentGrid(plane: PlaneRuntime, viewport: Readonly<ViewportState>, probe: CoordinateProbe) {
  const scaleX = plane.width / Math.max(1, probe.viewSize.width)
  const scaleY = plane.height / Math.max(1, probe.viewSize.height)
  const spacingX = CONTENT_GRID_SIZE * viewport.scale * scaleX
  const spacingY = CONTENT_GRID_SIZE * viewport.scale * scaleY
  const offsetX = ((viewport.x * scaleX) % spacingX + spacingX) % spacingX
  const offsetY = ((viewport.y * scaleY) % spacingY + spacingY) % spacingY

  plane.gridX.forEach((line, index) => {
    const x = offsetX + index * spacingX
    const visible = x <= plane.width
    line.update({
      x1: x,
      y1: 0,
      x2: x,
      y2: plane.height,
      strokeConfig: { color: rgba(44, 137, 91, visible ? 0.2 : 0), lineWidth: 1 },
    })
  })
  plane.gridY.forEach((line, index) => {
    const y = offsetY + index * spacingY
    const visible = y <= plane.height
    line.update({
      x1: 0,
      y1: y,
      x2: plane.width,
      y2: y,
      strokeConfig: { color: rgba(44, 137, 91, visible ? 0.2 : 0), lineWidth: 1 },
    })
  })

  const originX = viewport.x * scaleX
  const originY = viewport.y * scaleY
  const xVisible = originY >= 0 && originY <= plane.height
  const yVisible = originX >= 0 && originX <= plane.width
  plane.xAxis.update({
    x1: 0,
    y1: originY,
    x2: plane.width,
    y2: originY,
    strokeConfig: { color: rgba(44, 137, 91, xVisible ? 0.9 : 0), lineWidth: 2 },
  })
  plane.yAxis.update({
    x1: originX,
    y1: 0,
    x2: originX,
    y2: plane.height,
    strokeConfig: { color: rgba(44, 137, 91, yVisible ? 0.9 : 0), lineWidth: 2 },
  })
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
    const points = (Object.keys(runtime.planes) as PlaneName[]).reduce((result, name) => {
      const plane = runtime.planes[name]
      const range = planeRange(name, sample, currentViewport)
      const value = valueForPlane(name, sample)
      const localPoint = pointOnPlane(plane, value, range)
      plane.dot.update(localPoint)
      plane.value.update({
        x: Math.min(plane.width - 112, Math.max(12, localPoint.x + 12)),
        y: Math.max(58, localPoint.y - 9),
        text: text(`pointer ${format(value.x, value.y)}`, `指针 ${format(value.x, value.y)}`),
      })
      plane.originValue.update({
        text: text(
          `range start ${format(range.x, range.y)}`,
          `范围起点 ${format(range.x, range.y)}`,
        ),
      })
      plane.extentValue.update({
        text: text(
          `range end ${format(range.x + range.width, range.y + range.height)}`,
          `范围终点 ${format(range.x + range.width, range.y + range.height)}`,
        ),
      })
      result[name] = plane.child.toContentPoint(localPoint)
      return result
    }, {} as Record<PlaneName, { x: number; y: number }>)

    runtime.rays[0].update({ x1: points.client.x, y1: points.client.y, x2: points.view.x, y2: points.view.y })
    runtime.rays[1].update({ x1: points.view.x, y1: points.view.y, x2: points.content.x, y2: points.content.y })
    updateContentGrid(runtime.planes.content, currentViewport, sample)
  }

  useEffect(() => update(probe, viewport), [probe, viewport])

  const mounted = (tools: StayTools) => {
    const canvasArea = sceneCanvasArea(tools, STACK_WIDTH, STACK_HEIGHT)
    const definitions = createDefinitions(canvasArea.width, canvasArea.height)
    const planeNames: PlaneName[] = ["client", "view", "content"]
    const labels = {
      client: ["CLIENT", text("Canvas DOM box", "Canvas DOM 区域")],
      view: ["VIEW", text("Logical Canvas surface", "Canvas 逻辑显示面")],
      content: ["CONTENT", text("Visible scene window", "当前可见场景")],
    }
    const planes = {} as Record<PlaneName, PlaneRuntime>

    planeNames.forEach((name) => {
      const plane = definitions[name]
      const { gridX, gridY } = createGrid(
        plane,
        name === "content" ? CONTENT_GRID_COLUMNS : PLANE_GRID_COLUMNS,
        name === "content" ? CONTENT_GRID_ROWS : PLANE_GRID_ROWS,
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
      const xAxis = new Line({
        x1: 0,
        y1: 0,
        x2: plane.width,
        y2: 0,
        layer: plane.layer,
        zIndex: 3,
        strokeConfig: { color: plane.stroke, lineWidth: 2 },
      })
      const yAxis = new Line({
        x1: 0,
        y1: 0,
        x2: 0,
        y2: plane.height,
        layer: plane.layer,
        zIndex: 3,
        strokeConfig: { color: plane.stroke, lineWidth: 2 },
      })
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
            strokeConfig: { color: plane.stroke, lineWidth: 2 },
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
          xAxis,
          yAxis,
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
        xAxis,
        yAxis,
        gridX,
        gridY,
      }
    })

    const rayStyle = { color: rgba(224, 113, 62, 0.82), lineWidth: 2, dash: [6, 5] }
    const rays: [Line, Line] = [
      new Line({ x1: 0, y1: 0, x2: 0, y2: 0, layer: 2, zIndex: 9, strokeConfig: rayStyle }),
      new Line({ x1: 0, y1: 0, x2: 0, y2: 0, layer: 2, zIndex: 9, strokeConfig: rayStyle }),
    ]
    const cornerLinks = ([
      [planes.client, planes.view],
      [planes.view, planes.content],
    ] as Array<[PlaneRuntime, PlaneRuntime]>).flatMap(([from, to]) =>
      [0, from.width].map((x) => {
        const start = from.child.toContentPoint({ x, y: from.height })
        const end = to.child.toContentPoint({ x, y: 0 })
        return new Line({
          x1: start.x,
          y1: start.y,
          x2: end.x,
          y2: end.y,
          layer: 2,
          zIndex: -1,
          strokeConfig: { color: rgba(78, 89, 104, 0.22), lineWidth: 1, dash: [4, 5] },
        })
      }))
    const transformLabels = [
      new StayText({
        x: canvasArea.width * 0.68,
        y: canvasArea.height * 0.285,
        text: "Client → View",
        layer: 1,
        zIndex: 12,
        textBaseline: "middle",
        font: { size: 10, fontWeight: 700 },
        fillConfig: { color: colors.blue },
      }),
      new StayText({
        x: canvasArea.width * 0.68,
        y: canvasArea.height * 0.315,
        text: text("subtract DOM origin, apply display scale", "减 DOM 原点，再乘显示比例"),
        layer: 1,
        zIndex: 12,
        textBaseline: "middle",
        font: { size: 9 },
        fillConfig: { color: colors.gray },
      }),
      new StayText({
        x: canvasArea.width * 0.76,
        y: canvasArea.height * 0.62,
        text: "View → Content",
        layer: 2,
        zIndex: 12,
        textBaseline: "middle",
        font: { size: 10, fontWeight: 700 },
        fillConfig: { color: colors.green },
      }),
      new StayText({
        x: canvasArea.width * 0.76,
        y: canvasArea.height * 0.65,
        text: text("undo viewport offset and scale", "撤销 viewport 平移与缩放"),
        layer: 2,
        zIndex: 12,
        textBaseline: "middle",
        font: { size: 9 },
        fillConfig: { color: colors.gray },
      }),
    ]
    tools.appendChild({ className: "coordinate-projection-ray", shape: [...cornerLinks, ...rays, ...transformLabels] })
    runtimeRef.current = { planes, rays }
    update(probe, viewport)
  }

  return (
    <CanvasCard
      title={text("One point in three coordinate spaces", "同一个点的三种坐标")}
      description={text("Each plane shows its own visible range. The orange point is the same pointer.", "每张平面标出自己的可见范围，橙色点始终代表同一个指针。")}
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

import { useEffect, useRef } from "react"
import {
  Circle,
  Line,
  Rectangle,
  StayCanvas,
  StayText,
  type Coordinate,
  type StayTools,
  type ViewportState,
} from "react-stay-canvas"

import { CanvasCard, colors, rgba, sceneCanvasArea } from "../../components/DemoKit"
import { useI18n } from "../../i18n"

const STACK_WIDTH = 320
const STACK_HEIGHT = 300
const PLANE_GRID_COLUMNS = 15
const PLANE_GRID_ROWS = 10
const CONTENT_GRID_COLUMNS = 48
const CONTENT_GRID_ROWS = 30
const CONTENT_GRID_SIZE = 50

type PlaneName = "client" | "view" | "content"

export type CoordinateProbe = {
  client: Coordinate
  view: Coordinate
  content: Coordinate
  sampleViewport: Readonly<ViewportState>
  viewSize: { width: number; height: number }
}

type PlaneDefinition = {
  x: number
  y: number
  width: number
  height: number
  layer: number
  fill: ReturnType<typeof rgba>
  stroke: ReturnType<typeof rgba>
}

type PlaneRuntime = PlaneDefinition & {
  dot: Circle
  value: StayText
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
  const planeWidth = width * 0.58
  const planeHeight = height * 0.5
  return {
    client: {
      x: width * 0.06,
      y: height * 0.05,
      width: planeWidth,
      height: planeHeight,
      layer: 0,
      fill: rgba(124, 132, 145, 0.13),
      stroke: rgba(124, 132, 145, 0.72),
    },
    view: {
      x: width * 0.17,
      y: height * 0.2,
      width: planeWidth,
      height: planeHeight,
      layer: 1,
      fill: rgba(54, 105, 221, 0.14),
      stroke: rgba(54, 105, 221, 0.82),
    },
    content: {
      x: width * 0.28,
      y: height * 0.35,
      width: planeWidth,
      height: planeHeight,
      layer: 2,
      fill: rgba(44, 137, 91, 0.16),
      stroke: rgba(44, 137, 91, 0.88),
    },
  }
}

const pointOnPlane = (plane: PlaneDefinition, probe: CoordinateProbe) => ({
  x: plane.x + probe.view.x / Math.max(1, probe.viewSize.width) * plane.width,
  y: plane.y + probe.view.y / Math.max(1, probe.viewSize.height) * plane.height,
})

const contentAtView = (view: Coordinate, viewport: Readonly<ViewportState>) => ({
  x: (view.x - viewport.x) / viewport.scale,
  y: (view.y - viewport.y) / viewport.scale,
})

const format = (x: number, y: number) => `${Math.round(x)}, ${Math.round(y)}`

function gridPosition(index: number, count: number, start: number, size: number) {
  return start + index / (count + 1) * size
}

function createGrid(
  plane: PlaneDefinition,
  tools: StayTools,
  columns: number,
  rows: number,
) {
  const gridColor = rgba(78, 89, 104, 0.12)
  const gridX = Array.from({ length: columns }, (_, index) => new Line({
    x1: gridPosition(index + 1, columns, plane.x, plane.width),
    y1: plane.y,
    x2: gridPosition(index + 1, columns, plane.x, plane.width),
    y2: plane.y + plane.height,
    layer: plane.layer,
    zIndex: 2,
    strokeConfig: { color: gridColor, lineWidth: 1 },
  }))
  const gridY = Array.from({ length: rows }, (_, index) => new Line({
    x1: plane.x,
    y1: gridPosition(index + 1, rows, plane.y, plane.height),
    x2: plane.x + plane.width,
    y2: gridPosition(index + 1, rows, plane.y, plane.height),
    layer: plane.layer,
    zIndex: 2,
    strokeConfig: { color: gridColor, lineWidth: 1 },
  }))
  tools.appendChild({ className: "coordinate-stack-grid", shape: [...gridX, ...gridY] })
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
    const x = plane.x + offsetX + index * spacingX
    const visible = x <= plane.x + plane.width
    line.update({
      x1: x,
      y1: plane.y,
      x2: x,
      y2: plane.y + plane.height,
      strokeConfig: { color: rgba(44, 137, 91, visible ? 0.2 : 0), lineWidth: 1 },
    })
  })
  plane.gridY.forEach((line, index) => {
    const y = plane.y + offsetY + index * spacingY
    const visible = y <= plane.y + plane.height
    line.update({
      x1: plane.x,
      y1: y,
      x2: plane.x + plane.width,
      y2: y,
      strokeConfig: { color: rgba(44, 137, 91, visible ? 0.2 : 0), lineWidth: 1 },
    })
  })

  const originX = plane.x + viewport.x * scaleX
  const originY = plane.y + viewport.y * scaleY
  const xVisible = originY >= plane.y && originY <= plane.y + plane.height
  const yVisible = originX >= plane.x && originX <= plane.x + plane.width
  plane.xAxis.update({
    x1: plane.x,
    y1: originY,
    x2: plane.x + plane.width,
    y2: originY,
    strokeConfig: { color: rgba(44, 137, 91, xVisible ? 0.9 : 0), lineWidth: 2 },
  })
  plane.yAxis.update({
    x1: originX,
    y1: plane.y,
    x2: originX,
    y2: plane.y + plane.height,
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
    const values = {
      client: sample.client,
      view: sample.view,
      content: contentAtView(sample.view, currentViewport),
    }
    const points = (Object.keys(runtime.planes) as PlaneName[]).reduce((result, name) => {
      const plane = runtime.planes[name]
      const point = pointOnPlane(plane, sample)
      plane.dot.update(point)
      plane.value.update({ x: point.x + 12, y: point.y - 10, text: format(values[name].x, values[name].y) })
      result[name] = point
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
      client: ["CLIENT", text("Browser pixels", "浏览器像素")],
      view: ["VIEW", text("Canvas surface", "Canvas 显示面")],
      content: ["CONTENT", text("Child geometry", "Child 几何空间")],
    }
    const planes = {} as Record<PlaneName, PlaneRuntime>

    planeNames.forEach((name) => {
      const plane = definitions[name]
      const { gridX, gridY } = createGrid(
        plane,
        tools,
        name === "content" ? CONTENT_GRID_COLUMNS : PLANE_GRID_COLUMNS,
        name === "content" ? CONTENT_GRID_ROWS : PLANE_GRID_ROWS,
      )
      const dot = new Circle({
        x: plane.x,
        y: plane.y,
        radius: 6,
        layer: plane.layer,
        zIndex: 10,
        fillConfig: { color: colors.orange },
        strokeConfig: { color: colors.paper, lineWidth: 2 },
      })
      const value = new StayText({
        x: plane.x + 12,
        y: plane.y - 10,
        text: "0, 0",
        layer: plane.layer,
        zIndex: 11,
        textBaseline: "bottom",
        font: { size: 11, fontWeight: 700 },
        fillConfig: { color: colors.orange },
      })
      const xAxis = new Line({
        x1: plane.x,
        y1: plane.y,
        x2: plane.x + plane.width,
        y2: plane.y,
        layer: plane.layer,
        zIndex: 3,
        strokeConfig: { color: plane.stroke, lineWidth: 2 },
      })
      const yAxis = new Line({
        x1: plane.x,
        y1: plane.y,
        x2: plane.x,
        y2: plane.y + plane.height,
        layer: plane.layer,
        zIndex: 3,
        strokeConfig: { color: plane.stroke, lineWidth: 2 },
      })
      tools.appendChild({
        className: `coordinate-plane-${name}`,
        shape: [
          new Rectangle({
            x: plane.x,
            y: plane.y,
            width: plane.width,
            height: plane.height,
            layer: plane.layer,
            fillConfig: { color: plane.fill },
            strokeConfig: { color: plane.stroke, lineWidth: 2 },
          }),
          new StayText({
            x: plane.x + 12,
            y: plane.y + 14,
            text: labels[name][0],
            layer: plane.layer,
            zIndex: 5,
            textBaseline: "top",
            font: { size: 13, fontWeight: 700 },
            fillConfig: { color: plane.stroke },
          }),
          new StayText({
            x: plane.x + 12,
            y: plane.y + 34,
            text: labels[name][1],
            layer: plane.layer,
            zIndex: 5,
            textBaseline: "top",
            font: { size: 10 },
            fillConfig: { color: colors.gray },
          }),
          xAxis,
          yAxis,
          dot,
          value,
        ],
      })
      planes[name] = { ...plane, dot, value, xAxis, yAxis, gridX, gridY }
    })

    const rayStyle = { color: rgba(224, 113, 62, 0.82), lineWidth: 2, dash: [6, 5] }
    const rays: [Line, Line] = [
      new Line({ x1: 0, y1: 0, x2: 0, y2: 0, layer: 2, zIndex: 9, strokeConfig: rayStyle }),
      new Line({ x1: 0, y1: 0, x2: 0, y2: 0, layer: 2, zIndex: 9, strokeConfig: rayStyle }),
    ]
    const cornerLinks = [
      [planes.client.x, planes.client.y, planes.content.x, planes.content.y],
      [planes.client.x + planes.client.width, planes.client.y, planes.content.x + planes.content.width, planes.content.y],
      [planes.client.x, planes.client.y + planes.client.height, planes.content.x, planes.content.y + planes.content.height],
      [planes.client.x + planes.client.width, planes.client.y + planes.client.height, planes.content.x + planes.content.width, planes.content.y + planes.content.height],
    ].map(([x1, y1, x2, y2]) => new Line({
      x1,
      y1,
      x2,
      y2,
      layer: 2,
      zIndex: -1,
      strokeConfig: { color: rgba(78, 89, 104, 0.22), lineWidth: 1, dash: [4, 5] },
    }))
    const transformLabels = [
      new StayText({
        x: planes.client.x + planes.client.width + 12,
        y: planes.client.y + 62,
        text: text("layout scale", "布局缩放"),
        layer: 1,
        zIndex: 12,
        textBaseline: "middle",
        font: { size: 10, fontWeight: 700 },
        fillConfig: { color: colors.blue },
      }),
      new StayText({
        x: planes.view.x + planes.view.width + 12,
        y: planes.view.y + 62,
        text: text("viewport inverse", "视口逆变换"),
        layer: 2,
        zIndex: 12,
        textBaseline: "middle",
        font: { size: 10, fontWeight: 700 },
        fillConfig: { color: colors.green },
      }),
    ]
    tools.appendChild({ className: "coordinate-projection-ray", shape: [...cornerLinks, ...rays, ...transformLabels] })
    runtimeRef.current = { planes, rays }
    update(probe, viewport)
  }

  return (
    <CanvasCard
      title={text("Coordinate space stack", "三层坐标空间")}
      description={text("One pointer ray crosses three independently defined rectangular planes.", "同一条指针投影线依次穿过三个独立定义的矩形平面。")}
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

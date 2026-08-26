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
      width: planeWidth,
      height: planeHeight,
      layer: 0,
      transform: { x: width * 0.12, y: height * 0.08, skewX: -12, scaleY: 0.78 },
      fill: rgba(124, 132, 145, 0.13),
      stroke: rgba(124, 132, 145, 0.72),
    },
    view: {
      width: planeWidth,
      height: planeHeight,
      layer: 1,
      transform: { x: width * 0.19, y: height * 0.23, skewX: -12, scaleY: 0.78 },
      fill: rgba(54, 105, 221, 0.14),
      stroke: rgba(54, 105, 221, 0.82),
    },
    content: {
      width: planeWidth,
      height: planeHeight,
      layer: 2,
      transform: { x: width * 0.26, y: height * 0.38, skewX: -12, scaleY: 0.78 },
      fill: rgba(44, 137, 91, 0.16),
      stroke: rgba(44, 137, 91, 0.88),
    },
  }
}

const pointOnPlane = (plane: PlaneDefinition, probe: CoordinateProbe) => ({
  x: probe.view.x / Math.max(1, probe.viewSize.width) * plane.width,
  y: probe.view.y / Math.max(1, probe.viewSize.height) * plane.height,
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
    const values = {
      client: sample.client,
      view: sample.view,
      content: contentAtView(sample.view, currentViewport),
    }
    const points = (Object.keys(runtime.planes) as PlaneName[]).reduce((result, name) => {
      const plane = runtime.planes[name]
      const localPoint = pointOnPlane(plane, sample)
      plane.dot.update(localPoint)
      plane.value.update({
        x: localPoint.x + 12,
        y: localPoint.y - 10,
        text: format(values[name].x, values[name].y),
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
      client: ["CLIENT", text("Browser pixels", "浏览器像素")],
      view: ["VIEW", text("Canvas surface", "Canvas 显示面")],
      content: ["CONTENT", text("Child geometry", "Child 几何空间")],
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
            y: 34,
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
      planes[name] = { ...plane, child, dot, value, xAxis, yAxis, gridX, gridY }
    })

    const rayStyle = { color: rgba(224, 113, 62, 0.82), lineWidth: 2, dash: [6, 5] }
    const rays: [Line, Line] = [
      new Line({ x1: 0, y1: 0, x2: 0, y2: 0, layer: 2, zIndex: 9, strokeConfig: rayStyle }),
      new Line({ x1: 0, y1: 0, x2: 0, y2: 0, layer: 2, zIndex: 9, strokeConfig: rayStyle }),
    ]
    const localCorners = (plane: PlaneRuntime) => [
      { x: 0, y: 0 },
      { x: plane.width, y: 0 },
      { x: 0, y: plane.height },
      { x: plane.width, y: plane.height },
    ]
    const clientCorners = localCorners(planes.client)
      .map((point) => planes.client.child.toContentPoint(point))
    const contentCorners = localCorners(planes.content)
      .map((point) => planes.content.child.toContentPoint(point))
    const cornerLinks = clientCorners.map((start, index) => new Line({
      x1: start.x,
      y1: start.y,
      x2: contentCorners[index].x,
      y2: contentCorners[index].y,
      layer: 2,
      zIndex: -1,
      strokeConfig: { color: rgba(78, 89, 104, 0.22), lineWidth: 1, dash: [4, 5] },
    }))
    const clientTopRight = planes.client.child.toContentPoint({ x: planes.client.width, y: 0 })
    const viewTopRight = planes.view.child.toContentPoint({ x: planes.view.width, y: 0 })
    const transformLabels = [
      new StayText({
        x: clientTopRight.x + 12,
        y: clientTopRight.y + 62,
        text: text("layout scale", "布局缩放"),
        layer: 1,
        zIndex: 12,
        textBaseline: "middle",
        font: { size: 10, fontWeight: 700 },
        fillConfig: { color: colors.blue },
      }),
      new StayText({
        x: viewTopRight.x + 12,
        y: viewTopRight.y + 62,
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

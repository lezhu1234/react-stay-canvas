import { useMemo, useRef, useState } from "react"
import {
  Circle,
  type Coordinate,
  type EventProps,
  Line,
  type ListenerProps,
  MOUSE_EVENTS,
  Rectangle,
  StayCanvas,
  StayText,
  type StayTools,
  type ViewportState,
} from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, StatusGrid, Toolbar } from "../../components/DemoKit"
import { useI18n } from "../../i18n"
import { hasPointerPosition } from "../actionEventGuards"
import { CoordinateStack, type CoordinateProbe } from "./CoordinateStack"

const isSpacePressed = (keys: Set<string>) => keys.has(" ") || keys.has("Spacebar")

const spaceMoveEnd: EventProps<string> = {
  name: "moveend",
  trigger: MOUSE_EVENTS.MOUSE_UP,
  conditionCallback: ({ e, store }) => Boolean(e.cancelled || store.get("coordinatePanning")),
  successCallback: ({ store, deleteEvent }) => {
    store.set("coordinatePanning", false)
    deleteEvent("move")
    deleteEvent("moveend")
  },
}

const spaceMove: EventProps<string> = {
  name: "move",
  trigger: MOUSE_EVENTS.MOUSE_MOVE,
  conditionCallback: ({ e }) => isSpacePressed(e.pressedKeys) && e.pressedKeys.has("mouse0"),
  successCallback: ({ store }) => {
    store.set("coordinatePanning", true)
    return spaceMoveEnd
  },
}

const spaceStartMove: EventProps<string> = {
  name: "startmove",
  trigger: MOUSE_EVENTS.MOUSE_DOWN,
  conditionCallback: ({ e }) => isSpacePressed(e.pressedKeys) && e.pressedKeys.has("mouse0"),
  successCallback: ({ store }) => {
    store.set("coordinatePanning", false)
    return [spaceMove, spaceMoveEnd]
  },
}

const rounded = ({ x, y }: Coordinate) => `${Math.round(x)}, ${Math.round(y)}`

function contentAtView(view: Coordinate, viewport: Readonly<ViewportState>) {
  return {
    x: (view.x - viewport.x) / viewport.scale,
    y: (view.y - viewport.y) / viewport.scale,
  }
}

function surfaceFrame({
  logicalWidth,
  logicalHeight,
  clientRect,
}: {
  logicalWidth: number
  logicalHeight: number
  clientRect: { left: number; top: number; width: number; height: number }
}) {
  const width = clientRect.width || logicalWidth
  const height = clientRect.height || logicalHeight
  return {
    left: clientRect.left,
    top: clientRect.top,
    width,
    height,
    scaleX: logicalWidth / width,
    scaleY: logicalHeight / height,
  }
}

const scalePair = ({ scaleX, scaleY }: CoordinateProbe["surface"]) =>
  `${scaleX.toFixed(2)}×, ${scaleY.toFixed(2)}×`

const scaleFactors = ({ scaleX, scaleY }: CoordinateProbe["surface"]) =>
  `(${scaleX.toFixed(2)}, ${scaleY.toFixed(2)})`

export default function CoordinatesExample() {
  const { text } = useI18n()
  const toolsRef = useRef<StayTools>()
  const markerRef = useRef<{ dot: Circle; horizontal: Line; vertical: Line; label: StayText }>()
  const [probe, setProbe] = useState<CoordinateProbe>({
    client: { x: 0, y: 0 },
    view: { x: 0, y: 0 },
    content: { x: 0, y: 0 },
    viewSize: { width: 320, height: 440 },
    surface: { left: 0, top: 0, width: 320, height: 440, scaleX: 1, scaleY: 1 },
  })
  const [eventPoint, setEventPoint] = useState<Coordinate>({ x: 0, y: 0 })
  const [viewport, setViewport] = useState<Readonly<ViewportState>>({ x: 0, y: 0, scale: 1 })

  const moveMarker = (point: Coordinate) => {
    const marker = markerRef.current
    if (!marker) return
    marker.dot.update(point)
    marker.horizontal.update({ x1: point.x - 18, y1: point.y, x2: point.x + 18, y2: point.y })
    marker.vertical.update({ x1: point.x, y1: point.y - 18, x2: point.x, y2: point.y + 18 })
    marker.label.update({ x: point.x + 14, y: point.y - 22 })
  }

  const syncProbeWithViewport = (viewport: Readonly<ViewportState>) => {
    setViewport(viewport)
    setProbe((current) => {
      const content = contentAtView(current.view, viewport)
      moveMarker(content)
      return { ...current, content }
    })
  }

  const listeners = useMemo<ListenerProps[]>(() => {
    const observe = (
      { e, originEvent, canvas, tools }: Parameters<ListenerProps["callback"]>[0],
      updateMarker = true,
      nextViewport?: Readonly<ViewportState>,
    ) => {
      if (!hasPointerPosition(e) || !(originEvent instanceof MouseEvent)) return false
      const client = { x: originEvent.clientX, y: originEvent.clientY }
      const view = canvas.clientToCanvasPoint(client.x, client.y)
      const viewport = nextViewport ?? tools.viewport.get()
      const content = nextViewport ? contentAtView(view, viewport) : e.point
      if (updateMarker) moveMarker(content)
      setProbe({
        client,
        view,
        content,
        viewSize: { width: canvas.width, height: canvas.height },
        surface: surfaceFrame(canvas.getSurfaceMetrics()),
      })
      setEventPoint(e.point)
      setViewport(viewport)
      return true
    }

    return [
      {
        name: "coordinate-probe",
        selector: ".stay-canvas",
        event: ["mousemove", "mousedown"],
        callback: (props) => {
          observe(props)
        },
      },
      {
        name: "coordinate-pan",
        selector: ".stay-canvas",
        event: ["startmove", "move", "moveend"],
        callback: (props) => ({
          startmove: () => {
            props.tools.changeCursor("grabbing")
            return { originViewport: props.tools.viewport.get() }
          },
          move: () => {
            const viewport = props.tools.viewport.panBy(props.e.movement ?? { x: 0, y: 0 })
            observe(props, true, viewport)
            return props.composeStore
          },
          moveend: () => {
            const viewport = props.e.cancelled && props.composeStore.originViewport
              ? props.tools.viewport.restore(props.composeStore.originViewport)
              : props.tools.viewport.get()
            const keepsLastClientSample = props.e.cancelled || props.originEvent.type === "lostpointercapture"
            if (keepsLastClientSample) {
              if (hasPointerPosition(props.e)) setEventPoint(props.e.point)
              syncProbeWithViewport(viewport)
            } else if (!observe(props, true, viewport)) {
              syncProbeWithViewport(viewport)
            }
            props.tools.changeCursor(isSpacePressed(props.e.pressedKeys) ? "grab" : "default")
            return { originViewport: undefined }
          },
        }),
      },
      {
        name: "coordinate-zoom",
        selector: ".stay-canvas",
        event: ["zoomin", "zoomout"],
        callback: ({ e, originEvent, tools, canvas }) => {
          if (!hasPointerPosition(e) || e.deltaY === undefined || !(originEvent instanceof MouseEvent)) return
          originEvent.preventDefault()
          const viewport = tools.viewport.zoomBy(Math.max(0.1, 1 - e.deltaY * 0.001), e.point)
          const client = { x: originEvent.clientX, y: originEvent.clientY }
          const view = canvas.clientToCanvasPoint(client.x, client.y)
          const content = contentAtView(view, viewport)
          moveMarker(content)
          setProbe({
            client,
            view,
            content,
            viewSize: { width: canvas.width, height: canvas.height },
            surface: surfaceFrame(canvas.getSurfaceMetrics()),
          })
          setEventPoint(e.point)
          setViewport(viewport)
        },
      },
      {
        name: "coordinate-space-key",
        event: ["keydown", "keyup"],
        callback: ({ e, originEvent, tools }) => {
          if (!isSpacePressed(e.pressedKeys) && e.key !== " " && e.key !== "Spacebar") return
          originEvent.preventDefault()
          tools.changeCursor(e.name === "keydown" ? "grab" : "default")
        },
      },
    ]
  }, [])

  const mounted = (tools: StayTools) => {
    toolsRef.current = tools
    const grid = new Map<string, Line>()
    for (let x = -600; x <= 1400; x += 50) {
      grid.set(`x:${x}`, new Line({ x1: x, y1: -600, x2: x, y2: 1200, zIndex: -10, strokeConfig: { color: { r: 78, g: 89, b: 104, a: 0.1 }, lineWidth: x === 0 ? 2 : 1 } }))
    }
    for (let y = -600; y <= 1200; y += 50) {
      grid.set(`y:${y}`, new Line({ x1: -600, y1: y, x2: 1400, y2: y, zIndex: -10, strokeConfig: { color: { r: 78, g: 89, b: 104, a: 0.1 }, lineWidth: y === 0 ? 2 : 1 } }))
    }
    const gridChild = tools.appendChild({ className: "coordinate-grid", shape: grid })
    setProbe((current) => ({
      ...current,
      viewSize: { width: gridChild.canvas.width, height: gridChild.canvas.height },
    }))
    tools.appendChild({
      className: "coordinate-object",
      shape: [
        new Rectangle({ x: 145, y: 155, width: 190, height: 120, fillConfig: { color: colors.blueSoft }, strokeConfig: { color: colors.blue, lineWidth: 2 } }),
        new StayText({ x: 240, y: 207, text: text("Content object", "Content 中的对象"), textAlign: "center", textBaseline: "middle", font: { size: 18, fontWeight: 700 }, fillConfig: { color: colors.ink } }),
        new StayText({ x: 240, y: 239, text: "x=145  y=155", textAlign: "center", textBaseline: "middle", font: { size: 12 }, fillConfig: { color: colors.gray } }),
      ],
    })
    const dot = new Circle({ x: 0, y: 0, radius: 6, zIndex: 20, fillConfig: { color: colors.orange } })
    const horizontal = new Line({ x1: -18, y1: 0, x2: 18, y2: 0, zIndex: 19, strokeConfig: { color: colors.orange, lineWidth: 2 } })
    const vertical = new Line({ x1: 0, y1: -18, x2: 0, y2: 18, zIndex: 19, strokeConfig: { color: colors.orange, lineWidth: 2 } })
    const label = new StayText({ x: 14, y: -22, text: "Content", textBaseline: "bottom", font: { size: 11, fontWeight: 700 }, zIndex: 20, fillConfig: { color: colors.orange } })
    markerRef.current = { dot, horizontal, vertical, label }
    tools.appendChild({ className: "coordinate-marker", shape: [dot, horizontal, vertical, label] })
    const surface = surfaceFrame(gridChild.canvas.getSurfaceMetrics())
    const view = { x: gridChild.canvas.width / 2, y: gridChild.canvas.height / 2 }
    const client = {
      x: surface.left + view.x / surface.scaleX,
      y: surface.top + view.y / surface.scaleY,
    }
    const currentViewport = tools.viewport.get()
    const content = contentAtView(view, currentViewport)
    moveMarker(content)
    setProbe({
      client,
      view,
      content,
      viewSize: { width: gridChild.canvas.width, height: gridChild.canvas.height },
      surface,
    })
    setEventPoint(content)
  }

  const changeViewport = (action: (tools: StayTools) => Readonly<ViewportState>) => {
    const tools = toolsRef.current
    if (!tools) return
    const viewport = action(tools)
    syncProbeWithViewport(viewport)
  }

  return (
    <DemoLayout>
      <div className="coordinate-workspace">
        <CoordinateStack probe={probe} viewport={viewport} />
        <CanvasCard
          title={text("Live viewport", "实时可操作视口")}
          description={text("Move the pointer, scroll to zoom, or hold Space and drag to pan.", "移动指针、滚轮缩放，或按住空格键拖动画布。")}
          wide
        >
          <StayCanvas
            className="demo-canvas coordinate-canvas"
            eventList={[spaceStartMove]}
            height={440}
            layers={2}
            listenerList={listeners}
            mounted={mounted}
            passive={false}
            viewport={{ minScale: 0.4, maxScale: 3 }}
            width={320}
          />
        </CanvasCard>
      </div>
      <div className="coordinate-flow" aria-label={text("Coordinate conversion flow", "坐标转换流程")}>
        <p>{text("The same pointer, expressed three ways", "同一个指针，三种坐标表达")}</p>
        <div className="coordinate-flow-value coordinate-flow-client">
          <span>Client</span><strong>{rounded(probe.client)}</strong><small>{text("Browser-window position", "浏览器窗口位置")}</small>
        </div>
        <div className="coordinate-flow-operation">
          <span>{text("Subtract the Canvas DOM origin, then apply display scale", "减去 Canvas DOM 原点，再乘显示比例")}</span>
          <code>[({rounded(probe.client)}) - ({Math.round(probe.surface.left)}, {Math.round(probe.surface.top)})] × {scaleFactors(probe.surface)}</code>
        </div>
        <div className="coordinate-flow-value coordinate-flow-view">
          <span>View</span><strong>{rounded(probe.view)}</strong><small>{text("Logical Canvas surface", "Canvas 逻辑显示面")}</small>
        </div>
        <div className="coordinate-flow-operation">
          <span>{text("Undo viewport offset and scale", "撤销 viewport 平移与缩放")}</span>
          <code>[({rounded(probe.view)}) - ({Math.round(viewport.x)}, {Math.round(viewport.y)})] ÷ {viewport.scale.toFixed(2)}</code>
        </div>
        <div className="coordinate-flow-value coordinate-flow-result">
          <span>Content</span><strong>{rounded(probe.content)}</strong><small>{text("Result in the current viewport", "当前 viewport 下的转换结果")}</small>
        </div>
      </div>
      <StatusGrid items={[
        [text("Canvas DOM origin", "Canvas DOM 原点"), `${Math.round(probe.surface.left)}, ${Math.round(probe.surface.top)}`],
        [text("Display scale", "显示比例"), scalePair(probe.surface)],
        ["Viewport", `${Math.round(viewport.x)}, ${Math.round(viewport.y)} / ${Math.round(viewport.scale * 100)}%`],
        [text("Last event e.point", "最近事件 e.point"), rounded(eventPoint)],
        [text("Child geometry", "Child 几何"), text("Never changed", "始终不变")],
      ]} />
      <Toolbar>
        <Button onClick={() => changeViewport((tools) => tools.viewport.zoomBy(1.2))}>{text("Zoom in", "放大")}</Button>
        <Button onClick={() => changeViewport((tools) => tools.viewport.zoomBy(1 / 1.2))}>{text("Zoom out", "缩小")}</Button>
        <Button onClick={() => changeViewport((tools) => tools.viewport.panBy({ x: 40, y: 20 }))}>{text("Pan +40,+20", "平移 +40,+20")}</Button>
        <Button onClick={() => changeViewport((tools) => tools.viewport.reset())}>{text("Reset view", "重置视图")}</Button>
      </Toolbar>
    </DemoLayout>
  )
}

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

type Probe = {
  client: Coordinate
  view: Coordinate
  content: Coordinate
  sampleViewport: Readonly<ViewportState>
}

const rounded = ({ x, y }: Coordinate) => `${Math.round(x)}, ${Math.round(y)}`

export default function CoordinatesExample() {
  const { text } = useI18n()
  const toolsRef = useRef<StayTools>()
  const markerRef = useRef<{ dot: Circle; horizontal: Line; vertical: Line; label: StayText }>()
  const [probe, setProbe] = useState<Probe>({
    client: { x: 0, y: 0 },
    view: { x: 0, y: 0 },
    content: { x: 0, y: 0 },
    sampleViewport: { x: 0, y: 0, scale: 1 },
  })
  const [viewport, setViewport] = useState<Readonly<ViewportState>>({ x: 0, y: 0, scale: 1 })

  const moveMarker = (point: Coordinate) => {
    const marker = markerRef.current
    if (!marker) return
    marker.dot.update(point)
    marker.horizontal.update({ x1: point.x - 18, y1: point.y, x2: point.x + 18, y2: point.y })
    marker.vertical.update({ x1: point.x, y1: point.y - 18, x2: point.x, y2: point.y + 18 })
    marker.label.update({ x: point.x + 14, y: point.y - 22 })
  }

  const listeners = useMemo<ListenerProps[]>(() => {
    const observe = ({ e, originEvent, canvas, tools }: Parameters<ListenerProps["callback"]>[0]) => {
      if (!hasPointerPosition(e) || !(originEvent instanceof MouseEvent)) return
      const client = { x: originEvent.clientX, y: originEvent.clientY }
      const view = canvas.clientToCanvasPoint(client.x, client.y)
      moveMarker(e.point)
      const sampleViewport = tools.viewport.get()
      setProbe({ client, view, content: e.point, sampleViewport })
      setViewport(sampleViewport)
    }

    return [
      {
        name: "coordinate-probe",
        selector: ".stay-canvas",
        event: ["mousemove", "mousedown"],
        callback: observe,
      },
      {
        name: "coordinate-pan",
        selector: ".stay-canvas",
        event: ["startmove", "move", "moveend"],
        callback: ({ e, composeStore, tools }) => ({
          startmove: () => {
            tools.changeCursor("grabbing")
            return { originViewport: tools.viewport.get() }
          },
          move: () => {
            const viewport = tools.viewport.panBy(e.movement ?? { x: 0, y: 0 })
            setViewport(viewport)
            return composeStore
          },
          moveend: () => {
            const viewport = e.cancelled && composeStore.originViewport
              ? tools.viewport.restore(composeStore.originViewport)
              : tools.viewport.get()
            setViewport(viewport)
            tools.changeCursor(isSpacePressed(e.pressedKeys) ? "grab" : "default")
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
          const sampleViewport = tools.viewport.get()
          const viewport = tools.viewport.zoomBy(Math.max(0.1, 1 - e.deltaY * 0.001), e.point)
          const client = { x: originEvent.clientX, y: originEvent.clientY }
          moveMarker(e.point)
          setProbe({
            client,
            view: canvas.clientToCanvasPoint(client.x, client.y),
            content: e.point,
            sampleViewport,
          })
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
    tools.appendChild({ className: "coordinate-grid", shape: grid })
    tools.appendChild({
      className: "coordinate-object",
      shape: [
        new Rectangle({ x: 310, y: 175, width: 210, height: 130, fillConfig: { color: colors.blueSoft }, strokeConfig: { color: colors.blue, lineWidth: 2 } }),
        new StayText({ x: 415, y: 230, text: text("Content object", "Content 中的对象"), textAlign: "center", textBaseline: "middle", font: { size: 18, fontWeight: 700 }, fillConfig: { color: colors.ink } }),
        new StayText({ x: 415, y: 263, text: "x=310  y=175", textAlign: "center", textBaseline: "middle", font: { size: 12 }, fillConfig: { color: colors.gray } }),
      ],
    })
    const dot = new Circle({ x: 0, y: 0, radius: 6, zIndex: 20, fillConfig: { color: colors.orange } })
    const horizontal = new Line({ x1: -18, y1: 0, x2: 18, y2: 0, zIndex: 19, strokeConfig: { color: colors.orange, lineWidth: 2 } })
    const vertical = new Line({ x1: 0, y1: -18, x2: 0, y2: 18, zIndex: 19, strokeConfig: { color: colors.orange, lineWidth: 2 } })
    const label = new StayText({ x: 14, y: -22, text: "e.point", textBaseline: "bottom", font: { size: 11, fontWeight: 700 }, zIndex: 20, fillConfig: { color: colors.orange } })
    markerRef.current = { dot, horizontal, vertical, label }
    tools.appendChild({ className: "coordinate-marker", shape: [dot, horizontal, vertical, label] })
  }

  const changeViewport = (action: (tools: StayTools) => Readonly<ViewportState>) => {
    const tools = toolsRef.current
    if (!tools) return
    const viewport = action(tools)
    setViewport(viewport)
  }

  return (
    <DemoLayout>
      <CanvasCard
        title={text("One pointer, three coordinate spaces", "一个指针，三套坐标")}
        description={text("Move the pointer, scroll to zoom, or hold Space and drag to pan.", "移动指针、滚轮缩放，或按住空格键拖动画布。")}
        wide
      >
        <StayCanvas
          className="demo-canvas coordinate-canvas"
          eventList={[spaceStartMove]}
          height={480}
          layers={2}
          listenerList={listeners}
          mounted={mounted}
          passive={false}
          viewport={{ minScale: 0.4, maxScale: 3 }}
          width={760}
        />
      </CanvasCard>
      <div className="coordinate-flow" aria-label={text("Coordinate conversion flow", "坐标转换流程")}>
        <div><span>1 · Client</span><strong>{rounded(probe.client)}</strong><small>{text("Browser viewport pixels", "浏览器窗口像素")}</small></div>
        <i aria-hidden="true">→</i>
        <div><span>2 · View</span><strong>{rounded(probe.view)}</strong><small>{text("Displayed Canvas surface", "Canvas 显示平面")}</small></div>
        <i aria-hidden="true">→</i>
        <div><span>3 · Content</span><strong>{rounded(probe.content)}</strong><small>{text("Public e.point", "公开的 e.point")}</small></div>
      </div>
      <StatusGrid items={[
        [text("Sample viewport", "采样帧视口"), `${Math.round(probe.sampleViewport.x)}, ${Math.round(probe.sampleViewport.y)} · ${Math.round(probe.sampleViewport.scale * 100)}%`],
        [text("Current viewport", "当前视口"), `${Math.round(viewport.x)}, ${Math.round(viewport.y)} · ${Math.round(viewport.scale * 100)}%`],
        ["e.movement", text("View delta", "View 空间增量")],
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

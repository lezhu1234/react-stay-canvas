import { useMemo, useRef, useState } from "react"
import {
  Circle,
  EventProps,
  ListenerProps,
  MOUSE_EVENTS,
  Rectangle,
  StayCanvas,
  StayText,
  StayTools,
} from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, placeSceneChild, ResetButton, resetScene, scenePoint, StatusGrid, Toolbar } from "../../components/DemoKit"
import { useI18n } from "../../i18n"
import { hasPointerPosition } from "../actionEventGuards"

const isSpacePressed = (pressedKeys: Set<string>) =>
  pressedKeys.has(" ") || pressedKeys.has("Spacebar")

const spaceMoveEndEvent: EventProps<string> = {
  name: "moveend",
  trigger: MOUSE_EVENTS.MOUSE_UP,
  conditionCallback: ({ e, store }) => Boolean(e.cancelled || store.get("spaceMoving")),
  successCallback: ({ store, deleteEvent }) => {
    store.set("spaceMoving", false)
    deleteEvent("move")
    deleteEvent("moveend")
  },
}

const spaceMoveEvent: EventProps<string> = {
  name: "move",
  trigger: MOUSE_EVENTS.MOUSE_MOVE,
  conditionCallback: ({ e }) =>
    isSpacePressed(e.pressedKeys) && e.pressedKeys.has("mouse0"),
  successCallback: ({ store }) => {
    store.set("spaceMoving", true)
    return spaceMoveEndEvent
  },
}

const spaceStartMoveEvent: EventProps<string> = {
  name: "startmove",
  trigger: MOUSE_EVENTS.MOUSE_DOWN,
  conditionCallback: ({ e }) =>
    isSpacePressed(e.pressedKeys) && e.pressedKeys.has("mouse0"),
  successCallback: ({ store }) => {
    store.set("spaceMoving", false)
    return [spaceMoveEvent, spaceMoveEndEvent]
  },
}

export default function TransformExample() {
  const { text } = useI18n()
  const toolsRef = useRef<StayTools | null>(null)
  const originMarkerRef = useRef<Circle | null>(null)
  const originLabelRef = useRef<StayText | null>(null)
  const [action, setAction] = useState(text("Original view", "初始视图"))
  const [zoomOrigin, setZoomOrigin] = useState("220, 145")
  const [sessionState, setSessionState] = useState(text("Idle", "空闲"))
  const [pointerPosition, setPointerPosition] = useState(text("Inside", "Canvas 内"))
  const [primaryButton, setPrimaryButton] = useState(text("Released", "已松开"))
  const [endCount, setEndCount] = useState(0)
  const [terminalReason, setTerminalReason] = useState(text("None", "无"))

  const isInsideCanvas = (x: number, y: number, width: number, height: number) =>
    x >= 0 && x <= width && y >= 0 && y <= height

  const markZoomOrigin = (x: number, y: number) => {
    originMarkerRef.current?.update({ x, y })
    originLabelRef.current?.update({ x: x + 42, y: y - 7 })
    setZoomOrigin(`${Math.round(x)}, ${Math.round(y)}`)
  }

  const listeners = useMemo<ListenerProps[]>(() => [
    {
      name: "prevent-space-scroll",
      event: ["keydown", "keyup"],
      callback: ({ e, originEvent }) => {
        if (e.key === " " || e.key === "Spacebar") originEvent.preventDefault()
      },
    },
    {
      name: "wheel-zoom",
      event: ["zoomin", "zoomout"],
      callback: ({ e, tools, originEvent }) => {
        if (!hasPointerPosition(e) || e.deltaY === undefined) return
        originEvent.preventDefault()
        markZoomOrigin(e.x, e.y)
        void tools.zoom(e.deltaY, e.point)
        setAction(e.name === "zoomin"
          ? text(`Zoomed in around ${Math.round(e.x)}, ${Math.round(e.y)}`, `已放大，中心 ${Math.round(e.x)}, ${Math.round(e.y)}`)
          : text(`Zoomed out around ${Math.round(e.x)}, ${Math.round(e.y)}`, `已缩小，中心 ${Math.round(e.x)}, ${Math.round(e.y)}`))
      },
    },
    {
      name: "space-pan",
      event: ["startmove", "move", "moveend"],
      callback: ({ e, composeStore, tools, canvas }) => {
        if (!hasPointerPosition(e)) return
        return {
          startmove: () => {
            tools.moveStart()
            return { start: e.point }
          },
          move: () => {
            void tools.move(e.x - composeStore.start.x, e.y - composeStore.start.y)
            setAction(text("Space-drag panning", "空格拖动平移中"))
            setSessionState(text("Active", "进行中"))
            setPrimaryButton(text("Pressed", "按下中"))
            setTerminalReason(text("None", "无"))
            setPointerPosition(isInsideCanvas(e.x, e.y, canvas.width, canvas.height)
              ? text("Inside", "Canvas 内")
              : text("Outside", "Canvas 外"))
          },
          moveend: () => {
            const outside = !isInsideCanvas(e.x, e.y, canvas.width, canvas.height)
            const cancelled = e.cancelled ?? false
            setAction(cancelled
              ? text("Space-drag cancelled", "空格拖动已取消")
              : text("Space-drag ended", "空格拖动结束"))
            setSessionState(cancelled
              ? text("Cancelled", "已取消")
              : text("Ended", "已结束"))
            setPointerPosition(outside
              ? text("Outside", "Canvas 外")
              : text("Inside", "Canvas 内"))
            setPrimaryButton(text("Released", "已松开"))
            setEndCount((count) => count + 1)
            setTerminalReason(cancelled
              ? text(
                  e.cancelReason ?? "pointer cancelled",
                  `取消：${e.cancelReason ?? "pointercancel"}`
                )
              : outside
                ? text("pointerup outside", "在 Canvas 外 pointerup")
                : text("pointerup inside", "在 Canvas 内 pointerup"))
          },
        }
      },
    },
  ], [text])

  const mounted = (tools: StayTools) => {
    toolsRef.current = tools
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 4; column++) {
        placeSceneChild(tools, tools.appendChild({
          className: "tile",
          shape: new Rectangle({
            x: 42 + column * 92,
            y: 42 + row * 68,
            width: 64,
            height: 42,
            fillConfig: { color: (row + column) % 2 ? colors.blueSoft : colors.greenSoft },
            strokeConfig: { color: (row + column) % 2 ? colors.blue : colors.green, lineWidth: 1 },
          }),
        }))
      }
    }
    placeSceneChild(tools, tools.appendChild({ className: "label", shape: new StayText({ x: 220, y: 250, text: text("wheel to zoom  |  hold Space and drag to pan", "滚轮缩放  |  按住空格键拖动平移"), textAlign: "center", textBaseline: "top", font: { size: 14 }, fillConfig: { color: colors.ink } }) }))
    originMarkerRef.current = new Circle({
      x: 220,
      y: 145,
      radius: 7,
      zIndex: 3,
      fillConfig: { color: colors.paper },
      strokeConfig: { color: colors.orange, lineWidth: 3 },
    })
    originLabelRef.current = new StayText({
      x: 262,
      y: 138,
      text: text("zoom origin", "缩放原点"),
      textAlign: "center",
      textBaseline: "top",
      font: { size: 11, fontWeight: 700 },
      zIndex: 3,
      fillConfig: { color: colors.orange },
    })
    placeSceneChild(tools, tools.appendChild({ className: "zoom-origin", shape: [originMarkerRef.current, originLabelRef.current] }))
    const origin = scenePoint(tools, 220, 145)
    markZoomOrigin(origin.x, origin.y)
  }

  const pan = (x: number, y: number) => {
    const tools = toolsRef.current
    if (!tools) return
    tools.moveStart()
    void tools.move(x, y)
    setAction(text(`Moved ${x}, ${y}`, `已移动 ${x}, ${y}`))
  }

  const zoom = (delta: number) => {
    const tools = toolsRef.current
    if (!tools) return
    const origin = scenePoint(tools, 220, 145)
    markZoomOrigin(origin.x, origin.y)
    void tools.zoom(delta, origin)
    setAction(delta < 0 ? text("Zoomed in", "已放大") : text("Zoomed out", "已缩小"))
  }

  return (
    <DemoLayout>
      <div className="pointer-session-demo">
        <CanvasCard title={text("Viewport transforms", "平移与缩放")} description={text("Hold Space and drag from the Canvas into the striped release zone, then release outside.", "按住空格键从 Canvas 内拖到右侧条纹区域，并在 Canvas 外松开鼠标。") }>
          <StayCanvas className="demo-canvas demo-canvas-grid" eventList={[spaceStartMoveEvent]} height={290} listenerList={listeners} mounted={mounted} passive={false} width={440} />
        </CanvasCard>
        <aside className="outside-release-zone">
          <span>{text("Outside Canvas", "Canvas 外部")}</span>
          <strong>{text("Release primary button here", "在这里松开鼠标主键")}</strong>
          <p>{text("Then move back without pressing it again.", "然后不要再次按键，直接移回 Canvas。")}</p>
        </aside>
      </div>
      <Toolbar>
        <Button onClick={() => pan(-24, 0)}>{text("Pan left", "向左平移")}</Button>
        <Button onClick={() => pan(24, 0)}>{text("Pan right", "向右平移")}</Button>
        <Button onClick={() => zoom(-120)}>{text("Zoom in", "放大")}</Button>
        <Button onClick={() => zoom(120)}>{text("Zoom out", "缩小")}</Button>
        <Button onClick={() => {
          const tools = toolsRef.current
          if (!tools) return
          const origin = scenePoint(tools, 220, 145)
          void resetScene(tools)
          markZoomOrigin(origin.x, origin.y)
          setAction(text("Reset transform", "已恢复初始视图"))
        }}>{text("Tool reset", "恢复初始视图")}</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[[text("Last transform", "最近变换"), action], [text("Session", "会话状态"), sessionState], [text("Pointer", "指针位置"), pointerPosition], [text("Primary button", "鼠标主键"), primaryButton], [text("End count", "结束次数"), endCount], [text("Terminal reason", "结束原因"), terminalReason], [text("Zoom origin", "缩放原点"), zoomOrigin]]} />
    </DemoLayout>
  )
}

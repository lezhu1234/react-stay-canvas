import { useMemo, useRef, useState } from "react"
import { Circle, ListenerProps, Rectangle, StayCanvas, StayTools } from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, EventLog, ResetButton, StatusGrid, Toolbar } from "../../components/DemoKit"
import { useI18n } from "../../i18n"

type Mode = "draw" | "select"

export default function StateExample() {
  const { text } = useI18n()
  const toolsRef = useRef<StayTools | null>(null)
  const [mode, setMode] = useState<Mode>("draw")
  const [entries, setEntries] = useState<string[]>([])
  const [persistentCount, setPersistentCount] = useState(0)
  const [stateCount, setStateCount] = useState(0)

  const push = (message: string) => setEntries((current) => [message, ...current].slice(0, 8))

  const listeners = useMemo<ListenerProps[]>(() => [
    {
      name: "draw-item",
      state: "draw",
      event: "click",
      callback: ({ e, tools }) => {
        tools.appendChild({
          className: "item",
          shape: new Circle({
            x: e.x,
            y: e.y,
            radius: 18,
            fillConfig: { color: colors.blueSoft },
            strokeConfig: { color: colors.blue, lineWidth: 2 },
          }),
        })
        push(text(`draw listener fired at ${Math.round(e.x)}, ${Math.round(e.y)}`, `绘制监听器触发于 ${Math.round(e.x)}, ${Math.round(e.y)}`))
      },
    },
    {
      name: "select-item",
      state: "select",
      selector: ".item",
      event: "click",
      callback: ({ e }) => {
        const shape = e.target.shape as Circle
        shape.update({ fillConfig: { color: colors.orangeSoft }, strokeConfig: { color: colors.orange, lineWidth: 4 } })
        push(text(`select listener fired for ${e.target.id.slice(0, 8)}`, `选择监听器命中 ${e.target.id.slice(0, 8)}`))
      },
    },
    {
      name: "store-probe",
      state: "all-state",
      event: "mousedown",
      callback: ({ store, stateStore }) => {
        const persistent = (store.get("count") ?? 0) + 1
        const scoped = (stateStore.get("count") ?? 0) + 1
        store.set("count", persistent)
        stateStore.set("count", scoped)
        setPersistentCount(persistent)
        setStateCount(scoped)
      },
    },
  ], [text])

  const mounted = (tools: StayTools) => {
    toolsRef.current = tools
    tools.switchState("draw")
    tools.appendChild({
      className: "guide",
      shape: new Rectangle({ x: 18, y: 18, width: 404, height: 224, strokeConfig: { color: colors.gray, lineWidth: 1, dash: [5, 6] } }),
    })
  }

  const switchMode = (next: Mode) => {
    toolsRef.current?.switchState(next)
    setMode(next)
    setStateCount(0)
    push(text(`state changed to ${next}`, `状态已切换为 ${next === "draw" ? "绘制" : "选择"}`))
  }

  return (
    <DemoLayout>
      <CanvasCard title={text("State-scoped listeners", "按状态生效的监听器")} description={text("Draw mode creates circles. Select mode highlights existing circles.", "绘制模式创建圆形，选择模式高亮已有圆形。")} wide>
        <StayCanvas className="demo-canvas" height={260} listenerList={listeners} mounted={mounted} width={440} />
      </CanvasCard>
      <Toolbar>
        <Button active={mode === "draw"} onClick={() => switchMode("draw")}>{text("Draw mode", "绘制模式")}</Button>
        <Button active={mode === "select"} onClick={() => switchMode("select")}>{text("Select mode", "选择模式")}</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[[text("Current state", "当前状态"), mode === "draw" ? text("draw", "绘制") : text("select", "选择")], [text("Persistent store", "持久 Store"), persistentCount], [text("State store", "状态 Store"), stateCount]]} />
      <EventLog entries={entries} />
    </DemoLayout>
  )
}

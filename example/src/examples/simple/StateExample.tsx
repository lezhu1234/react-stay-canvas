import { useMemo, useRef, useState } from "react"
import { Circle, ListenerProps, Rectangle, StayCanvas, StayText, StayTools } from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, EventLog, ResetButton, StatusGrid, Toolbar } from "../../components/DemoKit"
import { useI18n } from "../../i18n"
import { hasPointerPosition } from "../actionEventGuards"

type Mode = "draw" | "select"

export default function StateExample() {
  const { text } = useI18n()
  const toolsRef = useRef<StayTools | null>(null)
  const sequenceRef = useRef(0)
  const selectedRef = useRef<string | null>(null)
  const itemNamesRef = useRef(new Map<string, string>())
  const [mode, setMode] = useState<Mode>("draw")
  const [selected, setSelected] = useState(text("None", "无"))
  const [entries, setEntries] = useState<string[]>([])
  const [persistentCount, setPersistentCount] = useState(0)
  const [stateCount, setStateCount] = useState(0)

  const push = (message: string) => setEntries((current) => [message, ...current].slice(0, 8))

  const clearSelection = (tools: StayTools) => {
    if (selectedRef.current) {
      tools.getChildById<Circle>(selectedRef.current)?.shape.update({
        fillConfig: { color: colors.blueSoft },
        strokeConfig: { color: colors.blue, lineWidth: 2 },
      })
    }
    selectedRef.current = null
    setSelected(text("None", "无"))
  }

  const listeners = useMemo<ListenerProps[]>(() => [
    {
      name: "draw-item",
      state: "draw",
      event: "click",
      callback: ({ e, tools }) => {
        if (!hasPointerPosition(e)) return
        const index = ++sequenceRef.current
        const name = text(`Item ${index}`, `圆形 ${index}`)
        tools.appendChild({
          id: `item-${index}`,
          className: "item",
          shape: [
            new Circle({
              x: e.x,
              y: e.y,
              radius: 18,
              fillConfig: { color: colors.blueSoft },
              strokeConfig: { color: colors.blue, lineWidth: 2 },
            }),
            new StayText({
              x: e.x,
              y: e.y - 7,
              text: String(index),
              font: { size: 12, fontWeight: 700 },
              fillConfig: { color: colors.ink },
            }),
          ],
        })
        itemNamesRef.current.set(`item-${index}`, name)
        push(text(`${name} drawn at ${Math.round(e.x)}, ${Math.round(e.y)}`, `${name} 已绘制于 ${Math.round(e.x)}, ${Math.round(e.y)}`))
      },
    },
    {
      name: "select-item",
      state: "select",
      selector: ".stay-canvas",
      event: "click",
      callback: ({ e, tools }) => {
        if (!hasPointerPosition(e)) return
        const target = tools.getContainPointChildren<Circle>({
          point: e.point,
          selector: ".item",
          withRoot: false,
        })[0]
        clearSelection(tools)
        if (!target) {
          push(text("selection cleared", "已取消选择"))
          return
        }
        target.shape.update({ fillConfig: { color: colors.orangeSoft }, strokeConfig: { color: colors.orange, lineWidth: 4 } })
        selectedRef.current = target.id
        const name = itemNamesRef.current.get(target.id) ?? target.id
        setSelected(name)
        push(text(`${name} selected`, `已选择${name}`))
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
    if (toolsRef.current) clearSelection(toolsRef.current)
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
      <StatusGrid items={[[text("Current state", "当前状态"), mode === "draw" ? text("draw", "绘制") : text("select", "选择")], [text("Selected", "已选择"), selected], [text("Persistent store", "持久 Store"), persistentCount], [text("State store", "状态 Store"), stateCount]]} />
      <EventLog entries={entries} />
    </DemoLayout>
  )
}

import { useMemo, useRef, useState } from "react"
import {
  ListenerProps,
  Rectangle,
  StayCanvas,
  StayCanvasRefType,
  StayText,
  StayTools,
} from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, EventLog, ResetButton, StatusGrid, Toolbar } from "../../components/DemoKit"
import { useI18n } from "../../i18n"
import { hasPointerTarget } from "../actionEventGuards"

export default function EventsExample() {
  const { text } = useI18n()
  const canvasRef = useRef<StayCanvasRefType>(null)
  const [entries, setEntries] = useState<string[]>([])
  const [pings, setPings] = useState(0)
  const [focusRequests, setFocusRequests] = useState(0)
  const [canvasInstances, setCanvasInstances] = useState(0)
  const push = (message: string) => setEntries((current) => [message, ...current].slice(0, 12))

  const listeners = useMemo<ListenerProps[]>(() => [
    {
      name: "drag-card",
      event: ["dragstart", "drag", "dragend"],
      selector: ".target",
      callback: ({ e, composeStore }) => {
        if (!hasPointerTarget(e)) return
        return {
          dragstart: () => {
            push(text(`dragstart at ${Math.round(e.x)}, ${Math.round(e.y)}`, `dragstart，坐标 ${Math.round(e.x)}, ${Math.round(e.y)}`))
            e.target.moveInit()
            return { target: e.target, start: e.point }
          },
          drag: () => {
            composeStore.target.move(e.x - composeStore.start.x, e.y - composeStore.start.y)
            push(text(`drag at ${Math.round(e.x)}, ${Math.round(e.y)}`, `drag，坐标 ${Math.round(e.x)}, ${Math.round(e.y)}`))
          },
          dragend: () => push(text("dragend", "dragend，拖动结束")),
        }
      },
    },
    {
      name: "event-probe",
      event: ["click", "keydown", "zoomin", "zoomout"],
      selector: ".target|.stay-canvas",
      state: "all-state",
      callback: ({ e }) => {
        push(e.name === "keydown" ? text(`keydown: ${e.key}`, `keydown：${e.key}`) : e.name)
      },
    },
    {
      name: "ping",
      event: "ping",
      state: "all-state",
      callback: ({ payload }) => {
        setPings((value) => value + 1)
        push(text(`custom ping: ${payload.message}`, `自定义 ping：${payload.message}`))
      },
    },
  ], [text])

  const mounted = (tools: StayTools) => {
    tools.appendChild({
      id: "drag-target",
      className: "target",
      shape: [
        new Rectangle({
          x: 118,
          y: 72,
          width: 204,
          height: 118,
          fillConfig: { color: colors.blueSoft },
          strokeConfig: { color: colors.blue, lineWidth: 3 },
        }),
        new StayText({ x: 220, y: 116, text: text("drag me", "拖动我"), font: { size: 20, fontWeight: 650 }, fillConfig: { color: colors.ink } }),
      ],
    })
    setCanvasInstances((value) => value + 1)
  }

  const focusCanvas = () => {
    canvasRef.current?.focus()
    setFocusRequests((value) => value + 1)
    push(text("Canvas focus requested from React", "已从 React 请求聚焦 Canvas"))
  }

  const recreateCanvas = () => {
    canvasRef.current?.reCreate()
    push(text("Canvas recreated", "Canvas 已重新创建"))
  }

  return (
    <DemoLayout>
      <CanvasCard title={text("DOM events and custom actions", "DOM 事件与自定义动作")} description={text("Focus the canvas, drag the blue target, scroll, or press a key.", "聚焦画布后可拖动蓝色目标、滚动或按键。")} wide>
        <StayCanvas ref={canvasRef} className="demo-canvas" height={260} listenerList={listeners} mounted={mounted} width={440} />
      </CanvasCard>
      <Toolbar>
        <Button onClick={() => canvasRef.current?.trigger("ping", { message: text("from React", "来自 React") })}>{text("Trigger ping", "触发 ping")}</Button>
        <Button onClick={focusCanvas}>{text("Focus canvas", "聚焦 Canvas")}</Button>
        <Button onClick={recreateCanvas}>{text("Recreate Canvas", "重新创建 Canvas")}</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[[text("Custom pings", "自定义 ping"), pings], [text("Focus requests", "聚焦次数"), focusRequests], [text("Canvas instances", "Canvas 实例数"), canvasInstances], [text("Latest event", "最近事件"), entries[0] ?? text("None", "无")], [text("Listener count", "监听器数量"), listeners.length]]} />
      <EventLog entries={entries} />
    </DemoLayout>
  )
}

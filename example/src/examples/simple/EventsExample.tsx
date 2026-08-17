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

export default function EventsExample() {
  const canvasRef = useRef<StayCanvasRefType>(null)
  const [entries, setEntries] = useState<string[]>([])
  const [pings, setPings] = useState(0)
  const push = (message: string) => setEntries((current) => [message, ...current].slice(0, 12))

  const listeners = useMemo<ListenerProps[]>(() => [
    {
      name: "drag-card",
      event: ["dragstart", "drag", "dragend"],
      selector: ".target",
      callback: ({ e, composeStore }) => ({
        dragstart: () => {
          push(`dragstart at ${Math.round(e.x)}, ${Math.round(e.y)}`)
          const shape = e.target.shape as Rectangle
          return { target: e.target, offsetX: e.x - shape.x, offsetY: e.y - shape.y }
        },
        drag: () => {
          const shape = composeStore.target.shape as Rectangle
          shape.update({ x: e.x - composeStore.offsetX, y: e.y - composeStore.offsetY })
          push(`drag at ${Math.round(e.x)}, ${Math.round(e.y)}`)
        },
        dragend: () => push("dragend"),
      }),
    },
    {
      name: "event-probe",
      event: ["click", "keydown", "zoomin", "zoomout"],
      selector: ".target|.stay-canvas",
      state: "all-state",
      callback: ({ e }) => {
        push(e.name === "keydown" ? `keydown: ${e.key}` : e.name)
      },
    },
    {
      name: "ping",
      event: "ping",
      state: "all-state",
      callback: ({ payload }) => {
        setPings((value) => value + 1)
        push(`custom ping: ${payload.message}`)
      },
    },
  ], [])

  const mounted = (tools: StayTools) => {
    tools.appendChild({
      className: "target",
      shape: new Rectangle({
        x: 118,
        y: 72,
        width: 204,
        height: 118,
        fillConfig: { color: colors.blueSoft },
        strokeConfig: { color: colors.blue, lineWidth: 3 },
      }),
    })
    tools.appendChild({
      className: "target-label",
      shape: new StayText({ x: 220, y: 116, text: "drag me", font: { size: 20, fontWeight: 650 }, fillConfig: { color: colors.ink } }),
    })
  }

  return (
    <DemoLayout>
      <CanvasCard title="DOM events and custom actions" description="Focus the canvas, drag the blue target, scroll, or press a key." wide>
        <StayCanvas ref={canvasRef} className="demo-canvas" height={260} listenerList={listeners} mounted={mounted} width={440} />
      </CanvasCard>
      <Toolbar>
        <Button onClick={() => canvasRef.current?.trigger("ping", { message: "from React" })}>Trigger ping</Button>
        <Button onClick={() => canvasRef.current?.focus()}>Focus canvas</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[["Custom pings", pings], ["Latest event", entries[0] ?? "None"], ["Listener count", listeners.length]]} />
      <EventLog entries={entries} />
    </DemoLayout>
  )
}

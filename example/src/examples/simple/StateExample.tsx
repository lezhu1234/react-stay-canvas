import { useMemo, useRef, useState } from "react"
import { Circle, ListenerProps, Rectangle, StayCanvas, StayTools } from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, EventLog, ResetButton, StatusGrid, Toolbar } from "../../components/DemoKit"

type Mode = "draw" | "select"

export default function StateExample() {
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
        push(`draw listener fired at ${Math.round(e.x)}, ${Math.round(e.y)}`)
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
        push(`select listener fired for ${e.target.id.slice(0, 8)}`)
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
  ], [])

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
    push(`state changed to ${next}`)
  }

  return (
    <DemoLayout>
      <CanvasCard title="State-scoped listeners" description="Draw mode creates circles. Select mode highlights existing circles." wide>
        <StayCanvas className="demo-canvas" height={260} listenerList={listeners} mounted={mounted} width={440} />
      </CanvasCard>
      <Toolbar>
        <Button active={mode === "draw"} onClick={() => switchMode("draw")}>Draw mode</Button>
        <Button active={mode === "select"} onClick={() => switchMode("select")}>Select mode</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[["Current state", mode], ["Persistent store", persistentCount], ["State store", stateCount]]} />
      <EventLog entries={entries} />
    </DemoLayout>
  )
}

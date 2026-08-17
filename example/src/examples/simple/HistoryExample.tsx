import { useRef, useState } from "react"
import { Rectangle, StayCanvas, StayTools } from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, EventLog, ResetButton, StatusGrid, Toolbar } from "../../components/DemoKit"

export default function HistoryExample() {
  const toolsRef = useRef<StayTools | null>(null)
  const sequence = useRef(0)
  const [count, setCount] = useState(0)
  const [entries, setEntries] = useState<string[]>([])
  const [operation, setOperation] = useState("Ready")

  const sync = (message: string) => {
    const nextCount = toolsRef.current?.getChildrenWithoutRoot().length ?? 0
    setCount(nextCount)
    setOperation(message)
    setEntries((current) => [message, ...current].slice(0, 7))
  }

  const add = () => {
    const tools = toolsRef.current
    if (!tools) return
    const index = sequence.current++
    const palette = [colors.blue, colors.green, colors.orange]
    const child = tools.appendChild({
      className: "history-item",
      shape: new Rectangle({
        x: 42 + (index % 4) * 90,
        y: 52 + Math.floor(index / 4) * 84,
        width: 66,
        height: 54,
        fillConfig: { color: { ...palette[index % palette.length], a: 0.22 } },
        strokeConfig: { color: palette[index % palette.length], lineWidth: 2 },
      }),
    })
    tools.log()
    sync(`append + log: ${child.id.slice(0, 8)}`)
  }

  const remove = () => {
    const tools = toolsRef.current
    const children = tools?.getChildrenBySelector(".history-item") ?? []
    const child = children[children.length - 1]
    if (!tools || !child) return
    tools.removeChild(child.id)
    tools.log()
    sync(`remove + log: ${child.id.slice(0, 8)}`)
  }

  const undo = () => {
    toolsRef.current?.undo()
    requestAnimationFrame(() => sync("undo"))
  }

  const redo = () => {
    toolsRef.current?.redo()
    requestAnimationFrame(() => sync("redo"))
  }

  return (
    <DemoLayout>
      <CanvasCard title="Snapshot history" description="Each append or removal is logged as one reversible operation." wide>
        <StayCanvas className="demo-canvas" height={250} mounted={(tools) => { toolsRef.current = tools }} width={440} />
      </CanvasCard>
      <Toolbar>
        <Button onClick={add}>Add and log</Button>
        <Button disabled={count === 0} onClick={remove}>Remove and log</Button>
        <Button onClick={undo}>Undo</Button>
        <Button onClick={redo}>Redo</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[["Visible children", count], ["Last operation", operation], ["History scope", "append / remove"]]} />
      <EventLog entries={entries} />
    </DemoLayout>
  )
}

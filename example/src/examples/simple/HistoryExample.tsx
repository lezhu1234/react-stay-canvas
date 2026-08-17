import { useRef, useState } from "react"
import { Rectangle, StayCanvas, StayTools } from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, EventLog, ResetButton, StatusGrid, Toolbar } from "../../components/DemoKit"
import { useI18n } from "../../i18n"

export default function HistoryExample() {
  const { text } = useI18n()
  const toolsRef = useRef<StayTools | null>(null)
  const sequence = useRef(0)
  const [count, setCount] = useState(0)
  const [entries, setEntries] = useState<string[]>([])
  const [operation, setOperation] = useState(text("Ready", "就绪"))

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
    sync(text(`append + log: ${child.id.slice(0, 8)}`, `添加并记录：${child.id.slice(0, 8)}`))
  }

  const remove = () => {
    const tools = toolsRef.current
    const children = tools?.getChildrenBySelector(".history-item") ?? []
    const child = children[children.length - 1]
    if (!tools || !child) return
    tools.removeChild(child.id)
    tools.log()
    sync(text(`remove + log: ${child.id.slice(0, 8)}`, `移除并记录：${child.id.slice(0, 8)}`))
  }

  const undo = () => {
    toolsRef.current?.undo()
    requestAnimationFrame(() => sync(text("undo", "撤销")))
  }

  const redo = () => {
    toolsRef.current?.redo()
    requestAnimationFrame(() => sync(text("redo", "重做")))
  }

  return (
    <DemoLayout>
      <CanvasCard title={text("Snapshot history", "撤销与重做")} description={text("Each append or removal is logged as one reversible operation.", "每次添加或删除都会写入历史，之后可以撤销或重做。")} wide>
        <StayCanvas className="demo-canvas" height={250} mounted={(tools) => { toolsRef.current = tools }} width={440} />
      </CanvasCard>
      <Toolbar>
        <Button onClick={add}>{text("Add and log", "添加并记录")}</Button>
        <Button disabled={count === 0} onClick={remove}>{text("Remove and log", "移除并记录")}</Button>
        <Button onClick={undo}>{text("Undo", "撤销")}</Button>
        <Button onClick={redo}>{text("Redo", "重做")}</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[[text("Visible children", "可见 Children"), count], [text("Last operation", "最近操作"), operation], [text("History scope", "历史范围"), text("append / remove", "添加 / 移除")]]} />
      <EventLog entries={entries} />
    </DemoLayout>
  )
}

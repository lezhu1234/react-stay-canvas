import { useMemo, useRef, useState } from "react"
import {
  ListenerProps,
  Rectangle,
  StayCanvas,
  StayImage,
  StayTools,
} from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, EventLog, ResetButton, StatusGrid, Toolbar } from "../../components/DemoKit"

type Mode = "draw" | "select"

function createAnnotationImage() {
  const canvas = document.createElement("canvas")
  canvas.width = 720
  canvas.height = 420
  const context = canvas.getContext("2d")!
  context.fillStyle = "#e8eae4"
  context.fillRect(0, 0, 720, 420)
  context.fillStyle = "#c8d0c5"
  context.fillRect(42, 42, 636, 336)
  context.fillStyle = "#77958a"
  context.fillRect(76, 82, 280, 250)
  context.fillStyle = "#435e6d"
  context.fillRect(392, 82, 250, 110)
  context.fillStyle = "#d5a27d"
  context.fillRect(392, 222, 250, 110)
  context.fillStyle = "rgba(255,255,255,.86)"
  context.font = "600 24px system-ui"
  context.fillText("sample workspace", 102, 296)
  return canvas.toDataURL("image/png")
}

export default function AnnotatorExample() {
  const toolsRef = useRef<StayTools | null>(null)
  const selectedRef = useRef<string | null>(null)
  const [mode, setMode] = useState<Mode>("draw")
  const [selected, setSelected] = useState("None")
  const [count, setCount] = useState(0)
  const [entries, setEntries] = useState<string[]>([])
  const [snapshot, setSnapshot] = useState<string | null>(null)

  const push = (message: string) => setEntries((current) => [message, ...current].slice(0, 8))
  const syncCount = (tools: StayTools) => setCount(tools.getChildrenBySelector(".annotation").length)

  const listeners = useMemo<ListenerProps[]>(() => [
    {
      name: "draw-annotation",
      state: "draw",
      selector: ".stay-canvas",
      event: ["dragstart", "drag", "dragend"],
      callback: ({ e, composeStore, tools }) => ({
        dragstart: () => {
          const child = tools.appendChild({
            className: "annotation",
            shape: new Rectangle({
              x: e.x,
              y: e.y,
              width: 0,
              height: 0,
              layer: 1,
              fillConfig: { color: colors.orangeSoft },
              strokeConfig: { color: colors.orange, lineWidth: 3 },
            }),
          })
          push("annotation started")
          return { start: e.point, child }
        },
        drag: () => {
          const start = composeStore.start
          const shape = composeStore.child.shape as Rectangle
          shape.update({
            x: Math.min(start.x, e.x),
            y: Math.min(start.y, e.y),
            width: Math.abs(e.x - start.x),
            height: Math.abs(e.y - start.y),
          })
        },
        dragend: () => {
          tools.log()
          syncCount(tools)
          push("annotation committed to history")
        },
      }),
    },
    {
      name: "select-annotation",
      state: "select",
      selector: ".annotation",
      event: "click",
      callback: ({ e, tools }) => {
        const previous = selectedRef.current
          ? tools.getChildById<Rectangle>(selectedRef.current)
          : undefined
        previous?.shape.update({ strokeConfig: { color: colors.orange, lineWidth: 3 } })
        const shape = e.target.shape as Rectangle
        shape.update({ strokeConfig: { color: colors.blue, lineWidth: 5 } })
        selectedRef.current = e.target.id
        setSelected(e.target.id.slice(0, 8))
        push(`selected ${e.target.id.slice(0, 8)}`)
      },
    },
    {
      name: "move-annotation",
      state: "select",
      selector: ".annotation",
      event: ["dragstart", "drag", "dragend"],
      callback: ({ e, composeStore, tools }) => ({
        dragstart: () => {
          e.target.moveInit()
          selectedRef.current = e.target.id
          setSelected(e.target.id.slice(0, 8))
          return { start: e.point, child: e.target }
        },
        drag: () => composeStore.child.move(e.x - composeStore.start.x, e.y - composeStore.start.y),
        dragend: () => {
          const child = composeStore.child
          const historyShape = (child.shape as Rectangle).copy() as Rectangle
          historyShape.update({ strokeConfig: { color: colors.orange, lineWidth: 3 } })
          tools.removeChild(child.id)
          const replacement = tools.appendChild({
            id: child.id,
            className: child.className,
            shape: historyShape,
          })
          tools.log()
          replacement.shape.update({ strokeConfig: { color: colors.blue, lineWidth: 5 } })
          push("selected annotation moved and logged")
        },
      }),
    },
  ], [])

  const mounted = (tools: StayTools) => {
    toolsRef.current = tools
    tools.switchState("draw")
    tools.appendChild({
      className: "background-matte",
      shape: new Rectangle({ x: 0, y: 0, width: 720, height: 420, layer: 0, fillConfig: { color: colors.paper } }),
    })
    const image = new Image()
    image.onload = () => {
      tools.appendChild({
        className: "background-image",
        shape: new StayImage({ image, x: 0, y: 0, width: 720, height: 420, opacity: 1, layer: 0 }),
      })
      tools.log()
      push("background ready")
    }
    image.src = createAnnotationImage()
  }

  const switchMode = (next: Mode) => {
    toolsRef.current?.switchState(next)
    toolsRef.current?.changeCursor(next === "draw" ? "crosshair" : "default")
    setMode(next)
    push(`mode: ${next}`)
  }

  const removeSelected = () => {
    const tools = toolsRef.current
    const id = selectedRef.current
    if (!tools || !id) return
    tools.removeChild(id)
    tools.log()
    selectedRef.current = null
    setSelected("None")
    syncCount(tools)
    push("selected annotation removed")
  }

  const capture = async () => {
    const tools = toolsRef.current
    if (!tools) return
    const canvas = await tools.regionToTargetCanvas({
      area: { x: 0, y: 0, width: 720, height: 420 },
      targetSize: { width: 720, height: 420 },
      children: tools.getChildrenWithoutRoot(),
    })
    setSnapshot(canvas.toDataURL("image/png"))
    push("canvas captured")
  }

  return (
    <DemoLayout>
      <CanvasCard title="Image annotation workspace" description="Draw boxes over a raster layer, then select, move, delete, transform, and export." wide>
        <StayCanvas className="demo-canvas" height={420} layers={2} listenerList={listeners} mounted={mounted} width={720} />
      </CanvasCard>
      <Toolbar>
        <Button active={mode === "draw"} onClick={() => switchMode("draw")}>Draw</Button>
        <Button active={mode === "select"} onClick={() => switchMode("select")}>Select</Button>
        <Button disabled={!selectedRef.current} onClick={removeSelected}>Delete selected</Button>
        <Button onClick={() => { toolsRef.current?.undo(); requestAnimationFrame(() => toolsRef.current && syncCount(toolsRef.current)); push("undo") }}>Undo</Button>
        <Button onClick={() => { toolsRef.current?.redo(); requestAnimationFrame(() => toolsRef.current && syncCount(toolsRef.current)); push("redo") }}>Redo</Button>
        <Button onClick={() => { void toolsRef.current?.zoom(-100, { x: 360, y: 210 }); push("zoom in") }}>Zoom in</Button>
        <Button onClick={() => { void toolsRef.current?.reset(); push("transform reset") }}>Reset view</Button>
        <Button onClick={capture}>Export image</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[["Mode", mode], ["Annotations", count], ["Selected", selected], ["Export", snapshot ? "Ready" : "Not captured"]]} />
      <EventLog entries={entries} />
      {snapshot && <div className="snapshot-preview"><img alt="Exported annotation canvas" src={snapshot} /></div>}
    </DemoLayout>
  )
}

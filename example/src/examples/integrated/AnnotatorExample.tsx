import { useMemo, useRef, useState } from "react"
import {
  ListenerProps,
  Rectangle,
  StayCanvas,
  StayImage,
  StayText,
  StayTools,
} from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, EventLog, ResetButton, StatusGrid, Toolbar } from "../../components/DemoKit"
import { useI18n } from "../../i18n"
import { hasPointerPosition, hasPointerTarget } from "../actionEventGuards"

type Mode = "draw" | "select"

function createAnnotationImage(label: string) {
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
  context.fillText(label, 102, 296)
  return canvas.toDataURL("image/png")
}

export default function AnnotatorExample() {
  const { text } = useI18n()
  const toolsRef = useRef<StayTools | null>(null)
  const selectedRef = useRef<string | null>(null)
  const sequenceRef = useRef(0)
  const annotationNamesRef = useRef(new Map<string, string>())
  const [mode, setMode] = useState<Mode>("draw")
  const [selected, setSelected] = useState(text("None", "无"))
  const [count, setCount] = useState(0)
  const [entries, setEntries] = useState<string[]>([])
  const [snapshot, setSnapshot] = useState<string | null>(null)

  const push = (message: string) => setEntries((current) => [message, ...current].slice(0, 8))
  const syncCount = (tools: StayTools) => setCount(tools.getChildrenBySelector(".annotation").length)
  const annotationName = (id: string) => annotationNamesRef.current.get(id) ?? id

  const clearSelection = (tools: StayTools) => {
    if (selectedRef.current) {
      tools.getChildById<Rectangle>(selectedRef.current)?.shape.update({
        strokeConfig: { color: colors.orange, lineWidth: 3 },
      })
    }
    selectedRef.current = null
    setSelected(text("None", "无"))
  }

  const listeners = useMemo<ListenerProps[]>(() => [
    {
      name: "draw-annotation",
      state: "draw",
      selector: ".stay-canvas",
      event: ["dragstart", "drag", "dragend"],
      callback: ({ e, composeStore, tools }) => {
        if (!hasPointerPosition(e)) return
        return {
          dragstart: () => {
            const index = ++sequenceRef.current
            const name = text(`Annotation ${index}`, `标注 ${index}`)
            const box = new Rectangle({
              x: e.x,
              y: e.y,
              width: 0,
              height: 0,
              layer: 1,
              fillConfig: { color: colors.orangeSoft },
              strokeConfig: { color: colors.orange, lineWidth: 3 },
            })
            const label = new StayText({
              x: e.x + 18,
              y: e.y + 8,
              text: `#${index}`,
              font: { size: 12, fontWeight: 700 },
              layer: 1,
              zIndex: 2,
              fillConfig: { color: colors.ink },
            })
            const child = tools.appendChild({
              className: "annotation",
              shape: [box, label],
            })
            annotationNamesRef.current.set(child.id, name)
            push(text(`${name} started`, `${name}已开始`))
            return { start: e.point, child, box, label }
          },
          drag: () => {
            const start = composeStore.start
            const x = Math.min(start.x, e.x)
            const y = Math.min(start.y, e.y)
            composeStore.box.update({
              x,
              y,
              width: Math.abs(e.x - start.x),
              height: Math.abs(e.y - start.y),
            })
            composeStore.label.update({ x: x + 18, y: y + 8 })
          },
          dragend: () => {
            tools.log()
            syncCount(tools)
            push(text(`${annotationName(composeStore.child.id)} committed to history`, `${annotationName(composeStore.child.id)}已写入历史`))
          },
        }
      },
    },
    {
      name: "select-annotation",
      state: "select",
      selector: ".stay-canvas",
      event: "click",
      callback: ({ e, tools }) => {
        if (!hasPointerPosition(e)) return
        const target = tools.getContainPointChildren<Rectangle>({
          point: e.point,
          selector: ".annotation",
          withRoot: false,
        })[0]
        clearSelection(tools)
        if (!target) {
          push(text("selection cleared", "已取消选择"))
          return
        }
        target.shape.update({ strokeConfig: { color: colors.blue, lineWidth: 5 } })
        selectedRef.current = target.id
        const name = annotationName(target.id)
        setSelected(name)
        push(text(`${name} selected`, `已选择${name}`))
      },
    },
    {
      name: "move-annotation",
      state: "select",
      selector: ".annotation",
      event: ["dragstart", "drag", "dragend"],
      callback: ({ e, composeStore, tools }) => {
        if (!hasPointerTarget(e)) return
        return {
          dragstart: () => {
            clearSelection(tools)
            e.target.moveInit()
            const shape = e.target.shape as Rectangle
            shape.update({ strokeConfig: { color: colors.blue, lineWidth: 5 } })
            selectedRef.current = e.target.id
            setSelected(annotationName(e.target.id))
            return { start: e.point, child: e.target }
          },
          drag: () => composeStore.child.move(e.x - composeStore.start.x, e.y - composeStore.start.y),
          dragend: () => {
            const child = composeStore.child
            const historyShapes = [...child.shapeMap.values()].map((shape) => shape.copy())
            const historyShape = historyShapes.find((shape) => shape instanceof Rectangle) as Rectangle
            historyShape.update({ strokeConfig: { color: colors.orange, lineWidth: 3 } })
            tools.removeChild(child.id)
            const replacement = tools.appendChild({
              id: child.id,
              className: child.className,
              shape: historyShapes,
            })
            tools.log()
            replacement.shape.update({ strokeConfig: { color: colors.blue, lineWidth: 5 } })
            push(text(`${annotationName(child.id)} moved and logged`, `${annotationName(child.id)}已移动并记录`))
          },
        }
      },
    },
  ], [text])

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
      push(text("background ready", "背景已就绪"))
    }
    image.src = createAnnotationImage(text("sample workspace", "示例工作区"))
  }

  const switchMode = (next: Mode) => {
    if (toolsRef.current) clearSelection(toolsRef.current)
    toolsRef.current?.switchState(next)
    toolsRef.current?.changeCursor(next === "draw" ? "crosshair" : "default")
    setMode(next)
    push(text(`mode: ${next}`, `模式：${next === "draw" ? "绘制" : "选择"}`))
  }

  const removeSelected = () => {
    const tools = toolsRef.current
    const id = selectedRef.current
    if (!tools || !id) return
    tools.removeChild(id)
    tools.log()
    selectedRef.current = null
    setSelected(text("None", "无"))
    syncCount(tools)
    push(text(`${annotationName(id)} removed`, `${annotationName(id)}已移除`))
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
    push(text("canvas captured", "Canvas 已截取"))
  }

  const navigateHistory = (direction: "undo" | "redo") => {
    const tools = toolsRef.current
    if (!tools) return
    clearSelection(tools)
    tools[direction]()
    requestAnimationFrame(() => syncCount(tools))
    push(direction === "undo" ? text("undo", "撤销") : text("redo", "重做"))
  }

  return (
    <DemoLayout>
      <CanvasCard title={text("Image annotation workspace", "图像标注工作区")} description={text("Each box has a stable number. Blue outlines show the current selection; click empty space to clear it.", "每个标注框都有稳定编号；蓝色描边表示当前选中，点击空白处可取消选择。")} wide>
        <StayCanvas className="demo-canvas" height={420} layers={2} listenerList={listeners} mounted={mounted} width={720} />
      </CanvasCard>
      <Toolbar>
        <Button active={mode === "draw"} onClick={() => switchMode("draw")}>{text("Draw", "绘制")}</Button>
        <Button active={mode === "select"} onClick={() => switchMode("select")}>{text("Select", "选择")}</Button>
        <Button disabled={!selectedRef.current} onClick={removeSelected}>{text("Delete selected", "删除所选")}</Button>
        <Button onClick={() => navigateHistory("undo")}>{text("Undo", "撤销")}</Button>
        <Button onClick={() => navigateHistory("redo")}>{text("Redo", "重做")}</Button>
        <Button onClick={() => { void toolsRef.current?.zoom(-100, { x: 360, y: 210 }); push(text("zoom in", "放大")) }}>{text("Zoom in", "放大")}</Button>
        <Button onClick={() => { void toolsRef.current?.reset(); push(text("transform reset", "变换已重置")) }}>{text("Reset view", "重置视图")}</Button>
        <Button onClick={capture}>{text("Export image", "导出图像")}</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[[text("Mode", "模式"), mode === "draw" ? text("draw", "绘制") : text("select", "选择")], [text("Annotations", "标注"), count], [text("Selected", "已选择"), selected], [text("Export", "导出"), snapshot ? text("Ready", "已就绪") : text("Not captured", "未截取")]]} />
      <EventLog entries={entries} />
      {snapshot && <div className="snapshot-preview"><img alt={text("Exported annotation canvas", "已导出的标注 Canvas")} src={snapshot} /></div>}
    </DemoLayout>
  )
}

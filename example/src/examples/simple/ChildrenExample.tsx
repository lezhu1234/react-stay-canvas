import { useRef, useState } from "react"
import { Circle, Rectangle, StayCanvas, StayText, StayTools } from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, placeSceneChild, ResetButton, StatusGrid, Toolbar } from "../../components/DemoKit"
import { useI18n } from "../../i18n"

export default function ChildrenExample() {
  const { text } = useI18n()
  const toolsRef = useRef<StayTools | null>(null)
  const groupRef = useRef<ReturnType<StayTools["appendChild"]> | null>(null)
  const createdIds = useRef<string[]>([])
  const sequenceRef = useRef(0)
  const childNamesRef = useRef(new Map<string, string>())
  const [count, setCount] = useState(0)
  const [lastAction, setLastAction] = useState(text("Mounted", "已挂载"))

  const updateCount = () => setCount(toolsRef.current?.getChildrenWithoutRoot().length ?? 0)

  const mounted = (tools: StayTools) => {
    toolsRef.current = tools
    groupRef.current = placeSceneChild(tools, tools.appendChild({
      id: "multi-shape-child",
      className: "group",
      shape: [
        new Rectangle({
          x: 52,
          y: 52,
          width: 180,
          height: 106,
          fillConfig: { color: colors.blueSoft },
          strokeConfig: { color: colors.blue, lineWidth: 2 },
        }),
        new StayText({
          x: 142,
          y: 91,
          text: text("one Child", "一个 Child"),
          textAlign: "center",
          textBaseline: "top",
          font: { size: 17, fontWeight: 650 },
          fillConfig: { color: colors.ink },
        }),
      ],
    }))
    requestAnimationFrame(updateCount)
  }

  const addChild = () => {
    const tools = toolsRef.current
    if (!tools) return
    const index = createdIds.current.length
    const sequence = ++sequenceRef.current
    const name = text(`Child ${sequence}`, `Child ${sequence}`)
    const child = placeSceneChild(tools, tools.appendChild({
      className: "badge",
      shape: [
        new Circle({
          x: 292 + (index % 3) * 42,
          y: 74 + Math.floor(index / 3) * 50,
          radius: 16,
          fillConfig: { color: index % 2 ? colors.green : colors.orange },
        }),
        new StayText({
          x: 292 + (index % 3) * 42,
          y: 68 + Math.floor(index / 3) * 50,
          text: String(sequence),
          textAlign: "center",
          textBaseline: "top",
          font: { size: 11, fontWeight: 700 },
          fillConfig: { color: colors.paper },
        }),
      ],
    }))
    createdIds.current.push(child.id)
    childNamesRef.current.set(child.id, name)
    setLastAction(text(`${name} appended`, `已添加 ${name}`))
    updateCount()
  }

  const moveGroup = () => {
    const group = groupRef.current
    if (!group) return
    group.shapeMap.forEach((shape) => shape.move(18, 10))
    setLastAction(text("Updated every Shape in the group", "已更新组内所有 Shape"))
  }

  const removeLast = () => {
    const id = createdIds.current.pop()
    if (!id || !toolsRef.current) return
    toolsRef.current.removeChild(id)
    const name = childNamesRef.current.get(id) ?? id
    setLastAction(text(`${name} removed`, `已移除 ${name}`))
    updateCount()
  }

  return (
    <DemoLayout>
      <CanvasCard title={text("Child lifecycle", "Child 生命周期")} description={text("The blue panel and its label belong to one multi-shape Child.", "蓝色面板及其文字属于同一个多图形 Child。")} wide>
        <StayCanvas className="demo-canvas" height={250} mounted={mounted} width={440} />
      </CanvasCard>
      <Toolbar>
        <Button onClick={addChild}>{text("Append Child", "添加 Child")}</Button>
        <Button onClick={moveGroup}>{text("Update group", "更新组")}</Button>
        <Button disabled={createdIds.current.length === 0} onClick={removeLast}>{text("Remove last", "移除最后一项")}</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[["Children", count], [text("Group shapes", "组内图形"), groupRef.current?.shapeMap.size ?? 0], [text("Last action", "最近操作"), lastAction]]} />
    </DemoLayout>
  )
}

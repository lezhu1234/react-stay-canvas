import { useRef, useState } from "react"
import { Circle, Rectangle, StayCanvas, StayText, StayTools } from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, ResetButton, StatusGrid, Toolbar } from "../../components/DemoKit"

export default function ChildrenExample() {
  const toolsRef = useRef<StayTools | null>(null)
  const groupRef = useRef<ReturnType<StayTools["appendChild"]> | null>(null)
  const createdIds = useRef<string[]>([])
  const [count, setCount] = useState(0)
  const [lastAction, setLastAction] = useState("Mounted")

  const updateCount = () => setCount(toolsRef.current?.getChildrenWithoutRoot().length ?? 0)

  const mounted = (tools: StayTools) => {
    toolsRef.current = tools
    groupRef.current = tools.appendChild({
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
          text: "one Child",
          font: { size: 17, fontWeight: 650 },
          fillConfig: { color: colors.ink },
        }),
      ],
    })
    requestAnimationFrame(updateCount)
  }

  const addChild = () => {
    const tools = toolsRef.current
    if (!tools) return
    const index = createdIds.current.length
    const child = tools.appendChild({
      className: "badge",
      shape: new Circle({
        x: 292 + (index % 3) * 42,
        y: 74 + Math.floor(index / 3) * 50,
        radius: 16,
        fillConfig: { color: index % 2 ? colors.green : colors.orange },
      }),
    })
    createdIds.current.push(child.id)
    setLastAction(`Appended ${child.id.slice(0, 8)}`)
    updateCount()
  }

  const moveGroup = () => {
    const group = groupRef.current
    if (!group) return
    group.shapeMap.forEach((shape) => shape.move(18, 10))
    setLastAction("Updated every Shape in the group")
  }

  const removeLast = () => {
    const id = createdIds.current.pop()
    if (!id || !toolsRef.current) return
    toolsRef.current.removeChild(id)
    setLastAction(`Removed ${id.slice(0, 8)}`)
    updateCount()
  }

  return (
    <DemoLayout>
      <CanvasCard title="Child lifecycle" description="The blue panel and its label belong to one multi-shape Child." wide>
        <StayCanvas className="demo-canvas" height={250} mounted={mounted} width={440} />
      </CanvasCard>
      <Toolbar>
        <Button onClick={addChild}>Append Child</Button>
        <Button onClick={moveGroup}>Update group</Button>
        <Button disabled={createdIds.current.length === 0} onClick={removeLast}>Remove last</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[["Children", count], ["Group shapes", groupRef.current?.shapeMap.size ?? 0], ["Last action", lastAction]]} />
    </DemoLayout>
  )
}

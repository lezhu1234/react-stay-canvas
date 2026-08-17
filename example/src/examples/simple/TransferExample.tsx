import { type MutableRefObject, useRef, useState } from "react"
import { Circle, Rectangle, StayCanvas, StayText, StayTools } from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, ResetButton, StatusGrid, Toolbar } from "../../components/DemoKit"

export default function TransferExample() {
  const sourceRef = useRef<StayTools | null>(null)
  const targetRef = useRef<StayTools | null>(null)
  const sourceShifted = useRef(false)
  const targetShifted = useRef(false)
  const [targetCount, setTargetCount] = useState(0)
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const [mutation, setMutation] = useState("None")

  const mountSource = (tools: StayTools) => {
    sourceRef.current = tools
    tools.appendChild({ className: "asset", shape: new Rectangle({ x: 46, y: 46, width: 110, height: 88, fillConfig: { color: colors.blueSoft }, strokeConfig: { color: colors.blue, lineWidth: 2 } }) })
    tools.appendChild({ className: "asset", shape: new Circle({ x: 246, y: 92, radius: 44, fillConfig: { color: colors.orangeSoft }, strokeConfig: { color: colors.orange, lineWidth: 2 } }) })
    tools.appendChild({ className: "asset", shape: new StayText({ x: 180, y: 172, text: "portable scene", font: { size: 17, fontWeight: 650 }, fillConfig: { color: colors.ink } }) })
  }

  const transfer = () => {
    const source = sourceRef.current
    const target = targetRef.current
    if (!source || !target) return
    const exported = source.exportChildren({
      children: source.getChildrenBySelector(".asset"),
      area: { x: 0, y: 0, width: 360, height: 220 },
    })
    target.importChildren(exported)
    setTargetCount(target.getChildrenWithoutRoot().length)
  }

  const capture = async () => {
    const tools = sourceRef.current
    if (!tools) return
    const canvas = await tools.regionToTargetCanvas({
      area: { x: 0, y: 0, width: 360, height: 220 },
      targetSize: { width: 360, height: 220 },
      children: tools.getChildrenWithoutRoot(),
    })
    setSnapshot(canvas.toDataURL("image/png"))
  }

  const moveFirstAsset = (
    tools: StayTools | null,
    shifted: MutableRefObject<boolean>,
    label: string,
  ) => {
    const child = tools?.getChildBySelector<Rectangle>(".asset")
    if (!child) return
    shifted.current = !shifted.current
    child.shape.update({ x: shifted.current ? 72 : 46 })
    setMutation(label)
  }

  return (
    <DemoLayout>
      <div className="dual-canvas">
        <CanvasCard title="Source" description="Three Children are exported as one scene.">
          <StayCanvas className="demo-canvas" height={220} mounted={mountSource} width={360} />
        </CanvasCard>
        <CanvasCard title="Target" description="Import creates independent Child copies.">
          <StayCanvas className="demo-canvas" height={220} mounted={(tools) => { targetRef.current = tools }} width={360} />
        </CanvasCard>
      </div>
      <Toolbar>
        <Button onClick={transfer}>Transfer scene</Button>
        <Button onClick={() => moveFirstAsset(sourceRef.current, sourceShifted, "Source moved")}>Move source asset</Button>
        <Button disabled={targetCount === 0} onClick={() => moveFirstAsset(targetRef.current, targetShifted, "Target moved")}>Move target copy</Button>
        <Button onClick={capture}>Capture region</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[["Source children", 3], ["Target children", targetCount], ["Last mutation", mutation], ["Snapshot", snapshot ? "Ready" : "Not captured"]]} />
      {snapshot && <div className="snapshot-preview"><img alt="Canvas region snapshot" src={snapshot} /></div>}
    </DemoLayout>
  )
}

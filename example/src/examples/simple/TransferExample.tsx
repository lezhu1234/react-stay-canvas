import { type MutableRefObject, useRef, useState } from "react"
import { Circle, Rectangle, StayCanvas, StayText, StayTools } from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, ResetButton, StatusGrid, Toolbar } from "../../components/DemoKit"
import { useI18n } from "../../i18n"

export default function TransferExample() {
  const { text } = useI18n()
  const sourceRef = useRef<StayTools | null>(null)
  const targetRef = useRef<StayTools | null>(null)
  const sourceShifted = useRef(false)
  const targetShifted = useRef(false)
  const [targetCount, setTargetCount] = useState(0)
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const [mutation, setMutation] = useState(text("None", "无"))

  const mountSource = (tools: StayTools) => {
    sourceRef.current = tools
    tools.appendChild({ className: "asset", shape: new Rectangle({ x: 46, y: 46, width: 110, height: 88, fillConfig: { color: colors.blueSoft }, strokeConfig: { color: colors.blue, lineWidth: 2 } }) })
    tools.appendChild({ className: "asset", shape: new Circle({ x: 246, y: 92, radius: 44, fillConfig: { color: colors.orangeSoft }, strokeConfig: { color: colors.orange, lineWidth: 2 } }) })
    tools.appendChild({ className: "asset", shape: new StayText({ x: 180, y: 172, text: text("portable scene", "可移植场景"), font: { size: 17, fontWeight: 650 }, fillConfig: { color: colors.ink } }) })
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
        <CanvasCard title={text("Source", "源 Canvas")} description={text("Three Children are exported as one scene.", "三个 Children 导出为一个场景。") }>
          <StayCanvas className="demo-canvas" height={220} mounted={mountSource} width={360} />
        </CanvasCard>
        <CanvasCard title={text("Target", "目标 Canvas")} description={text("Import creates independent Child copies.", "导入会创建相互独立的 Child 副本。") }>
          <StayCanvas className="demo-canvas" height={220} mounted={(tools) => { targetRef.current = tools }} width={360} />
        </CanvasCard>
      </div>
      <Toolbar>
        <Button onClick={transfer}>{text("Transfer scene", "复制场景")}</Button>
        <Button onClick={() => moveFirstAsset(sourceRef.current, sourceShifted, text("Source moved", "已移动源图形"))}>{text("Move source asset", "移动源图形")}</Button>
        <Button disabled={targetCount === 0} onClick={() => moveFirstAsset(targetRef.current, targetShifted, text("Target moved", "目标副本已移动"))}>{text("Move target copy", "移动目标副本")}</Button>
        <Button onClick={capture}>{text("Capture region", "截取区域")}</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[[text("Source children", "源 Children"), 3], [text("Target children", "目标 Children"), targetCount], [text("Last mutation", "最近变更"), mutation], [text("Snapshot", "快照"), snapshot ? text("Ready", "已就绪") : text("Not captured", "未截取")]]} />
      {snapshot && <div className="snapshot-preview"><img alt={text("Canvas region snapshot", "Canvas 区域快照")} src={snapshot} /></div>}
    </DemoLayout>
  )
}

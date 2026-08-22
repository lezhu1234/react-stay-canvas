import { type MutableRefObject, useRef, useState } from "react"
import { Circle, Rectangle, StayCanvas, StayText, StayTools } from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, ResetButton, StatusGrid, Toolbar } from "../../components/DemoKit"
import { useI18n } from "../../i18n"

type Child = ReturnType<StayTools["appendChild"]>

export default function TransferExample() {
  const { text } = useI18n()
  const sourceRef = useRef<StayTools | null>(null)
  const targetRef = useRef<StayTools | null>(null)
  const sourceShifted = useRef(false)
  const latestTargetShifted = useRef(false)
  const latestTargetARef = useRef<Child | null>(null)
  const latestCopyNumberRef = useRef(0)
  const importSequenceRef = useRef(0)
  const [targetCount, setTargetCount] = useState(0)
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const [mutation, setMutation] = useState(text("None", "无"))

  const mountSource = (tools: StayTools) => {
    sourceRef.current = tools
    tools.appendChild({
      id: "asset-a",
      className: "asset",
      shape: [
        new Rectangle({ x: 46, y: 46, width: 110, height: 88, fillConfig: { color: colors.blueSoft }, strokeConfig: { color: colors.blue, lineWidth: 2 } }),
        new StayText({ x: 101, y: 81, text: text("A · movable", "A · 可移动"), font: { size: 12, fontWeight: 700 }, fillConfig: { color: colors.ink } }),
      ],
    })
    tools.appendChild({
      id: "asset-b",
      className: "asset",
      shape: [
        new Circle({ x: 246, y: 92, radius: 44, fillConfig: { color: colors.orangeSoft }, strokeConfig: { color: colors.orange, lineWidth: 2 } }),
        new StayText({ x: 246, y: 84, text: "B", font: { size: 14, fontWeight: 700 }, fillConfig: { color: colors.ink } }),
      ],
    })
    tools.appendChild({ id: "asset-caption", className: "asset", shape: new StayText({ x: 180, y: 172, text: text("portable scene", "可移植场景"), font: { size: 17, fontWeight: 650 }, fillConfig: { color: colors.ink } }) })
  }

  const transfer = () => {
    const source = sourceRef.current
    const target = targetRef.current
    if (!source || !target) return
    const exported = source.exportChildren({
      children: source.getChildrenBySelector(".asset"),
      area: { x: 0, y: 0, width: 360, height: 220 },
    })
    const importIndex = importSequenceRef.current++
    const copyNumber = importIndex + 1
    const existingIds = new Set(target.getChildrenWithoutRoot().map((child) => child.id))
    target.importChildren(exported, {
      x: importIndex * 12,
      y: importIndex * 10,
      width: 360,
      height: 220,
    })
    const imported = target.getChildrenWithoutRoot().filter((child) => !existingIds.has(child.id))
    const copyLabels = [
      text(`A · Copy ${copyNumber}`, `A · 副本 ${copyNumber}`),
      text(`B · Copy ${copyNumber}`, `B · 副本 ${copyNumber}`),
      text(`Scene copy ${copyNumber}`, `场景副本 ${copyNumber}`),
    ]
    imported.forEach((child, index) => {
      const label = [...child.shapeMap.values()].find((shape) => shape instanceof StayText) as StayText | undefined
      label?.update({ text: copyLabels[index] })
    })
    latestTargetARef.current = imported[0] ?? null
    latestTargetShifted.current = false
    latestCopyNumberRef.current = copyNumber
    setTargetCount(target.getChildrenWithoutRoot().length)
    setMutation(text(`Scene copy ${copyNumber} imported`, `已导入场景副本 ${copyNumber}`))
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
    setMutation(text("Source region captured", "已截取源 Canvas"))
  }

  const moveAsset = (
    child: Child | null | undefined | void,
    shifted: MutableRefObject<boolean>,
    label: string,
  ) => {
    if (!child) return
    shifted.current = !shifted.current
    child.moveInit()
    child.move(shifted.current ? 26 : -26, 0)
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
        <Button onClick={() => moveAsset(sourceRef.current?.getChildById("asset-a"), sourceShifted, text("Source asset A moved", "已移动源对象 A"))}>{text("Move source asset A", "移动源对象 A")}</Button>
        <Button disabled={targetCount === 0} onClick={() => moveAsset(latestTargetARef.current, latestTargetShifted, text(`Scene copy ${latestCopyNumberRef.current} · A moved`, `场景副本 ${latestCopyNumberRef.current} · A 已移动`))}>{text("Move latest copy A", "移动最新副本 A")}</Button>
        <Button onClick={capture}>{text("Capture region", "截取区域")}</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[[text("Source children", "源 Children"), 3], [text("Target children", "目标 Children"), targetCount], [text("Last mutation", "最近变更"), mutation], [text("Snapshot", "快照"), snapshot ? text("Ready", "已就绪") : text("Not captured", "未截取")]]} />
      {snapshot && <div className="snapshot-preview"><img alt={text("Canvas region snapshot", "Canvas 区域快照")} src={snapshot} /></div>}
    </DemoLayout>
  )
}

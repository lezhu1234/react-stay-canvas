import { useRef, useState } from "react"
import { Line, Rectangle, StayCanvas, StayShapeTransitionConfig, StayText, StayTools } from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, EventLog, ResetButton, StatusGrid, TimelineControls, Toolbar } from "../../components/DemoKit"
import { useI18n } from "../../i18n"

const duration = 2200
type AnimatedLineProps = ConstructorParameters<typeof Line>[0] & {
  transition: StayShapeTransitionConfig
}
const animatedLine = (props: AnimatedLineProps) => new Line(props)

export default function MotionStudioExample() {
  const { text } = useI18n()
  const toolsRef = useRef<StayTools | null>(null)
  const guideIds = useRef<string[]>([])
  const [range, setRange] = useState<"full" | "middle">("full")
  const [uiTime, setUiTime] = useState(0)
  const [effectiveTime, setEffectiveTime] = useState(0)
  const [guides, setGuides] = useState(0)
  const [entries, setEntries] = useState<string[]>([])
  const push = (message: string) => setEntries((current) => [message, ...current].slice(0, 8))

  const mounted = (tools: StayTools) => {
    toolsRef.current = tools
    tools.appendChild({
      className: "stage-grid",
      shape: new Rectangle({ x: 18, y: 18, width: 684, height: 364, layer: 0, fillConfig: { color: colors.graySoft }, strokeConfig: { color: colors.gray, lineWidth: 1 } }),
    })

    const panel = tools.createChild({ className: "motion-panel" })
    panel.appendKeyFrame("panel", new Rectangle({ x: 54, y: 112, width: 130, height: 112, layer: 1, fillConfig: { color: colors.blueSoft }, strokeConfig: { color: colors.blue, lineWidth: 3 }, transition: { durationMs: 500, type: "easeOutCubic" } }))
    panel.appendKeyFrame("panel", new Rectangle({ x: 286, y: 68, width: 150, height: 180, layer: 1, fillConfig: { color: colors.greenSoft }, strokeConfig: { color: colors.green, lineWidth: 3 }, transition: { durationMs: 800, delayMs: 120, type: "easeInOutBack" } }))
    panel.appendKeyFrame("panel", new Rectangle({ x: 534, y: 126, width: 120, height: 92, layer: 1, fillConfig: { color: colors.orangeSoft }, strokeConfig: { color: colors.orange, lineWidth: 3 }, transition: { durationMs: 780, type: "easeOutBounce" } }))

    const connector = tools.createChild({ className: "motion-line" })
    connector.appendKeyFrame("line", animatedLine({ x1: 56, y1: 300, x2: 150, y2: 300, layer: 2, strokeConfig: { color: colors.blue, lineWidth: 4, lineCap: "round" }, transition: { durationMs: 500 } }))
    connector.appendKeyFrame("line", animatedLine({ x1: 56, y1: 300, x2: 410, y2: 300, layer: 2, strokeConfig: { color: colors.green, lineWidth: 4, lineCap: "round" }, transition: { durationMs: 800, delayMs: 120 } }))
    connector.appendKeyFrame("line", animatedLine({ x1: 56, y1: 300, x2: 660, y2: 300, layer: 2, strokeConfig: { color: colors.orange, lineWidth: 4, lineCap: "round" }, transition: { durationMs: 780 } }))

    const caption = tools.createChild({ className: "motion-caption" })
    caption.appendKeyFrame("text", new StayText({ x: 116, y: 40, text: text("Start", "开始"), font: { size: 20, fontWeight: 700 }, layer: 2, fillConfig: { color: colors.blue }, transition: { durationMs: 500 } }))
    caption.appendKeyFrame("text", new StayText({ x: 360, y: 40, text: text("Compose", "编排"), font: { size: 28, fontWeight: 700 }, layer: 2, fillConfig: { color: colors.green }, transition: { durationMs: 800, delayMs: 120 } }))
    caption.appendKeyFrame("text", new StayText({ x: 594, y: 40, text: text("Deliver", "交付"), font: { size: 20, fontWeight: 700 }, layer: 2, fillConfig: { color: colors.orange }, transition: { durationMs: 780 } }))
    tools.progress({ timeMs: 0 })
    tools.log()
  }

  const seek = (nextUiTime: number, nextRange = range) => {
    const tools = toolsRef.current
    if (!tools) return
    setUiTime(Math.round(nextUiTime))
    if (nextRange === "full") {
      setEffectiveTime(Math.round(nextUiTime))
      tools.progress({ timeMs: nextUiTime })
      return
    }
    const beforeMs = 480
    const afterMs = 1740
    const timeMs = beforeMs + (nextUiTime / duration) * (afterMs - beforeMs)
    setEffectiveTime(Math.round(timeMs))
    tools.progress({ timeMs, bound: { beforeMs, afterMs } })
  }

  const switchRange = (nextRange: "full" | "middle") => {
    setRange(nextRange)
    seek(uiTime, nextRange)
    push(nextRange === "full"
      ? text("full playback range selected", "已切换到完整区间")
      : text("middle playback range selected", "已切换到限定区间"))
  }

  const addGuide = () => {
    const tools = toolsRef.current
    if (!tools) return
    const index = guideIds.current.length
    const guide = tools.appendChild({
      className: "guide",
      shape: new Rectangle({ x: 40 + index * 18, y: 340 - index * 10, width: 80, height: 22, layer: 2, fillConfig: { color: colors.orangeSoft }, strokeConfig: { color: colors.orange, lineWidth: 1 } }),
    })
    guideIds.current.push(guide.id)
    tools.log()
    setGuides(tools.getChildrenBySelector(".guide").length)
    push(text("static guide added and logged", "已添加参考线并写入历史"))
  }

  const undoGuide = () => {
    if (guides === 0) return
    toolsRef.current?.undo()
    guideIds.current.pop()
    requestAnimationFrame(() => setGuides(toolsRef.current?.getChildrenBySelector(".guide").length ?? 0))
    push(text("undo changed static history only", "已撤销一条参考线，动画不受影响"))
  }

  return (
    <DemoLayout>
      <CanvasCard title={text("Motion composition studio", "动效编排工作室")} description={text("Three animated tracks share one explicit clock while static guides use normal history.", "三条动画轨道使用同一进度，静态参考线则可以单独撤销。")} wide>
        <StayCanvas className="demo-canvas" height={400} layers={3} mounted={mounted} width={720} />
      </CanvasCard>
      <TimelineControls duration={duration} label={range === "full" ? text("Full timeline", "完整时间线") : text("Middle sub-range", "中间子区间")} onSeek={seek} />
      <Toolbar>
        <Button active={range === "full"} onClick={() => switchRange("full")}>{text("Full range", "完整区间")}</Button>
        <Button active={range === "middle"} onClick={() => switchRange("middle")}>{text("Bound range", "限定区间")}</Button>
        <Button onClick={addGuide}>{text("Add static guide", "添加静态参考线")}</Button>
        <Button disabled={guides === 0} onClick={undoGuide}>{text("Undo static guide", "撤销静态参考线")}</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[
        [text("UI time", "滑块时间"), `${uiTime} ms`],
        [text("Effective time", "实际时间"), `${effectiveTime} ms`],
        [text("Playback range", "播放区间"), range === "full" ? text("full", "完整") : text("middle", "限定")],
        [text("Animated tracks", "动画轨道"), 3],
        [text("Static guides", "静态参考线"), guides],
        [text("History rule", "撤销范围"), text("Animated tracks excluded", "仅静态内容")],
      ]} />
      <EventLog entries={entries} />
    </DemoLayout>
  )
}

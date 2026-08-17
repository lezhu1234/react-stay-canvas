import { useRef } from "react"
import { Line, Rectangle, StayCanvas, StayShapeTransitionConfig, StayText, StayTools } from "react-stay-canvas"

import { CanvasCard, colors, DemoLayout, ResetButton, StatusGrid, TimelineControls, Toolbar } from "../../components/DemoKit"
import { useI18n } from "../../i18n"

const duration = 1600
type AnimatedLineProps = ConstructorParameters<typeof Line>[0] & {
  transition: StayShapeTransitionConfig
}
const animatedLine = (props: AnimatedLineProps) => new Line(props)

export default function TimelineExample() {
  const { text } = useI18n()
  const toolsRef = useRef<StayTools | null>(null)

  const mounted = (tools: StayTools) => {
    toolsRef.current = tools
    const card = tools.createChild({ id: "animated-card", className: "animated" })
    card.appendKeyFrame("card", new Rectangle({
      x: 32, y: 94, width: 90, height: 70,
      fillConfig: { color: colors.blueSoft }, strokeConfig: { color: colors.blue, lineWidth: 3 },
      transition: { durationMs: 400, type: "easeOutCubic" },
    }))
    card.appendKeyFrame("card", new Rectangle({
      x: 176, y: 52, width: 112, height: 112,
      fillConfig: { color: colors.greenSoft }, strokeConfig: { color: colors.green, lineWidth: 3 },
      transition: { durationMs: 600, delayMs: 120, type: "easeInOutBack" },
    }))
    card.appendKeyFrame("card", new Rectangle({
      x: 322, y: 104, width: 78, height: 58,
      fillConfig: { color: colors.orangeSoft }, strokeConfig: { color: colors.orange, lineWidth: 3 },
      transition: { durationMs: 480, type: "easeOutBounce" },
    }))

    const trace = tools.createChild({ className: "animated-trace" })
    trace.appendKeyFrame("line", animatedLine({ x1: 28, y1: 210, x2: 90, y2: 210, strokeConfig: { color: colors.gray, lineWidth: 3 }, transition: { durationMs: 400 } }))
    trace.appendKeyFrame("line", animatedLine({ x1: 28, y1: 210, x2: 260, y2: 210, strokeConfig: { color: colors.blue, lineWidth: 3 }, transition: { durationMs: 600, delayMs: 120 } }))
    trace.appendKeyFrame("line", animatedLine({ x1: 28, y1: 210, x2: 410, y2: 210, strokeConfig: { color: colors.orange, lineWidth: 3 }, transition: { durationMs: 480 } }))

    tools.appendChild({ className: "timeline-label", shape: new StayText({ x: 220, y: 244, text: text("explicit seek with tools.progress", "拖动时间线会调用 tools.progress"), font: { size: 14 }, fillConfig: { color: colors.ink } }) })
    tools.progress({ timeMs: 0 })
  }

  return (
    <DemoLayout>
      <CanvasCard title={text("Keyframe timeline", "关键帧时间线")} description={text("The library interpolates geometry, color, delay, and easing at an explicit time.", "拖动时间线，查看位置、颜色、延迟和缓动如何随时间变化。")} wide>
        <StayCanvas className="demo-canvas" height={280} layers={2} mounted={mounted} width={440} />
      </CanvasCard>
      <TimelineControls duration={duration} onSeek={(time) => toolsRef.current?.progress({ timeMs: time })} />
      <Toolbar><ResetButton /></Toolbar>
      <StatusGrid items={[[text("Duration", "时长"), `${duration} ms`], [text("Animated children", "动画 Child"), 2], [text("Clock", "进度来源"), "progress()"]]} />
    </DemoLayout>
  )
}

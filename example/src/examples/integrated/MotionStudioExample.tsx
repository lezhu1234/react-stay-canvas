import { useRef, useState } from "react"
import { Line, Rectangle, StayCanvas, StayShapeTransitionConfig, StayText, StayTools } from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, EventLog, ResetButton, StatusGrid, TimelineControls, Toolbar } from "../../components/DemoKit"

const duration = 2200
type AnimatedLineProps = ConstructorParameters<typeof Line>[0] & {
  transition: StayShapeTransitionConfig
}
const animatedLine = (props: AnimatedLineProps) => new Line(props)

export default function MotionStudioExample() {
  const toolsRef = useRef<StayTools | null>(null)
  const guideIds = useRef<string[]>([])
  const [range, setRange] = useState<"full" | "middle">("full")
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
    caption.appendKeyFrame("text", new StayText({ x: 116, y: 40, text: "Start", font: { size: 20, fontWeight: 700 }, layer: 2, fillConfig: { color: colors.blue }, transition: { durationMs: 500 } }))
    caption.appendKeyFrame("text", new StayText({ x: 360, y: 40, text: "Compose", font: { size: 28, fontWeight: 700 }, layer: 2, fillConfig: { color: colors.green }, transition: { durationMs: 800, delayMs: 120 } }))
    caption.appendKeyFrame("text", new StayText({ x: 594, y: 40, text: "Deliver", font: { size: 20, fontWeight: 700 }, layer: 2, fillConfig: { color: colors.orange }, transition: { durationMs: 780 } }))
    tools.progress({ timeMs: 0 })
    tools.log()
  }

  const seek = (uiTime: number) => {
    const tools = toolsRef.current
    if (!tools) return
    if (range === "full") {
      tools.progress({ timeMs: uiTime })
      return
    }
    const beforeMs = 480
    const afterMs = 1740
    const timeMs = beforeMs + (uiTime / duration) * (afterMs - beforeMs)
    tools.progress({ timeMs, bound: { beforeMs, afterMs } })
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
    push("static guide added and logged")
  }

  const undoGuide = () => {
    if (guides === 0) return
    toolsRef.current?.undo()
    guideIds.current.pop()
    requestAnimationFrame(() => setGuides(toolsRef.current?.getChildrenBySelector(".guide").length ?? 0))
    push("undo changed static history only")
  }

  return (
    <DemoLayout>
      <CanvasCard title="Motion composition studio" description="Three animated tracks share one explicit clock while static guides use normal history." wide>
        <StayCanvas className="demo-canvas" height={400} layers={3} mounted={mounted} width={720} />
      </CanvasCard>
      <TimelineControls duration={duration} label={range === "full" ? "Full timeline" : "Middle sub-range"} onSeek={seek} />
      <Toolbar>
        <Button active={range === "full"} onClick={() => setRange("full")}>Full range</Button>
        <Button active={range === "middle"} onClick={() => setRange("middle")}>Bound range</Button>
        <Button onClick={addGuide}>Add static guide</Button>
        <Button disabled={guides === 0} onClick={undoGuide}>Undo static guide</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[["Animated tracks", 3], ["Playback range", range], ["Static guides", guides], ["History rule", "Animated tracks excluded"]]} />
      <EventLog entries={entries} />
    </DemoLayout>
  )
}

import {
  Children,
  cloneElement,
  isValidElement,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

import { type StayCanvasProps, type StayTools } from "react-stay-canvas"

import { useI18n } from "../i18n"

export function DemoLayout({ children }: { children: ReactNode }) {
  const [primary, ...controls] = Children.toArray(children)
  const { text } = useI18n()

  return (
    <div className="demo-layout">
      <div className="demo-primary">{primary}</div>
      {controls.length > 0 && (
        <aside className="demo-controls" aria-label={text("Example controls", "示例控制区")}>
          {controls.map((control, index) => (
            <div className="demo-control-panel" key={index}>{control}</div>
          ))}
        </aside>
      )}
    </div>
  )
}

type CanvasScenePlacement = {
  offsetX: number
  offsetY: number
}

type CanvasChild = ReturnType<StayTools["appendChild"]>

const scenePlacementByTools = new WeakMap<StayTools, CanvasScenePlacement>()
const placedSceneChildren = new WeakSet<CanvasChild>()

function useInitialViewportSize(viewportRef: RefObject<HTMLDivElement>) {
  const [size, setSize] = useState<{ height: number; width: number }>()

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    setSize({
      height: Math.max(1, Math.floor(viewport.clientHeight)),
      width: Math.max(1, Math.floor(viewport.clientWidth)),
    })
  }, [viewportRef])

  return size
}

function getScenePlacement(tools: StayTools) {
  return scenePlacementByTools.get(tools) ?? { offsetX: 0, offsetY: 0 }
}

export function scenePoint(tools: StayTools, x: number, y: number) {
  const { offsetX, offsetY } = getScenePlacement(tools)
  return { x: x + offsetX, y: y + offsetY }
}

export function sceneArea(tools: StayTools, width: number, height: number) {
  const { offsetX, offsetY } = getScenePlacement(tools)
  return { x: offsetX, y: offsetY, width, height }
}

export function sceneCanvasArea(tools: StayTools, sceneWidth: number, sceneHeight: number) {
  const { offsetX, offsetY } = getScenePlacement(tools)
  return {
    x: 0,
    y: 0,
    width: sceneWidth + offsetX * 2,
    height: sceneHeight + offsetY * 2,
  }
}

export function sceneLine(
  tools: StayTools,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const start = scenePoint(tools, x1, y1)
  const end = scenePoint(tools, x2, y2)
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y }
}

export function placeSceneChild<T extends CanvasChild>(tools: StayTools, child: T): T {
  if (placedSceneChildren.has(child)) return child
  placedSceneChildren.add(child)
  const { offsetX, offsetY } = getScenePlacement(tools)
  if (offsetX === 0 && offsetY === 0) return child
  child.moveInit()
  child.move(offsetX, offsetY)
  return child
}

export function resetScene(tools: StayTools) {
  // reset() consumes the current move baseline; capture it after the latest pan.
  tools.moveStart()
  return tools.reset()
}

function mountPlacedScene(
  tools: StayTools,
  placement: CanvasScenePlacement,
  mounted?: StayCanvasProps["mounted"],
) {
  scenePlacementByTools.set(tools, placement)
  mounted?.(tools)
}

export function CanvasCard({
  title,
  description,
  children,
  wide = false,
  className,
  viewportLabel,
  canvasDisplayScale = 1,
}: {
  title: string
  description?: string
  children: ReactNode
  wide?: boolean
  className?: string
  viewportLabel?: string
  canvasDisplayScale?: number
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const viewportSize = useInitialViewportSize(viewportRef)
  const displayScale = Number.isFinite(canvasDisplayScale) && canvasDisplayScale > 0
    ? canvasDisplayScale
    : 1
  const canvasFrame: { element: ReactNode; height?: number; width?: number } | null =
    isValidElement<StayCanvasProps>(children) && viewportSize
    ? (() => {
        const sceneWidth = children.props.width ?? 500
        const sceneHeight = children.props.height ?? 500
        const width = Math.max(sceneWidth, viewportSize.width)
        const height = Math.max(sceneHeight, viewportSize.height)
        const placement = {
          offsetX: Math.max(0, (width - sceneWidth) / 2),
          offsetY: Math.max(0, (height - sceneHeight) / 2),
        }

        return {
          element: cloneElement(children, {
            height,
            mounted: (tools) => mountPlacedScene(tools, placement, children.props.mounted),
            width,
          }),
          height,
          width,
        }
      })()
    : isValidElement<StayCanvasProps>(children)
      ? null
      : { element: children }
  const canvas = canvasFrame && displayScale !== 1 && canvasFrame.width && canvasFrame.height
    ? (
        <div
          className="canvas-display-transform"
          data-display-scale={displayScale}
          style={{
            height: canvasFrame.height,
            transform: `scale(${displayScale})`,
            width: canvasFrame.width,
          }}
        >
          {canvasFrame.element}
        </div>
      )
    : canvasFrame?.element

  return (
    <section className={["canvas-card", wide ? "wide" : "", className ?? ""].filter(Boolean).join(" ")}>
      <div className="canvas-card-heading">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      <div className="canvas-viewport" ref={viewportRef}>
        {viewportLabel && (
          <span
            className="canvas-viewport-label"
            style={displayScale === 1 ? undefined : {
              left: `calc(${displayScale * 100}% - 10px)`,
              right: "auto",
              transform: "translateX(-100%)",
            }}
          >
            {viewportLabel}
          </span>
        )}
        {canvas}
      </div>
    </section>
  )
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>
}

export function Button({
  children,
  onClick,
  active = false,
  disabled = false,
}: {
  children: ReactNode
  onClick: () => void
  active?: boolean
  disabled?: boolean
}) {
  return (
    <button className={active ? "control-button active" : "control-button"} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

export function ResetButton() {
  const { text } = useI18n()
  return <Button onClick={() => window.location.reload()}>{text("Reset", "重置")}</Button>
}

export function StatusGrid({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="status-grid">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function EventLog({ entries }: { entries: string[] }) {
  const { text } = useI18n()
  return (
    <div className="event-log" aria-live="polite">
      {entries.length === 0 ? <p>{text("No events yet.", "暂无事件。")}</p> : entries.slice(0, 6).map((entry, index) => <p key={`${entry}-${index}`}>{entry}</p>)}
    </div>
  )
}

export function TimelineControls({
  duration,
  onSeek,
  label = "Timeline",
}: {
  duration: number
  onSeek: (time: number) => void
  label?: string
}) {
  const { text } = useI18n()
  const [playing, setPlaying] = useState(false)
  const rangeRef = useRef<HTMLInputElement>(null)
  const outputRef = useRef<HTMLOutputElement>(null)
  const timeRef = useRef(0)
  const seekRef = useRef(onSeek)

  seekRef.current = onSeek

  const seek = (time: number) => {
    const next = Math.max(0, Math.min(duration, time))
    timeRef.current = next
    if (rangeRef.current) rangeRef.current.value = String(next)
    if (outputRef.current) outputRef.current.value = `${Math.round(next)} ms`
    seekRef.current(next)
  }

  useEffect(() => {
    if (!playing) return
    let frame = 0
    let last = performance.now()

    const tick = (now: number) => {
      const elapsed = now - last
      last = now
      const next = timeRef.current + elapsed
      if (next >= duration) {
        seek(duration)
        setPlaying(false)
        return
      }
      seek(next)
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [duration, playing])

  return (
    <div className="timeline-controls">
      <div className="timeline-heading">
        <label htmlFor="timeline-range">{label === "Timeline" ? text("Timeline", "时间线") : label}</label>
        <output ref={outputRef}>0 ms</output>
      </div>
      <input
        id="timeline-range"
        max={duration}
        min={0}
        onInput={(event) => seek(Number(event.currentTarget.value))}
        ref={rangeRef}
        step={1}
        type="range"
        defaultValue={0}
      />
      <Toolbar>
        <Button onClick={() => setPlaying((value) => !value)}>{playing ? text("Pause", "暂停") : text("Play", "播放")}</Button>
        <Button onClick={() => { setPlaying(false); seek(0) }}>{text("Start", "起点")}</Button>
        <Button onClick={() => { setPlaying(false); seek(duration) }}>{text("End", "终点")}</Button>
      </Toolbar>
    </div>
  )
}

export const rgba = (r: number, g: number, b: number, a = 1) => ({ r, g, b, a })

export const colors = {
  ink: rgba(24, 29, 38),
  paper: rgba(246, 247, 242),
  blue: rgba(54, 105, 221),
  blueSoft: rgba(54, 105, 221, 0.18),
  green: rgba(44, 137, 91),
  greenSoft: rgba(44, 137, 91, 0.2),
  orange: rgba(224, 113, 62),
  orangeSoft: rgba(224, 113, 62, 0.22),
  gray: rgba(124, 132, 145),
  graySoft: rgba(124, 132, 145, 0.16),
}

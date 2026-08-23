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

import { type StayCanvasProps } from "react-stay-canvas"

import { useI18n } from "../i18n"

export function DemoLayout({ children }: { children: ReactNode }) {
  const [primary, ...controls] = Children.toArray(children)

  return (
    <div className="demo-layout">
      <div className="demo-primary">{primary}</div>
      {controls.length > 0 && <div className="demo-controls">{controls}</div>}
    </div>
  )
}

function useInitialViewportWidth(viewportRef: RefObject<HTMLDivElement>) {
  const [width, setWidth] = useState<number>()

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    setWidth(Math.max(1, Math.floor(viewport.clientWidth)))
  }, [viewportRef])

  return width
}

export function CanvasCard({
  title,
  description,
  children,
  wide = false,
}: {
  title: string
  description?: string
  children: ReactNode
  wide?: boolean
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const viewportWidth = useInitialViewportWidth(viewportRef)
  const canvas = isValidElement<StayCanvasProps>(children)
    ? viewportWidth
      ? cloneElement(children, {
          width: viewportWidth,
        })
      : null
    : children

  return (
    <section className={wide ? "canvas-card wide" : "canvas-card"}>
      <div className="canvas-card-heading">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      <div className="canvas-viewport" ref={viewportRef}>{canvas}</div>
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

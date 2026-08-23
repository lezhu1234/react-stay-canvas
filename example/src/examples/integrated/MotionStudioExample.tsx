import { useEffect, useMemo, useRef, useState } from "react"
import { StayCanvas, type StayTools } from "react-stay-canvas"

import { CanvasCard } from "../../components/DemoKit"
import { useI18n } from "../../i18n"
import { createMotionListeners, type MotionEngine } from "./motion/interactions"
import {
  MOTION_SCENE_HEIGHT,
  MOTION_SCENE_WIDTH,
  clampTime,
  frameAtTime,
  moveMotionFrame,
  readMotionProject,
  removeMotionFrame,
  seedMotionProject,
  selectedFrame,
  selectedLayer,
  updateMotionFrame,
  updateWorkArea,
  upsertMotionFrame,
  type MotionEasing,
  type MotionProject,
} from "./motion/model"
import {
  motionGeometry,
  progressMotionProject,
  renderMotionProject,
  syncMotionSelection,
} from "./motion/runtime"

type ProjectHistory = {
  past: MotionProject[]
  present: MotionProject
  future: MotionProject[]
}

const easingOptions: MotionEasing[] = ["linear", "easeOutCubic", "easeInOutBack", "easeOutBounce"]
const formatTime = (timeMs: number) => `${(timeMs / 1000).toFixed(2)}s`

export default function MotionStudioExample() {
  const { text } = useI18n()
  const toolsRef = useRef<StayTools>()
  const fileRef = useRef<HTMLInputElement>(null)
  const [history, setHistory] = useState<ProjectHistory>(() => ({
    past: [],
    present: seedMotionProject(text),
    future: [],
  }))
  const project = history.present
  const [selectedLayerId, setSelectedLayerId] = useState<string | undefined>(project.layers[0].id)
  const [selectedFrameId, setSelectedFrameId] = useState(project.layers[0].frames[0].id)
  const [timeMs, setTimeMs] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(true)
  const [bounded, setBounded] = useState(false)
  const [entries, setEntries] = useState<string[]>([])
  const historyRef = useRef(history)
  const projectRef = useRef(project)
  const selectedLayerIdRef = useRef(selectedLayerId)
  const timeRef = useRef(timeMs)
  const boundedRef = useRef(bounded)
  historyRef.current = history
  projectRef.current = project
  selectedLayerIdRef.current = selectedLayerId
  timeRef.current = timeMs
  boundedRef.current = bounded

  const say = (en: string, zh: string) => {
    setEntries((current) => [text(en, zh), ...current].slice(0, 6))
  }

  const commitProject = (update: MotionProject | ((current: MotionProject) => MotionProject)) => {
    const current = historyRef.current
    const next = typeof update === "function" ? update(current.present) : update
    if (next === current.present) return
    const nextHistory = { past: [...current.past, current.present].slice(-40), present: next, future: [] }
    historyRef.current = nextHistory
    projectRef.current = next
    setHistory(nextHistory)
  }

  const undo = () => {
    const current = historyRef.current
    const previous = current.past[current.past.length - 1]
    if (!previous) return
    const nextHistory = { past: current.past.slice(0, -1), present: previous, future: [current.present, ...current.future] }
    historyRef.current = nextHistory
    projectRef.current = previous
    setHistory(nextHistory)
    say("Undo", "撤销")
  }

  const redo = () => {
    const current = historyRef.current
    const next = current.future[0]
    if (!next) return
    const nextHistory = { past: [...current.past, current.present], present: next, future: current.future.slice(1) }
    historyRef.current = nextHistory
    projectRef.current = next
    setHistory(nextHistory)
    say("Redo", "重做")
  }

  const seek = (nextTime: number) => {
    const next = boundedRef.current
      ? Math.max(projectRef.current.workArea.startMs, Math.min(projectRef.current.workArea.endMs, Math.round(nextTime)))
      : clampTime(projectRef.current, nextTime)
    timeRef.current = next
    setTimeMs(next)
    if (toolsRef.current) progressMotionProject(toolsRef.current, projectRef.current, next, selectedLayerIdRef.current, boundedRef.current)
  }

  const selectLayer = (layerId?: string) => {
    selectedLayerIdRef.current = layerId
    setSelectedLayerId(layerId)
    const layer = selectedLayer(projectRef.current, layerId)
    const nearest = layer && [...layer.frames].reverse().find((frame) => frame.timeMs <= timeRef.current)
    setSelectedFrameId(nearest?.id ?? layer?.frames[0]?.id ?? "")
    if (toolsRef.current) syncMotionSelection(toolsRef.current, layerId)
  }

  const commitGeometry = (layerId: string, geometry: NonNullable<ReturnType<typeof motionGeometry>>) => {
    const next = upsertMotionFrame(projectRef.current, layerId, timeRef.current, geometry)
    const nextFrameId = frameAtTime(next, layerId, timeRef.current)?.id ?? ""
    commitProject(next)
    selectedLayerIdRef.current = layerId
    setSelectedLayerId(layerId)
    setSelectedFrameId(nextFrameId)
  }

  const engineRef = useRef<MotionEngine>({
    selectedLayerId,
    select: selectLayer,
    previewGeometry: () => {},
    commitGeometry,
    restore: () => {},
    say,
  })
  const engine = engineRef.current
  engine.selectedLayerId = selectedLayerId
  engine.select = selectLayer
  engine.previewGeometry = (layerId, geometry) => {
    if (!toolsRef.current) return
    const preview = upsertMotionFrame(projectRef.current, layerId, timeRef.current, geometry)
    renderMotionProject(toolsRef.current, preview, timeRef.current, layerId, boundedRef.current)
  }
  engine.commitGeometry = commitGeometry
  engine.restore = () => {
    if (toolsRef.current) renderMotionProject(toolsRef.current, projectRef.current, timeRef.current, selectedLayerIdRef.current, boundedRef.current)
  }
  engine.say = say
  const listeners = useMemo(() => createMotionListeners(engine), [engine])

  const mounted = (tools: StayTools) => {
    toolsRef.current = tools
    renderMotionProject(tools, projectRef.current, timeRef.current, selectedLayerId, boundedRef.current)
  }

  useEffect(() => {
    const layerId = selectedLayer(project, selectedLayerIdRef.current)?.id ?? project.layers[0].id
    const layer = selectedLayer(project, layerId)!
    const frameId = selectedFrame(project, layerId, selectedFrameId)?.id
      ?? [...layer.frames].reverse().find((item) => item.timeMs <= timeRef.current)?.id
      ?? layer.frames[0].id
    if (layerId !== selectedLayerIdRef.current) {
      selectedLayerIdRef.current = layerId
      setSelectedLayerId(layerId)
    }
    if (frameId !== selectedFrameId) setSelectedFrameId(frameId)
    const effectiveTime = boundedRef.current
      ? Math.max(project.workArea.startMs, Math.min(project.workArea.endMs, timeRef.current))
      : clampTime(project, timeRef.current)
    if (effectiveTime !== timeRef.current) {
      timeRef.current = effectiveTime
      setTimeMs(effectiveTime)
    }
    if (toolsRef.current) renderMotionProject(toolsRef.current, project, effectiveTime, layerId, boundedRef.current)
  }, [project])

  useEffect(() => {
    if (toolsRef.current) syncMotionSelection(toolsRef.current, selectedLayerId)
  }, [selectedLayerId])

  useEffect(() => {
    if (!playing) return
    let animationFrame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const current = projectRef.current
      const start = boundedRef.current ? current.workArea.startMs : 0
      const end = boundedRef.current ? current.workArea.endMs : current.durationMs
      const next = timeRef.current + now - last
      last = now
      if (next >= end) {
        if (!loop) {
          seek(end)
          setPlaying(false)
          return
        }
        seek(start + (next - end))
      } else seek(next)
      animationFrame = requestAnimationFrame(tick)
    }
    animationFrame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationFrame)
  }, [loop, playing])

  const exportProject = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(projectRef.current, null, 2)], { type: "application/json" }))
    Object.assign(document.createElement("a"), { href: url, download: "motion-project.json" }).click()
    URL.revokeObjectURL(url)
    say("Project exported", "已导出项目")
  }

  const importProject = async (file?: File) => {
    if (!file) return
    try {
      const next = readMotionProject(JSON.parse(await file.text()))
      commitProject(next)
      selectedLayerIdRef.current = next.layers[0].id
      setSelectedLayerId(next.layers[0].id)
      setSelectedFrameId(next.layers[0].frames[0].id)
      const initialTime = boundedRef.current ? next.workArea.startMs : 0
      timeRef.current = initialTime
      setTimeMs(initialTime)
      say("Project imported", "已导入项目")
    } catch (error) {
      say(error instanceof Error ? error.message : "Import failed", "导入失败，项目格式无效")
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
      const modifier = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (modifier && key === "z") event.shiftKey ? redo() : undo()
      else if (modifier && key === "s") exportProject()
      else if (modifier && key === "i") fileRef.current?.click()
      else if (event.key === " ") setPlaying((current) => !current)
      else return
      event.preventDefault()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  })

  const layer = selectedLayer(project, selectedLayerId)
  const frame = selectedFrame(project, selectedLayerId, selectedFrameId)

  const chooseFrame = (layerId: string, frameId: string, frameTime: number) => {
    selectLayer(layerId)
    setSelectedFrameId(frameId)
    seek(frameTime)
  }

  const addFrame = () => {
    if (!selectedLayerId || !toolsRef.current) return
    const geometry = motionGeometry(toolsRef.current, selectedLayerId)
    if (!geometry) return
    commitGeometry(selectedLayerId, geometry)
    say("Keyframe added", "已添加关键帧")
  }

  const deleteFrame = () => {
    if (!selectedLayerId || !selectedFrameId) return
    commitProject((current) => removeMotionFrame(current, selectedLayerId, selectedFrameId))
    const remaining = layer?.frames.filter(({ id }) => id !== selectedFrameId) ?? []
    setSelectedFrameId(remaining[0]?.id ?? "")
    say("Keyframe deleted", "已删除关键帧")
  }

  const updateFrame = (patch: Parameters<typeof updateMotionFrame>[3]) => {
    if (selectedLayerId && selectedFrameId) {
      commitProject((current) => updateMotionFrame(current, selectedLayerId, selectedFrameId, patch))
    }
  }

  const toggleBound = () => {
    const next = !bounded
    boundedRef.current = next
    setBounded(next)
    seek(next ? project.workArea.startMs : timeRef.current)
    say(next ? "Work area preview enabled" : "Full timeline enabled", next ? "已启用工作区间预览" : "已切换完整时间线")
  }

  const changeWorkArea = (startMs: number, endMs: number) => {
    const next = updateWorkArea(projectRef.current, startMs, endMs)
    commitProject(next)
    if (boundedRef.current) seek(timeRef.current)
  }

  return (
    <div className="motion-workspace">
      <aside className="motion-layers" aria-label={text("Motion layers", "动效图层")}>
        <div className="motion-panel-title"><strong>{text("Layers", "图层")}</strong><span>{project.layers.length}</span></div>
        {project.layers.map((item, index) => (
          <button className={item.id === selectedLayerId ? "active" : ""} key={item.id} onClick={() => selectLayer(item.id)} type="button">
            <span className={`motion-layer-swatch ${item.color}`} />
            <span><b>{item.name}</b><small>{text("Layer", "图层")} {index + 1}</small></span>
          </button>
        ))}
        <div className="motion-shortcuts">
          <span>{text("Play", "播放")} <kbd>Space</kbd></span>
          <span>{text("Undo", "撤销")} <kbd>⌘/Ctrl Z</kbd></span>
          <span>{text("Save", "保存")} <kbd>⌘/Ctrl S</kbd></span>
        </div>
      </aside>

      <main className="motion-stage-area">
        <CanvasCard title={text("Motion composition", "动效合成")} description={text("Select an object, drag to move, or use eight handles to resize at the playhead.", "选择对象后拖动移动，或使用八个手柄在播放头位置调整尺寸。")} wide>
          <StayCanvas className="demo-canvas demo-canvas-grid motion-canvas" height={MOTION_SCENE_HEIGHT} layers={3} listenerList={listeners} mounted={mounted} passive={false} width={MOTION_SCENE_WIDTH} />
        </CanvasCard>
        <div className="motion-stage-toolbar">
          <button onClick={() => setPlaying((current) => !current)} type="button">{playing ? "Ⅱ" : "▶"}</button>
          <button onClick={() => { setPlaying(false); seek(bounded ? project.workArea.startMs : 0) }} type="button">|◀</button>
          <output>{formatTime(timeMs)}</output>
          <button className={loop ? "active" : ""} onClick={() => setLoop((current) => !current)} type="button">↻</button>
          <button className={bounded ? "active" : ""} onClick={toggleBound} type="button">{text("Work area", "工作区间")}</button>
        </div>
      </main>

      <aside className="motion-inspector" aria-label={text("Motion inspector", "动效检查器")}>
        <div className="motion-panel-title"><strong>{text("Inspector", "检查器")}</strong><span>{frame ? formatTime(frame.timeMs) : "—"}</span></div>
        {frame && layer ? <>
          <label><span>X</span><input type="number" value={frame.x} onChange={(event) => updateFrame({ x: Number(event.target.value) })} /></label>
          <label><span>Y</span><input type="number" value={frame.y} onChange={(event) => updateFrame({ y: Number(event.target.value) })} /></label>
          <label><span>{text("Width", "宽度")}</span><input min={28} type="number" value={frame.width} onChange={(event) => updateFrame({ width: Number(event.target.value) })} /></label>
          <label><span>{text("Height", "高度")}</span><input min={28} type="number" value={frame.height} onChange={(event) => updateFrame({ height: Number(event.target.value) })} /></label>
          <label className="motion-inspector-wide"><span>{text("Arrival duration", "到达时长")}</span><input min={0} step={50} type="number" value={frame.durationMs} onChange={(event) => updateFrame({ durationMs: Number(event.target.value) })} /></label>
          <label className="motion-inspector-wide"><span>{text("Easing", "缓动")}</span><select value={frame.easing} onChange={(event) => updateFrame({ easing: event.target.value as MotionEasing })}>{easingOptions.map((value) => <option key={value}>{value}</option>)}</select></label>
          <div className="motion-inspector-actions">
            <button onClick={addFrame} type="button">＋ {text("Keyframe", "关键帧")}</button>
            <button disabled={frame.timeMs === 0 || layer.frames.length <= 2} onClick={deleteFrame} type="button">− {text("Delete", "删除")}</button>
          </div>
        </> : <p>{text("Select a layer or keyframe.", "请选择图层或关键帧。")}</p>}
        <div className="motion-document-actions">
          <button disabled={history.past.length === 0} onClick={undo} type="button">↶ {text("Undo", "撤销")}</button>
          <button disabled={history.future.length === 0} onClick={redo} type="button">↷ {text("Redo", "重做")}</button>
          <button onClick={exportProject} type="button">{text("Export JSON", "导出 JSON")}</button>
          <button onClick={() => fileRef.current?.click()} type="button">{text("Import JSON", "导入 JSON")}</button>
        </div>
        <input accept="application/json,.json" hidden onChange={(event) => { void importProject(event.target.files?.[0]); event.target.value = "" }} ref={fileRef} type="file" />
        <div className="motion-event-log" aria-live="polite">{entries.length === 0 ? <p>{text("Ready to animate.", "可以开始制作动效。")}</p> : entries.map((entry, index) => <p key={`${entry}-${index}`}>{entry}</p>)}</div>
      </aside>

      <section className="motion-timeline" aria-label={text("Keyframe timeline", "关键帧时间线")}>
        <div className="motion-timeline-toolbar">
          <strong>{text("Timeline", "时间线")}</strong>
          <input aria-label={text("Current time", "当前时间")} max={project.durationMs} min={0} onChange={(event) => seek(Number(event.target.value))} type="range" value={timeMs} />
          <output>{formatTime(timeMs)} / {formatTime(project.durationMs)}</output>
          <label>{text("In", "入点")}<input max={project.workArea.endMs - 1} min={0} onChange={(event) => changeWorkArea(Number(event.target.value), projectRef.current.workArea.endMs)} type="number" value={project.workArea.startMs} /></label>
          <label>{text("Out", "出点")}<input max={project.durationMs} min={project.workArea.startMs + 1} onChange={(event) => changeWorkArea(projectRef.current.workArea.startMs, Number(event.target.value))} type="number" value={project.workArea.endMs} /></label>
        </div>
        <div className="motion-ruler"><span>0s</span><span>1s</span><span>2s</span><span>3s</span><span>4s</span></div>
        {project.layers.map((item) => (
          <div className={item.id === selectedLayerId ? "motion-track active" : "motion-track"} key={item.id}>
            <button className="motion-track-name" onClick={() => selectLayer(item.id)} type="button">{item.name}</button>
            <div className="motion-track-rail" onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              seek(((event.clientX - rect.left) / rect.width) * project.durationMs)
            }}>
              <span className="motion-work-area" style={{ left: `${project.workArea.startMs / project.durationMs * 100}%`, width: `${(project.workArea.endMs - project.workArea.startMs) / project.durationMs * 100}%` }} />
              <span className="motion-playhead" style={{ left: `${timeMs / project.durationMs * 100}%` }} />
              {item.frames.map((itemFrame) => (
                <button
                  aria-label={`${item.name} ${formatTime(itemFrame.timeMs)}`}
                  className={itemFrame.id === selectedFrameId ? "motion-keyframe active" : "motion-keyframe"}
                  draggable={itemFrame.timeMs !== 0}
                  key={itemFrame.id}
                  onClick={(event) => { event.stopPropagation(); chooseFrame(item.id, itemFrame.id, itemFrame.timeMs) }}
                  onDragEnd={(event) => {
                    const rail = event.currentTarget.parentElement?.getBoundingClientRect()
                    if (!rail || itemFrame.timeMs === 0) return
                    const nextTime = ((event.clientX - rail.left) / rail.width) * project.durationMs
                    const next = moveMotionFrame(projectRef.current, item.id, itemFrame.id, nextTime)
                    const movedTime = selectedFrame(next, item.id, itemFrame.id)?.timeMs ?? itemFrame.timeMs
                    commitProject(next)
                    seek(movedTime)
                    say("Keyframe moved", "已移动关键帧")
                  }}
                  onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.stopPropagation() }}
                  style={{ left: `${itemFrame.timeMs / project.durationMs * 100}%` }}
                  type="button"
                />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}

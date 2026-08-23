export const MOTION_SCENE_WIDTH = 840
export const MOTION_SCENE_HEIGHT = 430
export const MIN_LAYER_SIZE = 28

export type MotionEasing = "linear" | "easeOutCubic" | "easeInOutBack" | "easeOutBounce"
export type MotionLayerKind = "card" | "title" | "accent"

export type MotionFrame = {
  id: string
  timeMs: number
  x: number
  y: number
  width: number
  height: number
  durationMs: number
  easing: MotionEasing
}

export type MotionLayer = {
  id: string
  name: string
  kind: MotionLayerKind
  color: "blue" | "green" | "orange"
  frames: MotionFrame[]
}

export type MotionProject = {
  version: 1
  durationMs: number
  workArea: { startMs: number; endMs: number }
  layers: MotionLayer[]
}

export type MotionGeometry = Pick<MotionFrame, "x" | "y" | "width" | "height">

const easingValues: MotionEasing[] = ["linear", "easeOutCubic", "easeInOutBack", "easeOutBounce"]
const layerKinds: MotionLayerKind[] = ["card", "title", "accent"]
const colors: MotionLayer["color"][] = ["blue", "green", "orange"]

export const seedMotionProject = (text: (en: string, zh: string) => string): MotionProject => ({
  version: 1,
  durationMs: 4000,
  workArea: { startMs: 700, endMs: 3300 },
  layers: [
    {
      id: "hero-card",
      name: text("Product card", "产品卡片"),
      kind: "card",
      color: "blue",
      frames: [
        { id: "card-0", timeMs: 0, x: 72, y: 168, width: 184, height: 112, durationMs: 0, easing: "linear" },
        { id: "card-1", timeMs: 1450, x: 304, y: 112, width: 232, height: 154, durationMs: 760, easing: "easeOutCubic" },
        { id: "card-2", timeMs: 3200, x: 584, y: 176, width: 172, height: 104, durationMs: 820, easing: "easeInOutBack" },
      ],
    },
    {
      id: "headline",
      name: text("Headline", "主标题"),
      kind: "title",
      color: "green",
      frames: [
        { id: "title-0", timeMs: 0, x: 92, y: 58, width: 220, height: 58, durationMs: 0, easing: "linear" },
        { id: "title-1", timeMs: 1800, x: 310, y: 44, width: 270, height: 72, durationMs: 900, easing: "easeInOutBack" },
        { id: "title-2", timeMs: 3600, x: 552, y: 72, width: 230, height: 56, durationMs: 700, easing: "easeOutCubic" },
      ],
    },
    {
      id: "accent-bar",
      name: text("Accent bar", "强调色条"),
      kind: "accent",
      color: "orange",
      frames: [
        { id: "accent-0", timeMs: 0, x: 84, y: 330, width: 120, height: 28, durationMs: 0, easing: "linear" },
        { id: "accent-1", timeMs: 1200, x: 246, y: 330, width: 330, height: 28, durationMs: 620, easing: "easeOutCubic" },
        { id: "accent-2", timeMs: 3000, x: 548, y: 330, width: 224, height: 28, durationMs: 720, easing: "easeOutBounce" },
      ],
    },
  ],
})

export function clampTime(project: MotionProject, timeMs: number) {
  return Math.max(0, Math.min(project.durationMs, Math.round(timeMs)))
}

export function selectedLayer(project: MotionProject, layerId?: string) {
  return project.layers.find(({ id }) => id === layerId)
}

export function selectedFrame(project: MotionProject, layerId?: string, frameId?: string) {
  return selectedLayer(project, layerId)?.frames.find(({ id }) => id === frameId)
}

export function frameAtTime(project: MotionProject, layerId: string, timeMs: number) {
  return selectedLayer(project, layerId)?.frames.find((frame) => frame.timeMs === Math.round(timeMs))
}

function updateLayer(project: MotionProject, layerId: string, update: (layer: MotionLayer) => MotionLayer): MotionProject {
  const index = project.layers.findIndex((layer) => layer.id === layerId)
  if (index < 0) return project
  const nextLayer = update(project.layers[index])
  if (nextLayer === project.layers[index]) return project
  const layers = [...project.layers]
  layers[index] = nextLayer
  return {
    ...project,
    layers,
  }
}

function normalizeGeometry(geometry: MotionGeometry): MotionGeometry {
  const width = Math.max(MIN_LAYER_SIZE, Math.min(MOTION_SCENE_WIDTH, Math.round(geometry.width)))
  const height = Math.max(MIN_LAYER_SIZE, Math.min(MOTION_SCENE_HEIGHT, Math.round(geometry.height)))
  return {
    x: Math.max(0, Math.min(Math.round(geometry.x), MOTION_SCENE_WIDTH - width)),
    y: Math.max(0, Math.min(Math.round(geometry.y), MOTION_SCENE_HEIGHT - height)),
    width,
    height,
  }
}

function nextFrameId(layer: MotionLayer, timeMs: number) {
  const ids = new Set(layer.frames.map(({ id }) => id))
  const base = `${layer.id}-${timeMs}`
  if (!ids.has(base)) return base
  let sequence = 2
  while (ids.has(`${base}-${sequence}`)) sequence++
  return `${base}-${sequence}`
}

export function updateMotionFrame(
  project: MotionProject,
  layerId: string,
  frameId: string,
  patch: Partial<Omit<MotionFrame, "id" | "timeMs">>,
) {
  if (!selectedFrame(project, layerId, frameId)) return project
  return updateLayer(project, layerId, (layer) => ({
    ...layer,
    frames: layer.frames.map((frame) => {
      if (frame.id !== frameId) return frame
      const geometry = normalizeGeometry({ ...frame, ...patch })
      return {
        ...frame,
        ...patch,
        ...geometry,
        durationMs: Math.max(0, Math.round(patch.durationMs ?? frame.durationMs)),
      }
    }),
  }))
}

export function upsertMotionFrame(
  project: MotionProject,
  layerId: string,
  timeMs: number,
  geometry: MotionGeometry,
) {
  const time = clampTime(project, timeMs)
  const existing = frameAtTime(project, layerId, time)
  if (existing) return updateMotionFrame(project, layerId, existing.id, geometry)
  return updateLayer(project, layerId, (layer) => {
    const frame: MotionFrame = {
      id: nextFrameId(layer, time),
      timeMs: time,
      ...normalizeGeometry(geometry),
      durationMs: 500,
      easing: "easeOutCubic",
    }
    return { ...layer, frames: [...layer.frames, frame].sort((a, b) => a.timeMs - b.timeMs) }
  })
}

export function moveMotionFrame(project: MotionProject, layerId: string, frameId: string, timeMs: number) {
  const layer = selectedLayer(project, layerId)
  const frame = layer?.frames.find(({ id }) => id === frameId)
  if (!layer || !frame || frame.timeMs === 0) return project
  const nextTime = Math.max(1, clampTime(project, timeMs))
  if (nextTime === frame.timeMs) return project
  const occupied = layer.frames.some((candidate) => candidate.id !== frameId && candidate.timeMs === nextTime)
  if (occupied) return project
  return updateLayer(project, layerId, (current) => ({
    ...current,
    frames: current.frames
      .map((candidate) => candidate.id === frameId ? { ...candidate, timeMs: nextTime } : candidate)
      .sort((a, b) => a.timeMs - b.timeMs),
  }))
}

export function removeMotionFrame(project: MotionProject, layerId: string, frameId: string) {
  return updateLayer(project, layerId, (layer) => {
    const frame = layer.frames.find(({ id }) => id === frameId)
    if (!frame || frame.timeMs === 0 || layer.frames.length <= 2) return layer
    return { ...layer, frames: layer.frames.filter(({ id }) => id !== frameId) }
  })
}

export function updateWorkArea(project: MotionProject, startMs: number, endMs: number): MotionProject {
  const start = clampTime(project, Math.min(startMs, endMs - 1))
  const end = clampTime(project, Math.max(endMs, start + 1))
  return { ...project, workArea: { startMs: start, endMs: end } }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

export function readMotionProject(data: unknown): MotionProject {
  const source = data as Partial<MotionProject>
  if (!source || source.version !== 1 || !isFiniteNumber(source.durationMs) || source.durationMs < 500 || !Array.isArray(source.layers) || source.layers.length === 0) {
    throw new Error("Motion project must contain a valid version 1 timeline")
  }
  const durationMs = Math.round(source.durationMs)
  const layerIds = new Set<string>()
  const layers = source.layers.map((layer) => {
    if (!layer || typeof layer.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(layer.id) || layerIds.has(layer.id)) {
      throw new Error("Motion layer ids must be unique and URL-safe")
    }
    if (typeof layer.name !== "string" || !layer.name.trim() || !layerKinds.includes(layer.kind) || !colors.includes(layer.color) || !Array.isArray(layer.frames) || layer.frames.length < 2) {
      throw new Error("Motion layer has invalid content")
    }
    layerIds.add(layer.id)
    const frameIds = new Set<string>()
    const times = new Set<number>()
    const frames = layer.frames.map((frame) => {
      if (!frame || typeof frame.id !== "string" || frameIds.has(frame.id) || !isFiniteNumber(frame.timeMs)) {
        throw new Error("Motion keyframes must have unique ids and times")
      }
      const timeMs = Math.round(frame.timeMs)
      if (timeMs < 0 || timeMs > durationMs || times.has(timeMs)) throw new Error("Motion keyframes must have unique ids and times")
      const values = [frame.x, frame.y, frame.width, frame.height, frame.durationMs]
      if (!values.every(isFiniteNumber) || !easingValues.includes(frame.easing)) throw new Error("Motion keyframe has invalid properties")
      const geometry = normalizeGeometry(frame)
      frameIds.add(frame.id)
      times.add(timeMs)
      return { ...frame, timeMs, ...geometry, durationMs: Math.max(0, Math.round(frame.durationMs)) }
    }).sort((a, b) => a.timeMs - b.timeMs)
    if (frames[0].timeMs !== 0) throw new Error("Every motion layer must start at time 0")
    return { ...layer, name: layer.name.trim(), frames }
  })
  const area = source.workArea
  if (!area || !isFiniteNumber(area.startMs) || !isFiniteNumber(area.endMs)) {
    throw new Error("Motion project has an invalid work area")
  }
  const startMs = Math.round(area.startMs)
  const endMs = Math.round(area.endMs)
  if (startMs < 0 || endMs > durationMs || startMs >= endMs) throw new Error("Motion project has an invalid work area")
  return { version: 1, durationMs, workArea: { startMs, endMs }, layers }
}

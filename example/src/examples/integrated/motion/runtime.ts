import {
  Rectangle,
  StayText,
  type StayAnimatedChild,
  type StayInstantChild,
  type StayTools,
} from "react-stay-canvas"

import { colors, rgba, sceneArea, scenePoint } from "../../../components/DemoKit"
import {
  MOTION_SCENE_HEIGHT,
  MOTION_SCENE_WIDTH,
  type MotionFrame,
  type MotionGeometry,
  type MotionLayer,
  type MotionProject,
} from "./model"

type MotionShape = Rectangle | StayText
type MotionChild = StayAnimatedChild<MotionShape>
type SelectionChild = StayInstantChild<Rectangle>
export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"

const HANDLE_SIZE = 10
const HANDLE_ORDER: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]
const transparent = rgba(0, 0, 0, 0)

const bodyKey = "body"
const labelKey = "label"
const outlineKey = "outline"
const handleKey = (handle: ResizeHandle) => `handle:${handle}`
const childId = (layerId: string) => `motion-layer-${layerId}`

export const motionLayers = (tools: StayTools) =>
  tools.getChildrenBySelector<MotionShape>(".motion-layer") as MotionChild[]

export const layerBody = (child: MotionChild) => child.shapeMap.get(bodyKey) as Rectangle
export const layerLabel = (child: MotionChild) => child.shapeMap.get(labelKey) as StayText | undefined
const layerIdOf = (child: MotionChild) => layerBody(child).shapeStore.get("motion-layer-id") as string

function palette(layer: MotionLayer) {
  if (layer.color === "green") return { fill: colors.greenSoft, stroke: colors.green }
  if (layer.color === "orange") return { fill: colors.orangeSoft, stroke: colors.orange }
  return { fill: colors.blueSoft, stroke: colors.blue }
}

function frameTransition(frame: MotionFrame, previous?: MotionFrame) {
  if (!previous) return { durationMs: 0, delayMs: 0, type: frame.easing }
  const interval = frame.timeMs - previous.timeMs
  const durationMs = Math.min(Math.max(0, frame.durationMs), interval)
  return { durationMs, delayMs: interval - durationMs, type: frame.easing }
}

function createBody(tools: StayTools, layer: MotionLayer, frame: MotionFrame, previous?: MotionFrame) {
  const point = scenePoint(tools, frame.x, frame.y)
  const style = palette(layer)
  return new Rectangle({
    ...point,
    width: frame.width,
    height: frame.height,
    layer: 1,
    zIndex: layer.kind === "accent" ? 1 : 2,
    fillConfig: { color: style.fill },
    strokeConfig: { color: style.stroke, lineWidth: layer.kind === "accent" ? 1 : 2 },
    shapeStore: new Map([["motion-layer-id", layer.id]]),
    transition: frameTransition(frame, previous),
  })
}

function createLabel(tools: StayTools, layer: MotionLayer, frame: MotionFrame, previous?: MotionFrame) {
  const point = scenePoint(tools, frame.x + frame.width / 2, frame.y + frame.height / 2)
  const style = palette(layer)
  const fontSize = layer.kind === "title"
    ? Math.max(20, Math.min(42, frame.height * 0.48))
    : layer.kind === "accent" ? 11 : 16
  return new StayText({
    ...point,
    text: layer.name,
    textAlign: "center",
    textBaseline: "middle",
    font: { size: fontSize, fontWeight: layer.kind === "title" ? 800 : 700 },
    layer: 2,
    zIndex: 3,
    fillConfig: { color: layer.kind === "accent" ? style.stroke : colors.ink },
    transition: frameTransition(frame, previous),
  })
}

function compileAnimatedLayer(tools: StayTools, layer: MotionLayer) {
  const bodyFrames: Rectangle[] = []
  const labelFrames: StayText[] = []
  layer.frames.forEach((frame, index) => {
    const previous = layer.frames[index - 1]
    bodyFrames.push(createBody(tools, layer, frame, previous))
    labelFrames.push(createLabel(tools, layer, frame, previous))
  })
  return { bodyFrames, labelFrames }
}

function createAnimatedLayer(tools: StayTools, layer: MotionLayer) {
  const child = tools.createChild({ id: childId(layer.id), className: "motion-layer" }) as MotionChild
  const { bodyFrames, labelFrames } = compileAnimatedLayer(tools, layer)
  child.appendKeyFrames(new Map<string, MotionShape | MotionShape[]>([
    [bodyKey, bodyFrames],
    [labelKey, labelFrames],
  ]), false)
  return child
}

function syncAnimatedLayer(tools: StayTools, layer: MotionLayer) {
  const child = motionLayerById(tools, layer.id)
  if (!child) return createAnimatedLayer(tools, layer)

  const { bodyFrames, labelFrames } = compileAnimatedLayer(tools, layer)
  child.replaceSlice(bodyKey, bodyFrames, false)
  child.replaceSlice(labelKey, labelFrames, false)
  return child
}

function matchesProjectLayerOrder(children: MotionChild[], project: MotionProject) {
  return children.length === project.layers.length
    && children.every((child, index) => child.id === childId(project.layers[index].id))
}

function handleCenters(body: Rectangle): Record<ResizeHandle, { x: number; y: number }> {
  const centerX = body.x + body.width / 2
  const centerY = body.y + body.height / 2
  return {
    nw: { x: body.x, y: body.y },
    n: { x: centerX, y: body.y },
    ne: { x: body.x + body.width, y: body.y },
    e: { x: body.x + body.width, y: centerY },
    se: { x: body.x + body.width, y: body.y + body.height },
    s: { x: centerX, y: body.y + body.height },
    sw: { x: body.x, y: body.y + body.height },
    w: { x: body.x, y: centerY },
  }
}

function selectionChild(tools: StayTools) {
  const existing = tools.getChildBySelector<Rectangle>(".motion-selection") as SelectionChild | undefined
  if (existing) return existing
  const shapes = new Map<string, Rectangle>([
    [outlineKey, new Rectangle({
      x: 0, y: 0, width: 1, height: 1, layer: 2, zIndex: 20,
      fillConfig: { color: transparent },
      strokeConfig: { color: transparent, lineWidth: 2, dash: [6, 4] },
    })],
    ...HANDLE_ORDER.map((handle): [string, Rectangle] => [handleKey(handle), new Rectangle({
      x: 0, y: 0, width: HANDLE_SIZE, height: HANDLE_SIZE, layer: 2, zIndex: 21,
      fillConfig: { color: transparent },
      strokeConfig: { color: transparent, lineWidth: 2 },
    })]),
  ])
  return tools.appendChild<Rectangle>({ className: "motion-selection", shape: shapes }) as SelectionChild
}

export function syncMotionSelection(tools: StayTools, selectedLayerId?: string) {
  const selection = selectionChild(tools)
  const selected = selectedLayerId
    ? tools.getChildById<MotionShape>(childId(selectedLayerId)) as MotionChild | undefined
    : undefined
  const outline = selection.shapeMap.get(outlineKey) as Rectangle
  if (!selected || !selected.shapeMap.has(bodyKey)) {
    outline.update({ strokeConfig: { color: transparent, lineWidth: 2 } })
    HANDLE_ORDER.forEach((handle) => selection.shapeMap.get(handleKey(handle))?.update({
      fillConfig: { color: transparent },
      strokeConfig: { color: transparent, lineWidth: 2 },
    }))
    return
  }
  const body = layerBody(selected)
  outline.update({
    x: body.x,
    y: body.y,
    width: body.width,
    height: body.height,
    strokeConfig: { color: colors.blue, lineWidth: 2, dash: [6, 4] },
  })
  const centers = handleCenters(body)
  HANDLE_ORDER.forEach((handle) => {
    const center = centers[handle]
    selection.shapeMap.get(handleKey(handle))?.update({
      x: center.x - HANDLE_SIZE / 2,
      y: center.y - HANDLE_SIZE / 2,
      width: HANDLE_SIZE,
      height: HANDLE_SIZE,
      fillConfig: { color: colors.paper },
      strokeConfig: { color: colors.blue, lineWidth: 2 },
    })
  })
}

export function renderMotionProject(
  tools: StayTools,
  project: MotionProject,
  timeMs: number,
  selectedLayerId?: string,
  bounded = false,
) {
  const currentLayers = motionLayers(tools)
  if (matchesProjectLayerOrder(currentLayers, project)) {
    project.layers.forEach((layer) => syncAnimatedLayer(tools, layer))
  } else {
    currentLayers.forEach(({ id }) => tools.removeChild(id))
    project.layers.forEach((layer) => createAnimatedLayer(tools, layer))
  }
  progressMotionProject(tools, project, timeMs, selectedLayerId, bounded)
}

export function progressMotionProject(
  tools: StayTools,
  project: MotionProject,
  timeMs: number,
  selectedLayerId?: string,
  bounded = false,
) {
  const effectiveTime = bounded
    ? Math.max(project.workArea.startMs, Math.min(project.workArea.endMs, timeMs))
    : Math.max(0, Math.min(project.durationMs, timeMs))
  tools.progress({ timeMs: effectiveTime })
  syncMotionSelection(tools, selectedLayerId)
}

export function hitMotionLayer(tools: StayTools, point: { x: number; y: number }) {
  let hit: MotionChild | undefined
  motionLayers(tools).forEach((child) => {
    const body = layerBody(child)
    if (body.contains(point) && (!hit || body.zIndex >= layerBody(hit).zIndex)) hit = child
  })
  return hit
}

export function selectedResizeHandle(tools: StayTools, point: { x: number; y: number }) {
  const selection = tools.getChildBySelector<Rectangle>(".motion-selection") as SelectionChild | undefined
  if (!selection) return
  return HANDLE_ORDER.find((handle) => selection.shapeMap.get(handleKey(handle))?.contains(point))
}

export function motionLayerById(tools: StayTools, layerId: string) {
  return tools.getChildById<MotionShape>(childId(layerId)) as MotionChild | undefined
}

export function motionGeometry(tools: StayTools, layerId: string): MotionGeometry | undefined {
  const child = motionLayerById(tools, layerId)
  if (!child) return
  const body = layerBody(child)
  const area = sceneArea(tools, MOTION_SCENE_WIDTH, MOTION_SCENE_HEIGHT)
  return { x: body.x - area.x, y: body.y - area.y, width: body.width, height: body.height }
}

export function motionSceneArea(tools: StayTools) {
  return sceneArea(tools, MOTION_SCENE_WIDTH, MOTION_SCENE_HEIGHT)
}

export function motionLayerId(child: MotionChild) {
  return layerIdOf(child)
}

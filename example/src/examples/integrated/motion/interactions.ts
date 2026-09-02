import type { Coordinate, Cursor, ListenerProps, StayTools } from "react-stay-canvas"

import { hasPointerPosition } from "../../actionEventGuards"
import { MIN_LAYER_SIZE, type MotionGeometry } from "./model"
import {
  hitMotionLayer,
  motionGeometry,
  motionLayerById,
  motionLayerId,
  motionSceneArea,
  selectedResizeHandle,
  syncMotionSelection,
  type ResizeHandle,
} from "./runtime"

export type MotionEngine = {
  selectedLayerId?: string
  select: (layerId?: string) => void
  previewGeometry: (layerId: string, geometry: MotionGeometry) => void
  commitGeometry: (layerId: string, geometry: MotionGeometry) => void
  restore: () => void
  say: (en: string, zh: string) => void
}

type MotionGesture = {
  kind: "move" | "resize"
  layerId: string
  start: Coordinate
  origin: MotionGeometry
  preview: MotionGeometry
  handle?: ResizeHandle
}

const resizeCursors: Record<ResizeHandle, Cursor> = {
  nw: "nwse-resize", n: "ns-resize", ne: "nesw-resize", e: "ew-resize",
  se: "nwse-resize", s: "ns-resize", sw: "nesw-resize", w: "ew-resize",
}

function isMotionGesture(value: unknown): value is MotionGesture {
  return Boolean(value && typeof value === "object" && ["move", "resize"].includes((value as MotionGesture).kind))
}

function beginGesture(tools: StayTools, engine: MotionEngine, point: Coordinate): MotionGesture | undefined {
  const handle = engine.selectedLayerId ? selectedResizeHandle(tools, point) : undefined
  const target = handle && engine.selectedLayerId
    ? motionLayerById(tools, engine.selectedLayerId)
    : hitMotionLayer(tools, point)
  if (!target) return
  const layerId = motionLayerId(target)
  const origin = motionGeometry(tools, layerId)
  if (!origin) return
  engine.select(layerId)
  return { kind: handle ? "resize" : "move", layerId, start: point, origin, preview: origin, handle }
}

function clampMove(tools: StayTools, gesture: MotionGesture, point: Coordinate) {
  const area = motionSceneArea(tools)
  const offsetX = Math.max(
    area.x - gesture.origin.x - area.x,
    Math.min(point.x - gesture.start.x, area.width - gesture.origin.x - gesture.origin.width),
  )
  const offsetY = Math.max(
    area.y - gesture.origin.y - area.y,
    Math.min(point.y - gesture.start.y, area.height - gesture.origin.y - gesture.origin.height),
  )
  return { offsetX, offsetY }
}

function resizeAxis(start: number, size: number, pointer: number, fromStart: boolean, fromEnd: boolean, boundStart: number, boundSize: number) {
  const boundEnd = boundStart + boundSize
  let low = start
  let high = start + size
  if (fromStart) low = Math.max(boundStart, Math.min(pointer, high - MIN_LAYER_SIZE))
  if (fromEnd) high = Math.min(boundEnd, Math.max(pointer, low + MIN_LAYER_SIZE))
  return { start: low, size: high - low }
}

function resizeGeometry(tools: StayTools, gesture: MotionGesture, point: Coordinate) {
  const area = motionSceneArea(tools)
  const handle = gesture.handle!
  const originX = area.x + gesture.origin.x
  const originY = area.y + gesture.origin.y
  const horizontal = resizeAxis(originX, gesture.origin.width, point.x, handle.includes("w"), handle.includes("e"), area.x, area.width)
  const vertical = resizeAxis(originY, gesture.origin.height, point.y, handle.includes("n"), handle.includes("s"), area.y, area.height)
  return {
    x: horizontal.start - area.x,
    y: vertical.start - area.y,
    width: horizontal.size,
    height: vertical.size,
  }
}

function updateGesture(tools: StayTools, engine: MotionEngine, gesture: MotionGesture, point: Coordinate) {
  const preview = gesture.kind === "move"
    ? (() => {
        const { offsetX, offsetY } = clampMove(tools, gesture, point)
        return { ...gesture.origin, x: gesture.origin.x + offsetX, y: gesture.origin.y + offsetY }
      })()
    : resizeGeometry(tools, gesture, point)
  engine.previewGeometry(gesture.layerId, preview)
  return { ...gesture, preview }
}

export function createMotionListeners(engine: MotionEngine): ListenerProps[] {
  return [
    {
      name: "motion-transform",
      selector: ".stay-canvas",
      event: ["drag", "dragend"],
      callback: ({ e, composeStore, store, tools }) => ({
        drag: () => {
          if (!hasPointerPosition(e)) return composeStore
          const gesture = isMotionGesture(composeStore)
            ? composeStore
            : beginGesture(tools, engine, store.get("dragStartPosition") as Coordinate)
          if (!gesture) return composeStore
          return updateGesture(tools, engine, gesture, e.point)
        },
        dragend: () => {
          if (!isMotionGesture(composeStore)) return { kind: undefined }
          if (e.cancelled) {
            engine.restore()
            engine.say("Transform cancelled", "已取消变换")
            return { kind: undefined }
          }
          engine.commitGeometry(composeStore.layerId, composeStore.preview)
          engine.say("Keyframe updated", "已更新关键帧")
          return { kind: undefined }
        },
      }),
    },
    {
      name: "motion-select",
      selector: ".stay-canvas",
      event: "click",
      callback: ({ e, tools }) => {
        if (!hasPointerPosition(e)) return
        const target = hitMotionLayer(tools, e.point)
        engine.select(target ? motionLayerId(target) : undefined)
        syncMotionSelection(tools, target ? motionLayerId(target) : undefined)
        engine.say(target ? "Layer selected" : "Selection cleared", target ? "已选择图层" : "已取消选择")
      },
    },
    {
      name: "motion-cursor",
      selector: ".stay-canvas",
      event: ["mousemove", "mouseleave"],
      callback: ({ e, tools }) => {
        if (e.name === "mouseleave" || !hasPointerPosition(e)) {
          tools.changeCursor("default")
          return
        }
        const handle = engine.selectedLayerId && selectedResizeHandle(tools, e.point)
        if (handle) tools.changeCursor(resizeCursors[handle])
        else tools.changeCursor(hitMotionLayer(tools, e.point) ? "move" : "default")
      },
    },
  ]
}

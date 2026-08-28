import { InstantShape } from "../shapes/instantShape"
import { StayInstantChild } from "./children/stayInstantChild"
import { StepProps } from "./types"
import { snapshotShapeMap } from "./shapeMapSnapshot"
import type { ChildPlacementSnapshot } from "../types/transform"
import {
  childPlacementEquals,
  copyChildPlacement,
} from "./placements/childPlacement"

export interface HistoryChildSnapshot {
  id: string
  className: string
  shape: Map<string, InstantShape>
  placement: ChildPlacementSnapshot
}

export function captureHistoryChild(child: StayInstantChild): HistoryChildSnapshot {
  return {
    id: child.id,
    className: child.className,
    shape: snapshotShapeMap(child.shapeMap),
    placement: copyChildPlacement(child.placement),
  }
}

export function captureHistoryChildren(
  children: Iterable<StayInstantChild>
): Map<string, HistoryChildSnapshot> {
  const snapshots = new Map<string, HistoryChildSnapshot>()
  for (const child of children) {
    if (!child.participatesInHistory) continue
    snapshots.set(child.id, captureHistoryChild(child))
  }
  return snapshots
}

export function materializeHistoryShapes(
  shapes: ReadonlyMap<string, InstantShape>
): Map<string, InstantShape> {
  return snapshotShapeMap(shapes)
}

function snapshotStepChild(child: HistoryChildSnapshot) {
  return {
    id: child.id,
    className: child.className,
    shape: child.shape,
    placement: copyChildPlacement(child.placement),
  }
}

const transientShapeKeys = new Set([
  "offsetX",
  "offsetY",
  "parent",
  "startTime",
  "updateNextFrame",
  "zeroPoint",
  "zeroPointCopy",
])

function valuesEqual(before: unknown, after: unknown): boolean {
  if (Object.is(before, after)) return true
  if (!before || !after || typeof before !== "object" || typeof after !== "object") {
    return false
  }
  if (before.constructor !== after.constructor) return false
  if (before instanceof Map && after instanceof Map) {
    return before.size === after.size && [...before].every(([key, value]) =>
      after.has(key) && valuesEqual(value, after.get(key)))
  }
  if (before instanceof Set && after instanceof Set) {
    return before.size === after.size && [...before].every((value) => after.has(value))
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    return before.length === after.length && before.every((value, index) =>
      valuesEqual(value, after[index]))
  }
  const beforePrototype = Object.getPrototypeOf(before)
  if (beforePrototype !== Object.prototype && beforePrototype !== null) {
    if (before instanceof InstantShape && after instanceof InstantShape) {
      return shapesEqual(before, after)
    }
    if (Object.keys(before).length === 0 && Object.keys(after).length === 0) return false
  }
  const beforeRecord = before as Record<string, unknown>
  const afterRecord = after as Record<string, unknown>
  const beforeKeys = Object.keys(beforeRecord)
  const afterKeys = Object.keys(afterRecord)
  return beforeKeys.length === afterKeys.length && beforeKeys.every((key) =>
    Object.prototype.hasOwnProperty.call(afterRecord, key) &&
    valuesEqual(beforeRecord[key], afterRecord[key]))
}

function shapesEqual(before: InstantShape, after: InstantShape) {
  if (before.constructor !== after.constructor) return false
  const beforeRecord = before as unknown as Record<string, unknown>
  const afterRecord = after as unknown as Record<string, unknown>
  const beforeKeys = Object.keys(beforeRecord).filter((key) => !transientShapeKeys.has(key))
  const afterKeys = Object.keys(afterRecord).filter((key) => !transientShapeKeys.has(key))
  return beforeKeys.length === afterKeys.length && beforeKeys.every((key) =>
    Object.prototype.hasOwnProperty.call(afterRecord, key) &&
    valuesEqual(beforeRecord[key], afterRecord[key]))
}

function shapeMapsEqual(
  before: ReadonlyMap<string, InstantShape>,
  after: ReadonlyMap<string, InstantShape>
) {
  return before.size === after.size && [...before].every(([name, shape]) => {
    const nextShape = after.get(name)
    return Boolean(nextShape && shapesEqual(shape, nextShape))
  })
}

export function diffHistoryChild(
  before: HistoryChildSnapshot | undefined,
  after: HistoryChildSnapshot | undefined
): StepProps | undefined {
  if (after && !before) {
    return { action: "append", child: snapshotStepChild(after) }
  }
  if (before && !after) {
    return { action: "remove", child: snapshotStepChild(before) }
  }
  if (!before || !after) return undefined
  if (before.id !== after.id) {
    throw new Error("history id and current id must be the same")
  }
  if (
    before.className === after.className &&
    shapeMapsEqual(before.shape, after.shape) &&
    childPlacementEquals(before.placement, after.placement)
  ) {
    return undefined
  }

  return {
    action: "update",
    child: {
      ...snapshotStepChild(after),
      beforeName: before.className,
      beforeShape: before.shape,
      beforePlacement: copyChildPlacement(before.placement),
    },
  }
}

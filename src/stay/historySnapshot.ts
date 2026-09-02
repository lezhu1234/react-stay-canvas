import { InstantShape } from "../shapes/instantShape"
import type { StayChild } from "./children/stayChild"
import { isStayInstantChild, isStayWebGLChild } from "./children/stayChild"
import { StayInstantChild } from "./children/stayInstantChild"
import type { ChildHistoryRuntime, ChildIdentity } from "./children/runtimeContracts"
import type { StepProps } from "./types"
import { snapshotShapeMap } from "./shapeMapSnapshot"
import type { ChildPlacementSnapshot } from "../types/transform"
import {
  childPlacementEquals,
  copyChildPlacement,
} from "./placements/childPlacement"
import {
  captureStayWebGLChildSnapshot,
  type StayWebGLChildSnapshot,
} from "./webgl2/stayWebGLChildSnapshot"
import { stayWebGLChildHistory } from "./webgl2/stayWebGLChildRuntime"

export interface HistoryChildSnapshot {
  readonly kind: "canvas2d"
  id: string
  className: string
  shape: Map<string, InstantShape>
  placement: ChildPlacementSnapshot
}

export function captureHistoryChild(child: StayInstantChild): HistoryChildSnapshot {
  return {
    kind: "canvas2d",
    id: child.id,
    className: child.className,
    shape: snapshotShapeMap(child.shapeMap),
    placement: copyChildPlacement(child.placement),
  }
}

export const stayInstantChildHistory: ChildHistoryRuntime<
  StayInstantChild,
  HistoryChildSnapshot
> = {
  participates: (child) => child.participatesInHistory,
  capture: captureHistoryChild,
}

export function captureChildHistory<TChild extends ChildIdentity, TSnapshot>(
  children: Iterable<TChild>,
  runtime: ChildHistoryRuntime<TChild, TSnapshot>
): Map<string, TSnapshot> {
  const snapshots = new Map<string, TSnapshot>()
  for (const child of children) {
    if (!runtime.participates(child)) continue
    snapshots.set(child.id, runtime.capture(child))
  }
  return snapshots
}

export type StayHistoryChildSnapshot = HistoryChildSnapshot | StayWebGLChildSnapshot

export function captureHistoryChildren(
  children: Iterable<StayChild>
): Map<string, StayHistoryChildSnapshot> {
  const snapshots = new Map<string, StayHistoryChildSnapshot>()
  for (const child of children) {
    if (isStayInstantChild(child)) {
      if (stayInstantChildHistory.participates(child)) {
        snapshots.set(child.id, stayInstantChildHistory.capture(child))
      }
      continue
    }
    if (isStayWebGLChild(child) && stayWebGLChildHistory.participates(child)) {
      snapshots.set(child.id, captureStayWebGLChildSnapshot(child))
    }
  }
  return snapshots
}

export function materializeHistoryShapes(
  shapes: ReadonlyMap<string, InstantShape>
): Map<string, InstantShape> {
  return snapshotShapeMap(shapes)
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
  if (ArrayBuffer.isView(before) && ArrayBuffer.isView(after)) {
    if (before.constructor !== after.constructor || before.byteLength !== after.byteLength) {
      return false
    }
    const beforeBytes = new Uint8Array(before.buffer, before.byteOffset, before.byteLength)
    const afterBytes = new Uint8Array(after.buffer, after.byteOffset, after.byteLength)
    return beforeBytes.every((value, index) => value === afterBytes[index])
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
  before: StayHistoryChildSnapshot | undefined,
  after: StayHistoryChildSnapshot | undefined
): StepProps<StayHistoryChildSnapshot> | undefined {
  if (after && !before) {
    return { action: "append", child: after }
  }
  if (before && !after) {
    return { action: "remove", child: before }
  }
  if (!before || !after) return undefined
  if (before.id !== after.id) {
    throw new Error("history id and current id must be the same")
  }
  if (before.kind !== after.kind) {
    throw new Error("history backend and current backend must be the same")
  }
  const unchanged = before.kind === "canvas2d" && after.kind === "canvas2d"
    ? before.className === after.className &&
      shapeMapsEqual(before.shape, after.shape) &&
      childPlacementEquals(before.placement, after.placement)
    : before.className === after.className &&
      before.kind === "webgl2" && after.kind === "webgl2" &&
      before.layer === after.layer && valuesEqual(before.meshes, after.meshes)
  if (unchanged) {
    return undefined
  }

  return {
    action: "update",
    child: after,
    before,
  }
}

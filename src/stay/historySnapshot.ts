import { InstantShape } from "../shapes/instantShape"
import { StayInstantChild } from "./children/stayInstantChild"
import { StepProps } from "./types"
import { snapshotShapeMap } from "./shapeMapSnapshot"

export interface HistoryChildSnapshot {
  id: string
  className: string
  shape: Map<string, InstantShape>
}

export function captureHistoryChild(child: StayInstantChild): HistoryChildSnapshot {
  return {
    id: child.id,
    className: child.className,
    shape: snapshotShapeMap(child.shapeMap),
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
  }
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

  return {
    action: "update",
    child: {
      ...snapshotStepChild(after),
      beforeName: before.className,
      beforeShape: before.shape,
    },
  }
}

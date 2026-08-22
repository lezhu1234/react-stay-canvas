import { InstantShape } from "../shapes/instantShape"

function preserveShapeRuntimeState<T extends InstantShape>(source: T, snapshot: T): T {
  snapshot.offsetX = source.offsetX
  snapshot.offsetY = source.offsetY
  snapshot.startTime = source.startTime
  snapshot.zeroPoint = { ...source.zeroPoint }
  snapshot.zeroPointCopy = { ...source.zeroPointCopy }
  snapshot.updateNextFrame = source.updateNextFrame
  snapshot.parent = undefined
  return snapshot
}

export function snapshotShapeMap<T extends InstantShape>(
  shapeMap: ReadonlyMap<string, T>
): Map<string, T> {
  const snapshot = new Map<string, T>()
  shapeMap.forEach((shape, name) => {
    snapshot.set(name, preserveShapeRuntimeState(shape, shape.copy() as T))
  })
  return snapshot
}

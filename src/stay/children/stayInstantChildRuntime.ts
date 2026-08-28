import type { ChildLayerRuntime, ChildPointHitRuntime } from "./runtimeContracts"
import type { StayInstantChild } from "./stayInstantChild"

export const stayInstantChildLayers: ChildLayerRuntime<StayInstantChild> = {
  dirtyLayers: (child) => child.getUpdatedLayers(),
  drawn: (child, layerIndex) => child.layerDraw(layerIndex),
  occupiedLayers: (child) => child.getLayers(),
}

export const stayInstantChildPointHits: ChildPointHitRuntime<StayInstantChild> = {
  contains: (child, point) => child.containsPointer(point),
}

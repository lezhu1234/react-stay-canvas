import { StayInstantChild } from "./stayInstantChild"
import { stayInstantChildLayers } from "./stayInstantChildRuntime"
import type { ChildLayerRuntime } from "./runtimeContracts"
import { StayWebGLChild } from "../webgl2/stayWebGLChild"
import { stayWebGLChildLayers } from "../webgl2/stayWebGLChildRuntime"

export type StayChild = StayInstantChild | StayWebGLChild

export function isStayInstantChild(child: StayChild): child is StayInstantChild {
  return child instanceof StayInstantChild
}

export function isStayWebGLChild(child: StayChild): child is StayWebGLChild {
  return child instanceof StayWebGLChild
}

/** Shared dirty-layer seam for the single heterogeneous Child store. */
export const stayChildLayers: ChildLayerRuntime<StayChild> = {
  dirtyLayers: (child) => isStayWebGLChild(child)
    ? stayWebGLChildLayers.dirtyLayers(child)
    : stayInstantChildLayers.dirtyLayers(child),
  drawn: (child, layerIndex) => isStayWebGLChild(child)
    ? stayWebGLChildLayers.drawn(child, layerIndex)
    : stayInstantChildLayers.drawn(child, layerIndex),
  occupiedLayers: (child) => isStayWebGLChild(child)
    ? stayWebGLChildLayers.occupiedLayers(child)
    : stayInstantChildLayers.occupiedLayers(child),
}

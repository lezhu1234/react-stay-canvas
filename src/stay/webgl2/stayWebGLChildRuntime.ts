import type {
  ChildHistoryRuntime,
  ChildLayerRuntime,
} from "../children/runtimeContracts"
import {
  captureStayWebGLChildSnapshot,
  type StayWebGLChildSnapshot,
} from "./stayWebGLChildSnapshot"
import type { StayWebGLChild } from "./stayWebGLChild"

export const stayWebGLChildLayers: ChildLayerRuntime<StayWebGLChild> = {
  dirtyLayers: (child) => child.getUpdatedLayers(),
  drawn: (child, layerIndex) => child.layerDrawn(layerIndex),
  occupiedLayers: (child) => child.getLayers(),
}

export const stayWebGLChildHistory: ChildHistoryRuntime<
  StayWebGLChild,
  StayWebGLChildSnapshot
> = {
  participates: () => true,
  capture: captureStayWebGLChildSnapshot,
}

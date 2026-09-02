import { Canvas } from "../canvas"
import { InstantShape } from "../shapes/instantShape"
import type { Area } from "../types/geometry"
import type { SceneChildFragment, SceneFragment } from "../types/children"
import { StayInstantChild } from "./children/stayInstantChild"
import { snapshotShapeMap } from "./shapeMapSnapshot"
import {
  copyChildPlacement,
  copyChildPlacementInput,
} from "./placements/childPlacement"

export function captureSceneChild(child: StayInstantChild): SceneChildFragment {
  return {
    sourceId: child.id,
    className: child.className,
    shapes: snapshotShapeMap(child.shapeMap),
    placement: copyChildPlacement(child.placement),
  }
}

export function captureScene(children: StayInstantChild[], area: Area): SceneFragment {
  return {
    children: children.map(captureSceneChild),
    area: { ...area },
  }
}

export function materializeSceneChild(
  fragment: SceneChildFragment,
  canvas: Canvas
): StayInstantChild<InstantShape> {
  return new StayInstantChild({
    className: fragment.className,
    shape: snapshotShapeMap(fragment.shapes),
    placement: copyChildPlacementInput(fragment.placement),
    canvas,
  })
}

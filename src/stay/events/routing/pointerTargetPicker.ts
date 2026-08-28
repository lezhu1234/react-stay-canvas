import type { StayInstantChild } from "../../children/stayInstantChild"
import type {
  ChildIdentity,
  ChildPointHitRuntime,
} from "../../children/runtimeContracts"
import { stayInstantChildPointHits } from "../../children/stayInstantChildRuntime"
import type {
  CoordinateFrame,
  PointerCoordinates,
} from "../../coordinates/coordinateSystem"

export interface PointerTargetPicker<TChild> {
  hits(
    candidates: readonly TChild[],
    coordinates: PointerCoordinates,
    coordinateFrame: CoordinateFrame
  ): readonly TChild[]
}

export function createPointTargetPicker<TChild extends ChildIdentity>(
  rootChild: TChild,
  pointHits: ChildPointHitRuntime<TChild>
): PointerTargetPicker<TChild> {
  return {
    hits: (candidates, coordinates, coordinateFrame) =>
      candidates.filter((child) => {
        if (child === rootChild) {
          const { x, y } = coordinates.view
          const { width, height } = coordinateFrame.viewBounds
          return x >= 0 && y >= 0 && x <= width && y <= height
        }
        return pointHits.contains(child, coordinates.content)
      }),
  }
}

export function createCanvas2DPointerTargetPicker(
  rootChild: StayInstantChild,
  pointHits: ChildPointHitRuntime<StayInstantChild> = stayInstantChildPointHits
): PointerTargetPicker<StayInstantChild> {
  return createPointTargetPicker(rootChild, pointHits)
}

import type { InstantShape } from "../../shapes/instantShape"
import type { Rect } from "../../types/geometry"
import { hasIntersection } from "../../utils/geometry"
import type { StayInstantChild } from "../children/stayInstantChild"

export interface RenderItem {
  readonly child: StayInstantChild
  readonly shape: InstantShape
  readonly ordinal: number
}

export interface UpdatedChildShapes {
  readonly child: StayInstantChild
  readonly shapes: InstantShape[]
}

export interface LayerRenderPlan {
  readonly items: readonly RenderItem[]
  readonly updatedChildren: readonly UpdatedChildShapes[]
}

export function createLayerRenderPlan(
  children: readonly StayInstantChild[],
  layerIndex: number,
  visibleContentArea: Rect
): LayerRenderPlan {
  const collectedItems: RenderItem[] = []
  const updatedChildren: UpdatedChildShapes[] = []

  for (const child of children) {
    const shapes = child.getShapes(layerIndex)
    child.layerDraw(layerIndex)

    if (shapes.length > 0) {
      updatedChildren.push({ child, shapes })
    }

    for (const shape of shapes) {
      collectedItems.push({
        child,
        shape,
        ordinal: collectedItems.length,
      })
    }
  }

  const items = collectedItems
    .filter(({ child, shape }) =>
      hasIntersection(child.getShapeBound(shape), visibleContentArea))
    .sort((first, second) =>
      first.shape.zIndex - second.shape.zIndex || first.ordinal - second.ordinal)

  return { items, updatedChildren }
}

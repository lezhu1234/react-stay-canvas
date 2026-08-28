import type { InstantShape } from "../../shapes/instantShape"
import type { Rect } from "../../types/geometry"
import { hasIntersection } from "../../utils/geometry"
import type { StayInstantChild } from "../children/stayInstantChild"
import type { FiniteProjectiveMapping } from "../transforms/projective2D"

export interface ProjectiveMesh {
  readonly columns: number
  readonly rows: number
}

export interface ProjectiveRenderProjection {
  readonly mapping: FiniteProjectiveMapping
}

export interface ResolveProjectiveRenderProjection {
  (child: StayInstantChild, shape: InstantShape):
    ProjectiveRenderProjection | undefined
}

export interface RenderItem {
  readonly child: StayInstantChild
  readonly shape: InstantShape
  readonly ordinal: number
  readonly projection?: ProjectiveRenderProjection
}

/** @internal Resolves Child-owned placement at the synchronous draw boundary. */
export function resolveRenderItemProjection(
  item: RenderItem
): ProjectiveRenderProjection | undefined {
  if (item.projection) return item.projection
  const mapping = item.child.getProjectiveMapping()
  return mapping ? { mapping } : undefined
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
  visibleContentArea?: Rect,
  resolveProjection?: ResolveProjectiveRenderProjection
): LayerRenderPlan {
  const collectedItems: RenderItem[] = []
  const updatedChildren: UpdatedChildShapes[] = []

  for (const child of children) {
    const shapes = child.getShapes(layerIndex)

    if (shapes.length > 0) {
      updatedChildren.push({ child, shapes })
    }

    for (const shape of shapes) {
      collectedItems.push({
        child,
        shape,
        ordinal: collectedItems.length,
        // Resolver-owned projections are explicit internal overrides. Normal
        // Child placement stays live and is resolved only when the item draws.
        projection: resolveProjection?.(child, shape),
      })
    }
  }

  const visibleItems = visibleContentArea
    ? collectedItems.filter((item) => {
        const projection = resolveRenderItemProjection(item)
        return hasIntersection(
          projection?.mapping.contentBounds ?? item.child.getShapeBound(item.shape),
          visibleContentArea
        )
      })
    : collectedItems
  const items = visibleItems
    .sort((first, second) =>
      first.shape.zIndex - second.shape.zIndex || first.ordinal - second.ordinal)

  return { items, updatedChildren }
}

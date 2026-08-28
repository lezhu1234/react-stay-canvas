import type { DrawCanvasContext } from "../../types/canvas"
import {
  resolveRenderItemProjection,
  type ProjectiveMesh,
  type RenderItem,
} from "./renderPlan"
import { executeCanvas2DProjectiveItem } from "./projectiveCanvas2D"

interface Canvas2DRenderProps {
  readonly context: DrawCanvasContext
  readonly items: readonly RenderItem[]
  readonly getNow: () => number
  readonly width: number
  readonly height: number
  readonly forceDraw?: boolean
  readonly getProjectiveQuality?: (item: RenderItem) => {
    readonly mesh: ProjectiveMesh
    readonly rasterScale: number
  }
}

export function executeCanvas2DRenderPlan({
  context,
  items,
  getNow,
  width,
  height,
  forceDraw,
  getProjectiveQuality,
}: Canvas2DRenderProps) {
  for (const item of items) {
    const { child, shape } = item
    const projection = resolveRenderItemProjection(item)
    if (projection) {
      if (!getProjectiveQuality) {
        throw new Error("projective Canvas2D rendering requires explicit quality")
      }
      const projectiveItem = { ...item, projection }
      const quality = getProjectiveQuality(projectiveItem)
      executeCanvas2DProjectiveItem({
        context,
        shape,
        projection,
        rasterScale: quality.rasterScale,
        mesh: quality.mesh,
        now: getNow(),
        width,
        height,
        forceDraw,
      })
      continue
    }

    // Resolve at execution time to retain the current synchronous callback
    // contract: an earlier Shape may update a later Child before it is drawn.
    const { a, b, c, d, e, f } = child.getAffinePlacementMatrix()
    context.save()
    try {
      context.transform(a, b, c, d, e, f)
      shape.draw({
        context,
        now: getNow(),
        width,
        height,
        forchDraw: forceDraw,
      })
    } finally {
      context.restore()
    }
  }
}

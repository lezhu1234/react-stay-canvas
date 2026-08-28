import type { DrawCanvasContext } from "../../types/canvas"
import type { RenderItem } from "./renderPlan"
import { executeCanvas2DProjectiveItem } from "./projectiveCanvas2D"

interface Canvas2DRenderProps {
  readonly context: DrawCanvasContext
  readonly items: readonly RenderItem[]
  readonly getNow: () => number
  readonly width: number
  readonly height: number
  readonly forceDraw?: boolean
  readonly getProjectiveRasterScale?: (item: RenderItem) => number
}

export function executeCanvas2DRenderPlan({
  context,
  items,
  getNow,
  width,
  height,
  forceDraw,
  getProjectiveRasterScale,
}: Canvas2DRenderProps) {
  for (const item of items) {
    const { child, shape, projection } = item
    if (projection) {
      if (!getProjectiveRasterScale) {
        throw new Error("projective Canvas2D rendering requires an explicit raster scale")
      }
      executeCanvas2DProjectiveItem({
        context,
        shape,
        projection,
        rasterScale: getProjectiveRasterScale(item),
        now: getNow(),
        width,
        height,
        forceDraw,
      })
      continue
    }

    // Resolve at execution time to retain the current synchronous callback
    // contract: an earlier Shape may update a later Child before it is drawn.
    const { a, b, c, d, e, f } = child.getTransformMatrix()
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

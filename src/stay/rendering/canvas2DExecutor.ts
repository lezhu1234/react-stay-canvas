import type { DrawCanvasContext } from "../../types/canvas"
import type { RenderItem } from "./renderPlan"

interface Canvas2DRenderProps {
  readonly context: DrawCanvasContext
  readonly items: readonly RenderItem[]
  readonly now: number
  readonly width: number
  readonly height: number
}

export function executeCanvas2DRenderPlan({
  context,
  items,
  now,
  width,
  height,
}: Canvas2DRenderProps) {
  for (const { child, shape } of items) {
    // Resolve at execution time to retain the current synchronous callback
    // contract: an earlier Shape may update a later Child before it is drawn.
    const { a, b, c, d, e, f } = child.getTransformMatrix()
    context.save()
    try {
      context.transform(a, b, c, d, e, f)
      shape.draw({ context, now, width, height })
    } finally {
      context.restore()
    }
  }
}

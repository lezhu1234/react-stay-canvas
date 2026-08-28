import type { CoordinateFrame } from "../coordinates/coordinateSystem"
import { executeCanvas2DRenderPlan } from "./canvas2DExecutor"
import {
  assertProjectiveShapeCanRasterize,
  createRasterSurface,
} from "./projectiveRaster"
import {
  resolveRenderItemProjection,
  type RenderItem,
} from "./renderPlan"

interface WebGLAffineBatchProps {
  readonly targetCanvas: HTMLCanvasElement | OffscreenCanvas
  readonly rasterWidth: number
  readonly rasterHeight: number
  readonly logicalWidth: number
  readonly logicalHeight: number
  readonly contentToView: CoordinateFrame["contentToView"]
  readonly items: readonly RenderItem[]
  readonly requiresSourceOver: boolean
  readonly getNow: () => number
  readonly forceDraw?: boolean
}

/**
 * @internal Renders the affine prefix of one candidate run. A synchronous
 * callback may turn a later Child projective, so the returned count—not the
 * candidate length—owns the execution boundary.
 */
export function rasterizeWebGLAffineBatch({
  targetCanvas,
  rasterWidth,
  rasterHeight,
  logicalWidth,
  logicalHeight,
  contentToView,
  items,
  requiresSourceOver,
  getNow,
  forceDraw,
}: WebGLAffineBatchProps) {
  const surface = createRasterSurface(targetCanvas, rasterWidth, rasterHeight)
  const backingScaleX = rasterWidth / logicalWidth
  const backingScaleY = rasterHeight / logicalHeight

  surface.context.save()
  try {
    surface.context.setTransform(
      backingScaleX * contentToView.scale,
      0,
      0,
      backingScaleY * contentToView.scale,
      backingScaleX * contentToView.offsetX,
      backingScaleY * contentToView.offsetY
    )
    let consumed = 0
    let consumedAllSourceOver = true
    for (const item of items) {
      if (resolveRenderItemProjection(item)) break
      const usesSourceOver = item.shape.globalConfig.gco === "source-over"
      // Earlier Shape callbacks may mutate later Shape state synchronously.
      // Recheck at the exact execution boundary so a mixed pass never applies
      // destination-dependent composition inside an isolated affine texture.
      if (requiresSourceOver) assertProjectiveShapeCanRasterize(item.shape)
      executeCanvas2DRenderPlan({
        context: surface.context,
        items: [item],
        getNow,
        width: logicalWidth,
        height: logicalHeight,
        forceDraw,
      })
      consumed += 1
      consumedAllSourceOver &&= usesSourceOver
    }
    return { canvas: surface.canvas, consumed, consumedAllSourceOver }
  } finally {
    surface.context.restore()
  }
}

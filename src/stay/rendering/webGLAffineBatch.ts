import type { CoordinateFrame } from "../coordinates/coordinateSystem"
import { executeCanvas2DRenderPlan } from "./canvas2DExecutor"
import {
  assertProjectiveShapeCanRasterize,
  createRasterSurface,
} from "./projectiveRaster"
import type { RenderItem } from "./renderPlan"

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

/** @internal Renders one consecutive affine run into a transparent layer-sized texture. */
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
    for (const item of items) {
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
    }
  } finally {
    surface.context.restore()
  }
  return surface.canvas
}

import type {
  DrawCanvasContext,
} from "../../types/canvas"
import {
  resizeLayerSurface,
  type CanvasLayerSurface,
  type LayerSurfaceResize,
} from "./layerSurface"

interface ContentToViewFrame {
  readonly offsetX: number
  readonly offsetY: number
  readonly scale: number
}

function clearContext(
  context: DrawCanvasContext,
  width: number,
  height: number
) {
  context.save()
  try {
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, width, height)
  } finally {
    context.restore()
  }
}

/** @internal Owns the Canvas2D lifecycle of one existing canvas surface. */
export class Canvas2DLayerRuntime {
  readonly backend = "canvas2d"
  context!: DrawCanvasContext

  constructor(
    readonly surface: CanvasLayerSurface,
    private readonly resolveConfiguredContext: (
      surface: CanvasLayerSurface
    ) => DrawCanvasContext | null,
    private readonly index: number
  ) {}

  resizeBackingStore(resize: LayerSurfaceResize) {
    resizeLayerSurface(this.surface, resize)
  }

  isDrawable() {
    return true
  }

  destroy() {}

  resolveContext() {
    const context = this.resolveConfiguredContext(this.surface)
    if (!context) {
      throw new Error(`Unable to get drawing context for layer ${this.index}`)
    }
    this.context = context
    return context
  }

  clear(context: DrawCanvasContext) {
    this.context = context
    clearContext(
      context,
      this.surface.width,
      this.surface.height
    )
  }

  withFrame(
    context: DrawCanvasContext,
    logicalWidth: number,
    logicalHeight: number,
    transform: ContentToViewFrame,
    draw: (context: DrawCanvasContext) => void
  ) {
    this.context = context
    const backingScaleX = this.surface.width / logicalWidth
    const backingScaleY = this.surface.height / logicalHeight

    context.save()
    try {
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, this.surface.width, this.surface.height)
      context.setTransform(
        backingScaleX * transform.scale,
        0,
        0,
        backingScaleY * transform.scale,
        backingScaleX * transform.offsetX,
        backingScaleY * transform.offsetY
      )
      draw(context)
    } finally {
      context.restore()
    }
  }
}

/** @internal Preserves Canvas.clear() behavior for an unowned context. */
export function clearUnownedCanvas2DContext(
  context: DrawCanvasContext,
  width: number,
  height: number
) {
  clearContext(context, width, height)
}

import type {
  CanvasLayerConfig,
  DrawCanvasContext,
} from "./types/canvas"
import type { ViewPoint } from "./types/coordinates"
import type { Rect } from "./types/geometry"
import type { SurfaceMetrics } from "./stay/coordinates/coordinateSystem"
import { clearUnownedCanvas2DContext } from "./stay/rendering/canvas2DLayerRuntime"
import {
  createLayerRuntime,
  type LayerRuntime,
} from "./stay/rendering/layerRuntime"

type CanvasRenderContext = DrawCanvasContext | WebGLRenderingContext

export class Canvas {
  contexts: CanvasRenderContext[]
  height: number
  layers: HTMLCanvasElement[]
  status: string
  width: number
  bound: Rect
  private readonly layerRuntimes: LayerRuntime[]
  private layerInvalidationListener?: (layerIndex: number) => void

  constructor(
    layers: HTMLCanvasElement[],
    layerConfigs: CanvasLayerConfig[],
    width: number,
    height: number
  ) {
    if (layers.length < 1) {
      throw new Error("Canvas must have at least one layer")
    }
    this.layers = layers
    if (layerConfigs.length !== layers.length) {
      throw new Error("Canvas layer configuration count must match its elements")
    }
    const layerRuntimes: LayerRuntime[] = []
    try {
      layers.forEach((layer, index) => {
        layerRuntimes.push(createLayerRuntime(
          layer,
          layerConfigs[index],
          index,
          () => this.layerInvalidationListener?.(index)
        ))
      })
    } catch (error) {
      layerRuntimes.forEach((layer) => layer.destroy())
      throw error
    }
    this.layerRuntimes = layerRuntimes
    this.width = width
    this.height = height
    this.status = "default"
    this.contexts = []

    this.bound = {
      x: 0,
      y: 0,
      width: this.width,
      height: this.height,
    }

    try {
      this.init()
    } catch (error) {
      this.layerRuntimes.forEach((layer) => layer.destroy())
      throw error
    }
  }

  get x(): number {
    return this.layers[0].getBoundingClientRect().x
  }
  get y(): number {
    return this.layers[0].getBoundingClientRect().y
  }

  clientToCanvasPoint(clientX: number, clientY: number): ViewPoint {
    const rect = this.getSurfaceMetrics().clientRect
    const scaleX = rect.width > 0 ? this.width / rect.width : 1
    const scaleY = rect.height > 0 ? this.height / rect.height : 1
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    }
  }

  public clear(context: DrawCanvasContext) {
    const layerRuntime = this.layerRuntimes[this.contexts.indexOf(context)]
    if (layerRuntime?.backend === "canvas2d") {
      layerRuntime.clear(context)
      return
    }
    clearUnownedCanvas2DContext(context, this.width, this.height)
  }

  getSurfaceMetrics(): SurfaceMetrics {
    const layer = this.layers[this.layers.length - 1]
    const rect = layer.getBoundingClientRect()
    return {
      logicalWidth: this.width,
      logicalHeight: this.height,
      backingWidth: layer.width,
      backingHeight: layer.height,
      clientRect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
    }
  }

  withLayerFrame(
    layerIndex: number,
    transform: { offsetX: number; offsetY: number; scale: number },
    draw: (context: DrawCanvasContext) => void
  ) {
    const runtime = this.layerRuntimes[layerIndex]
    if (runtime.backend !== "canvas2d") {
      throw new Error(`Layer ${layerIndex} is not a Canvas2D layer`)
    }
    runtime.withFrame(
      runtime.context,
      this.width,
      this.height,
      transform,
      draw
    )
  }

  getLayerBackend(layerIndex: number) {
    return this.layerRuntimes[layerIndex].backend
  }

  getWebGLContext(layerIndex: number) {
    const runtime = this.layerRuntimes[layerIndex]
    if (runtime.backend !== "webgl") {
      throw new Error(`Layer ${layerIndex} is not a WebGL layer`)
    }
    return runtime.context
  }

  isLayerDrawable(layerIndex: number) {
    return this.layerRuntimes[layerIndex].isDrawable()
  }

  setLayerInvalidationListener(listener: (layerIndex: number) => void) {
    this.layerInvalidationListener = listener
  }

  init() {
    this.resize(this.width, this.height)
  }

  resize(width: number, height: number) {
    this.width = width
    this.height = height
    this.bound = { x: 0, y: 0, width, height }

    this.layerRuntimes.forEach((layer) => layer.resizeBackingStore(width, height))

    // Changing a Canvas backing-store size resets its context state. Resolve
    // every configured context again after sizing so custom setters can
    // restore the state they own without recreating the Stay runtime.
    this.contexts = this.layerRuntimes.map((layer) => layer.resolveContext())
  }

  destroy() {
    this.layerInvalidationListener = undefined
    this.layerRuntimes.forEach((layer) => layer.destroy())
  }
}

export default Canvas

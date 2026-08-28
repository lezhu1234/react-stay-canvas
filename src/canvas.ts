import type { ContextLayerSetFunction, DrawCanvasContext } from "./types/canvas"
import type { ViewPoint } from "./types/coordinates"
import type { Rect } from "./types/geometry"
import type { SurfaceMetrics } from "./stay/coordinates/coordinateSystem"
import {
  Canvas2DLayerRuntime,
  clearUnownedCanvas2DContext,
} from "./stay/rendering/canvas2DLayerRuntime"

export class Canvas {
  contexts: DrawCanvasContext[]
  height: number
  layers: HTMLCanvasElement[]
  status: string
  width: number
  bound: Rect
  private readonly layerRuntimes: Canvas2DLayerRuntime[]

  constructor(
    layers: HTMLCanvasElement[],
    contextLayerSetFunctionList: ContextLayerSetFunction[],
    width: number,
    height: number
  ) {
    if (layers.length < 1) {
      throw new Error("Canvas must have at least one layer")
    }
    this.layers = layers
    this.layerRuntimes = layers.map((layer, index) =>
      new Canvas2DLayerRuntime(
        layer,
        contextLayerSetFunctionList[index],
        index
      ))
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

    this.init()
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
    if (layerRuntime) {
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
    this.layerRuntimes[layerIndex].withFrame(
      this.contexts[layerIndex],
      this.width,
      this.height,
      transform,
      draw
    )
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
}

export default Canvas

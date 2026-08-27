import type { ContextLayerSetFunction, DrawCanvasContext } from "./types/canvas"
import type { ViewPoint } from "./types/coordinates"
import type { Rect } from "./types/geometry"
import type { SurfaceMetrics } from "./stay/coordinates/coordinateSystem"

function sizeBackingStore(
  canvas: HTMLCanvasElement,
  width: number,
  height: number
) {
  const dpr = window.devicePixelRatio || 1

  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)

  // Set the "drawn" size of the canvas
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
}

export class Canvas {
  contexts: DrawCanvasContext[]
  height: number
  layers: HTMLCanvasElement[]
  status: string
  width: number
  bound: Rect
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
    this.width = width
    this.height = height
    this.status = "default"
    this.contexts = layers.map((layer, i) => {
      const context = contextLayerSetFunctionList[i](layer)
      if (!context) {
        throw new Error(`Unable to get drawing context for layer ${i}`)
      }
      return context
    })

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
    const layer = this.layers[this.contexts.indexOf(context)]
    context.save()
    try {
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, layer?.width ?? this.width, layer?.height ?? this.height)
    } finally {
      context.restore()
    }
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
    const layer = this.layers[layerIndex]
    const context = this.contexts[layerIndex]
    const backingScaleX = layer.width / this.width
    const backingScaleY = layer.height / this.height

    context.save()
    try {
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, layer.width, layer.height)
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

  init() {
    this.layers.forEach((layer) => {
      sizeBackingStore(layer, this.width, this.height)
    })
  }
}

export default Canvas

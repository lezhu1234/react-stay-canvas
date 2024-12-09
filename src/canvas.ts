import { ContextLayerSetFunction, DrawCanvasContext } from "./types"

function dprScale(
  canvas: HTMLCanvasElement,
  ctx: DrawCanvasContext,
  width: number,
  height: number
) {
  // Get the DPR and size of the canvas
  const dpr = window.devicePixelRatio

  // Set the "actual" size of the canvas
  canvas.width = width * dpr
  canvas.height = height * dpr

  // Scale the context to ensure correct drawing operations
  ctx.scale(dpr, dpr)

  // Set the "drawn" size of the canvas
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
}

class Canvas {
  contexts: DrawCanvasContext[]
  height: number
  layers: HTMLCanvasElement[]
  status: string
  width: number
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
      return contextLayerSetFunctionList[i](layer) as DrawCanvasContext
    })

    this.init()
  }

  get x(): number {
    return this.layers[0].getBoundingClientRect().x
  }
  get y(): number {
    return this.layers[0].getBoundingClientRect().y
  }

  public clear(context: DrawCanvasContext) {
    context.clearRect(0, 0, this.width, this.height)
  }

  init() {
    this.layers.forEach((layer, i) => {
      dprScale(layer, this.contexts[i], this.width, this.height)
    })
  }
}

export default Canvas

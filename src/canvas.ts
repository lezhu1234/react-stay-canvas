import { ContextLayerSetFunction } from "./types"

class Canvas {
  contexts: CanvasRenderingContext2D[]
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
      return contextLayerSetFunctionList[i](layer) as CanvasRenderingContext2D
    })

    this.init()
  }

  get x(): number {
    return this.layers[0].getBoundingClientRect().x
  }
  get y(): number {
    return this.layers[0].getBoundingClientRect().y
  }

  public clear(context: CanvasRenderingContext2D) {
    context.clearRect(0, 0, this.width, this.height)
  }

  init() {}
}

export default Canvas

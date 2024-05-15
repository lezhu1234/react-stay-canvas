class Canvas {
  contexts: CanvasRenderingContext2D[]
  height: number
  layers: HTMLCanvasElement[]
  status: string
  width: number
  x: number
  y: number
  constructor(layers: HTMLCanvasElement[], width: number, height: number) {
    if (layers.length < 1) {
      throw new Error("Canvas must have at least one layer")
    }
    this.layers = layers
    this.width = width
    this.height = height
    this.status = "default"
    this.contexts = layers.map(
      (layer) => layer.getContext("2d") as CanvasRenderingContext2D
    )

    const { x, y } = this.layers[0].getBoundingClientRect()
    // this.drawCanvas.getClientRects
    this.x = x
    this.y = y
    this.init()
  }

  public clear(context: CanvasRenderingContext2D) {
    context.clearRect(0, 0, this.width, this.height)
  }

  init() {}
}

export default Canvas

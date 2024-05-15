class Canvas {
  drawCanvas: HTMLCanvasElement
  drawContext: CanvasRenderingContext2D
  drawData: ImageData
  height: number
  mainCanvas: HTMLCanvasElement
  mainContext: CanvasRenderingContext2D
  mainData: ImageData
  status: string
  width: number
  x: number
  y: number
  constructor(
    drawCanvas: HTMLCanvasElement,
    mainCanvas: HTMLCanvasElement,
    width: number,
    height: number
  ) {
    this.drawCanvas = drawCanvas
    this.mainCanvas = mainCanvas
    this.width = width
    this.height = height
    this.status = "default"
    this.drawContext = this.drawCanvas.getContext(
      "2d"
    ) as CanvasRenderingContext2D
    this.mainContext = this.mainCanvas.getContext(
      "2d"
    ) as CanvasRenderingContext2D

    this.drawData = this.drawContext.getImageData(0, 0, width, height)
    this.mainData = this.mainContext.getImageData(0, 0, width, height)

    const { x, y } = this.drawCanvas.getBoundingClientRect()
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

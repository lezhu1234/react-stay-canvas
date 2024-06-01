import { SHAPE_DRAW_TYPES } from "../userConstants"
import { Point } from "./point"
import { Rectangle } from "./rectangle"
import { Shape, ShapeDrawProps, ShapeProps } from "./shape"

interface TextAttr {
  x: number
  y: number
  text: string
  font?: string
  props?: ShapeProps
}
export class Text extends Shape {
  font: string
  height: number
  leftBottom: Point
  leftTop: Point
  rect: Rectangle
  text: string
  width: number
  x: number
  y: number

  constructor({ x, y, text, font, props }: TextAttr) {
    super(props || { type: SHAPE_DRAW_TYPES.FILL })
    this.text = text
    this.font = font || ""
    this.x = x
    this.y = y
    this.width = 0
    this.height = 0
    this.rect = new Rectangle({ x: 0, y: 0, width: 0, height: 0 })
    this.leftBottom = new Point(0, 0)
    this.leftTop = new Point(0, 0)

    this.init()
  }

  contains(point: Point): boolean {
    return this.rect.contains(point)
  }

  copy(): Shape {
    return new Text({
      x: this.x,
      y: this.y,
      text: this.text,
      font: this.font,
      props: this._copy(),
    })
  }

  draw({ context }: ShapeDrawProps): void {
    context.font = this.font
    this.init(context)

    if (this.type === SHAPE_DRAW_TYPES.FILL) {
      context.fillText(this.text, this.leftBottom.x, this.leftBottom.y)
    } else if (this.type === SHAPE_DRAW_TYPES.STROKE) {
      context.strokeText(this.text, this.leftBottom.x, this.leftBottom.y)
    }
    // this.rect.update({ props: { color: "red" } })
    // this.rect.draw(ctx)
  }

  init(ctx?: CanvasRenderingContext2D | undefined) {
    let context: CanvasRenderingContext2D | undefined = ctx
    if (!ctx) {
      context = document.createElement("canvas").getContext("2d")!
    }

    const text = context!.measureText(this.text) // TextMetrics object
    this.width = text.width
    this.height = text.actualBoundingBoxAscent + text.actualBoundingBoxDescent

    this.leftTop.update({ x: this.x - this.width / 2, y: this.y - this.height / 2 })
    this.leftBottom.update({ x: this.x - this.width / 2, y: this.y + this.height / 2 })
    this.rect.update({
      x: this.leftTop.x,
      y: this.leftTop.y,
      width: this.width,
      height: this.height,
    })
  }

  move(offsetX: number, offsetY: number): void {
    this.update({ x: this.x + offsetX, y: this.y + offsetY })
  }

  update({ x = this.x, y = this.y, font = this.font, text = this.text, props }: Partial<TextAttr>) {
    this.x = x
    this.y = y
    this.font = font
    this.text = text
    this._update(props || {})
    this.init()
    return this
  }

  zoom(zoomScale: number): void {
    const center = this.getZoomPoint(zoomScale, new Point(this.x, this.y))
    this.update({
      x: center.x,
      y: center.y,
    })
  }
}

import { SHAPE_DRAW_TYPES } from "../userConstants"
import { Border, DiagonalDirection, FourrDirection, ShapeDrawProps, TextAttr } from "../userTypes"
import { Point } from "./point"
import { Rectangle } from "./rectangle"
import { Shape } from "./shape"

export class StayText extends Shape {
  font: string
  height: number
  leftBottom: Point
  leftTop: Point
  rect: Rectangle
  text: string
  width: number
  x: number
  y: number
  border: Border[] | undefined
  rightBottom: Point
  rightTop: Point
  textBaseline: CanvasTextBaseline
  textAlign: CanvasTextAlign
  offsetXRatio: number
  offsetYRatio: number

  constructor({
    x,
    y,
    text,
    font,
    border,
    textBaseline,
    textAlign,
    offsetXRatio,
    offsetYRatio,
    props,
  }: TextAttr) {
    super(props || { type: SHAPE_DRAW_TYPES.FILL })
    this.text = text
    this.font = font || ""
    this.x = x
    this.y = y
    this.width = 0
    this.height = 0
    this.border = border
    this.offsetXRatio = offsetXRatio ?? 0
    this.offsetYRatio = offsetYRatio ?? 0
    this.textBaseline = textBaseline ?? "alphabetic"
    this.textAlign = textAlign ?? "start"
    this.rect = new Rectangle({ x: 0, y: 0, width: 0, height: 0 })
    this.leftBottom = new Point(0, 0)
    this.leftTop = new Point(0, 0)
    this.rightBottom = new Point(0, 0)
    this.rightTop = new Point(0, 0)

    this.init()
  }

  contains(point: Point): boolean {
    return this.rect.contains(point)
  }

  copy(): Shape {
    return new StayText({
      x: this.x,
      y: this.y,
      text: this.text,
      font: this.font,
      border: this.border,
      props: this._copy(),
    })
  }

  draw({ context }: ShapeDrawProps): void {
    context.font = this.font
    context.textBaseline = this.textBaseline
    context.textAlign = this.textAlign
    this.init(context)

    if (this.type === SHAPE_DRAW_TYPES.FILL) {
      context.fillText(this.text, this.leftBottom.x, this.leftBottom.y)
    } else if (this.type === SHAPE_DRAW_TYPES.STROKE) {
      context.strokeText(this.text, this.leftBottom.x, this.leftBottom.y)
    }

    if (this.border) {
      this.border.forEach((border) => {
        context.strokeStyle = border.color || "black"
        context.lineWidth = border.size || 1
        context.setLineDash(border.type === "dashed" ? [5, 5] : [])
        if (border.direction === "left") {
          context.beginPath()
          context.moveTo(this.leftTop.x, this.leftTop.y)
          context.lineTo(this.leftBottom.x, this.leftBottom.y)
          context.stroke()
        } else if (border.direction === "right") {
          context.beginPath()
          context.moveTo(this.rightTop.x, this.rightTop.y)
          context.lineTo(this.rightBottom.x, this.rightBottom.y)
          context.stroke()
        } else if (border.direction === "top") {
          context.beginPath()
          context.moveTo(this.leftTop.x, this.leftTop.y)
          context.lineTo(this.rightTop.x, this.rightTop.y)
          context.stroke()
        } else if (border.direction === "bottom") {
          context.beginPath()
          context.moveTo(this.leftBottom.x, this.leftBottom.y)
          context.lineTo(this.rightBottom.x, this.rightBottom.y)
          context.stroke()
        }
      })
    }
    // this.rect.update({ props: { color: "red" } })
    // this.rect.draw(ctx)
  }

  init(ctx?: CanvasRenderingContext2D | undefined) {
    let context: CanvasRenderingContext2D | undefined = ctx
    if (!ctx) {
      context = document.createElement("canvas").getContext("2d")!
      context.font = this.font
      context.textBaseline = this.textBaseline
      context.textAlign = this.textAlign
    }

    const text = context!.measureText(this.text) // TextMetrics object
    this.width = text.width
    this.height = text.fontBoundingBoxAscent + text.fontBoundingBoxDescent

    const offsetX = -this.width / 2 + this.width * this.offsetXRatio
    const offsetY = -this.height / 2 + this.height * this.offsetYRatio

    this.leftTop.update({ x: this.x + offsetX, y: this.y + offsetY })
    this.leftBottom.update({ x: this.x + offsetX, y: this.y + this.height + offsetY })
    this.rightTop.update({ x: this.x + this.width + offsetX, y: this.y + offsetY })
    this.rightBottom.update({ x: this.x + this.width + offsetX, y: this.y + this.height + offsetY })

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

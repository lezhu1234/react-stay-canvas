import { SHAPE_DRAW_TYPES } from "../userConstants"
import {
  Border,
  DiagonalDirection,
  EasingFunction,
  Font,
  FourrDirection,
  ShapeDrawProps,
  TextAttr,
} from "../userTypes"
import { getDefaultFont, getRGBAStr } from "../utils"
import { SimplePoint } from "./point"
import { Rectangle } from "./rectangle"
import { Shape } from "./shape"

export class StayText extends Shape {
  font: Required<Font>
  height: number
  leftBottom: SimplePoint
  leftTop: SimplePoint
  // rect: Rectangle
  text: string
  width: number
  x: number
  y: number
  border: Border[] | undefined
  rightBottom: SimplePoint
  rightTop: SimplePoint
  textBaseline: CanvasTextBaseline
  textAlign: CanvasTextAlign
  offsetXRatio: number
  offsetYRatio: number
  textObj: TextMetrics | undefined

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
    textObj,
  }: TextAttr) {
    super(props || { type: SHAPE_DRAW_TYPES.FILL })
    this.text = text
    this.font = getDefaultFont(font)
    this.x = x
    this.y = y
    this.width = 0
    this.height = 0
    this.border = border
    this.offsetXRatio = offsetXRatio ?? 0
    this.offsetYRatio = offsetYRatio ?? 0
    this.textBaseline = textBaseline ?? "alphabetic"
    this.textAlign = textAlign ?? "start"
    // this.rect = new Rectangle({ x: 0, y: 0, width: 0, height: 0 })
    this.leftBottom = new SimplePoint(0, 0)
    this.leftTop = new SimplePoint(0, 0)
    this.rightBottom = new SimplePoint(0, 0)
    this.rightTop = new SimplePoint(0, 0)
    this.textObj = textObj

    this.init()
  }

  contains(point: SimplePoint): boolean {
    // return this.rect.contains(point)
    return false
  }

  copy(): Shape {
    return new StayText({
      x: this.x,
      y: this.y,
      text: this.text,
      font: this.font,
      border: this.border,
      textBaseline: this.textBaseline,
      textAlign: this.textAlign,
      offsetXRatio: this.offsetXRatio,
      offsetYRatio: this.offsetYRatio,
      props: this._copy(),
    })
  }

  get fontStr() {
    const { size, fontFamily, fontWeight, italic } = this.font
    return `${fontWeight} ${italic ? "italic" : ""} ${size ?? 16}px ${fontFamily ?? "monospace"}`
  }

  draw({ context, canvas }: ShapeDrawProps): void {
    if (
      this.leftTop.x > canvas.width ||
      this.leftTop.y > canvas.height ||
      this.rightBottom.x < 0 ||
      this.rightBottom.y < 0
    ) {
      return
    }

    context.font = this.fontStr
    context.textBaseline = this.textBaseline
    context.textAlign = this.textAlign
    this.init(context)

    this.setContextColor(context, getRGBAStr(this.font.backgroundColor))
    context.fillRect(this.leftTop.x, this.leftTop.y, this.width, this.height)
    this.setContextColor(context, this.colorStringOrCanvasGradient)

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

  static get tempContext() {
    return document.createElement("canvas").getContext("2d")
  }

  init(ctx?: CanvasRenderingContext2D | undefined) {
    if (!this.textObj) {
      let context: CanvasRenderingContext2D | undefined = ctx
      if (!ctx) {
        context = StayText.tempContext!
        context.font = this.fontStr
        context.textBaseline = this.textBaseline
        context.textAlign = this.textAlign
      }

      this.textObj = context!.measureText(this.text) // TextMetrics object
    }

    this.width = this.textObj.width
    this.height = this.textObj.fontBoundingBoxAscent + this.textObj.fontBoundingBoxDescent

    const offsetX = -this.width / 2 + this.width * this.offsetXRatio
    const offsetY = this.height * this.offsetYRatio

    this.leftTop.update({ x: this.x + offsetX, y: this.y + offsetY })
    this.leftBottom.update({ x: this.x + offsetX, y: this.y + this.height + offsetY })
    this.rightTop.update({ x: this.x + this.width + offsetX, y: this.y + offsetY })
    this.rightBottom.update({ x: this.x + this.width + offsetX, y: this.y + this.height + offsetY })

    // this.rect.update({
    //   x: this.leftTop.x,
    //   y: this.leftTop.y,
    //   width: this.width,
    //   height: this.height,
    // })
  }

  move(offsetX: number, offsetY: number): void {
    this.update({ x: this.x + offsetX, y: this.y + offsetY })
  }

  update({
    x,
    y,
    font,
    text,
    border,
    textBaseline,
    textAlign,
    offsetXRatio,
    offsetYRatio,
    props,
    textObj,
  }: Partial<TextAttr>) {
    this.x = x ?? this.x
    this.y = y ?? this.y
    this.font = { ...this.font, ...font }
    this.text = text ?? this.text
    this.border = border ?? this.border
    this.textBaseline = textBaseline ?? this.textBaseline
    this.textAlign = textAlign ?? this.textAlign
    this.offsetXRatio = offsetXRatio ?? this.offsetXRatio
    this.offsetYRatio = offsetYRatio ?? this.offsetYRatio
    this.textObj = textObj
    this._update(props || {})
    this.init()
    return this
  }

  getCenterPoint() {
    return new SimplePoint(
      (this.leftBottom.x + this.rightBottom.x) / 2,
      (this.leftTop.y + this.leftBottom.y) / 2
    )
  }

  zoom(zoomScale: number): void {
    const center = this.getZoomPoint(zoomScale, new SimplePoint(this.x, this.y))
    this.update({
      x: center.x,
      y: center.y,
    })
  }

  intermediateState(
    before: StayText,
    after: StayText,
    ratio: number,
    transitionType: EasingFunction,
    canvas: HTMLCanvasElement
  ) {
    const x = this.getNumberIntermediateState(before.x, after.x, ratio, transitionType)

    if (x < -this.width || x > canvas.width) {
      return false
    }

    const y = this.getNumberIntermediateState(before.y, after.y, ratio, transitionType)

    if (y < -this.height || y > canvas.height) {
      return false
    }

    const font = this.getFontIntermediateState(before.font, after.font, ratio, transitionType)
    return new StayText({
      x,
      y,
      text: after.text,
      font,
      border: after.border,
      offsetXRatio: this.getNumberIntermediateState(
        before.offsetXRatio,
        after.offsetXRatio,
        ratio,
        transitionType
      ),
      offsetYRatio: this.getNumberIntermediateState(
        before.offsetYRatio,
        after.offsetYRatio,
        ratio,
        transitionType
      ),
      textAlign: after.textAlign,
      textBaseline: after.textBaseline,
      props: this.getIntermediateProps(before, after, ratio, transitionType),
    })
  }
}

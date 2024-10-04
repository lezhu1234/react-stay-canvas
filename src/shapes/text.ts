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
import { getDefaultFont, getRGBAStr, isRGB, isRGBA } from "../utils"
import { rgbaToString } from "../w3color"
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
    width,
    height,
  }: TextAttr) {
    super(props || { type: SHAPE_DRAW_TYPES.FILL })
    this.text = text
    this.font = getDefaultFont(font)
    this.x = x
    this.y = y

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
    const size = this.getSize(width, height)
    this.width = size.width
    this.height = size.height

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
    // this.init(context)

    let c: string | CanvasGradient
    if (isRGBA(this.font.backgroundColor)) {
      c = rgbaToString(this.font.backgroundColor)
    } else {
      c = this.font.backgroundColor
    }

    this.setContextColor(context, c, SHAPE_DRAW_TYPES.FILL)
    context.fillRect(this.leftTop.x, this.leftTop.y, this.width, this.height)
    this.setContextColor(context, this.colorStringOrCanvasGradient, this.type)

    if (this.type === SHAPE_DRAW_TYPES.FILL) {
      context.fillText(this.text, this.leftBottom.x, this.leftBottom.y)
    } else if (this.type === SHAPE_DRAW_TYPES.STROKE) {
      context.strokeText(this.text, this.leftBottom.x, this.leftBottom.y)
    }

    if (this.font.strikethrough) {
      context.lineWidth = this.height / 10
      context.strokeStyle = this.colorStringOrCanvasGradient
      context.beginPath()
      context.moveTo(this.leftTop.x, this.leftTop.y + this.height / 2)
      context.lineTo(this.rightBottom.x, this.leftTop.y + this.height / 2)
      context.stroke()
    }
    if (this.font.underline) {
      context.lineWidth = this.height / 10
      context.strokeStyle = this.colorStringOrCanvasGradient
      context.beginPath()
      context.moveTo(this.leftBottom.x, this.leftBottom.y)
      context.lineTo(this.rightBottom.x, this.leftBottom.y)
      context.stroke()
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

  // static get tempContext() {
  //   return document.createElement("canvas").getContext("2d")
  // }
  static tempContext =
    typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null

  getSize(width?: number, height?: number) {
    if (width !== undefined && height !== undefined) {
      return { width, height }
    }
    const context = StayText.tempContext!
    context.font = this.fontStr
    context.textBaseline = this.textBaseline
    context.textAlign = this.textAlign

    const textObj = context!.measureText(this.text) // TextMetrics object
    return {
      width: textObj.width,
      height: textObj.fontBoundingBoxAscent + textObj.fontBoundingBoxDescent,
    }
  }
  init(ctx?: CanvasRenderingContext2D | undefined) {
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
    width,
    height,
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
    const size = this.getSize(width, height)
    this.width = size.width
    this.height = size.height
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
      font: { size: this.font.size * zoomScale },
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
    const width = this.getNumberIntermediateState(before.width, after.width, ratio, transitionType)

    if (x < -width || x > canvas.width) {
      return false
    }

    const y = this.getNumberIntermediateState(before.y, after.y, ratio, transitionType)
    const height = this.getNumberIntermediateState(
      before.height,
      after.height,
      ratio,
      transitionType
    )

    if (y < -height || y > canvas.height) {
      return false
    }

    const font = this.getFontIntermediateState(before.font, after.font, ratio, transitionType)
    const props = this.getIntermediateProps(before, after, ratio, transitionType)
    let text = after.text

    if (
      before.text !== after.text
      && isRGBA(before.color)
      && isRGBA(after.color)
      && isRGBA(props.color)
    ) {
      let color = props.color
      if (ratio > 0.5) {
        const opacity = this.getNumberIntermediateState(
          0,
          after.color.a,
          (ratio - 0.5) * 2,
          transitionType
        )
        color = { ...color, a: opacity }
      } else {
        text = before.text
        const opacity = this.getNumberIntermediateState(
          0,
          before.color.a,
          (0.5 - ratio) * 2,
          transitionType
        )
        color = { ...color, a: opacity }
      }
      props.color = color
    }
    return new StayText({
      x,
      y,
      text,
      font,
      width,
      height,
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
      props: { ...props },
    })
  }
}

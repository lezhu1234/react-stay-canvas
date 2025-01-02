import { DrawCanvasContext } from "../types"
import { SHAPE_DRAW_TYPES } from "../userConstants"
import {
  Border,
  Coordinate,
  DiagonalDirection,
  EasingFunction,
  Font,
  FourrDirection,
  Rect,
  ShapeDrawProps,
  TextAttr,
} from "../userTypes"
import { getDefaultFont, getRGBAStr, isRGB, isRGBA } from "../utils"
import { rgbaToString } from "../w3color"
import { InstantShape } from "./instantShape"
import { Rectangle } from "./rectangle"

export class StayText extends InstantShape {
  getBound(): Rect {
    throw new Error("Method not implemented.")
  }
  font: Required<Font>
  height: number
  leftBottom: Coordinate
  leftTop: Coordinate
  // rect: Rectangle
  text: string
  width: number
  x: number
  y: number
  border: Border[] | undefined
  rightBottom: Coordinate
  rightTop: Coordinate
  textBaseline: CanvasTextBaseline
  textAlign: CanvasTextAlign
  offsetXRatio: number
  offsetYRatio: number
  textObj: TextMetrics | undefined
  autoTransitionDiffText: boolean

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
    autoTransitionDiffText,
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
    this.leftBottom = { x: 0, y: 0 }
    this.leftTop = { x: 0, y: 0 }
    this.rightBottom = { x: 0, y: 0 }
    this.rightTop = { x: 0, y: 0 }
    const size = this.getSize(width, height)
    this.width = size.width
    this.height = size.height
    this.autoTransitionDiffText = autoTransitionDiffText ?? true

    this.init()
  }

  contains(point: Coordinate): boolean {
    // return this.rect.contains(point)
    return false
  }

  copy(): StayText {
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

  draw({ context, width, height }: ShapeDrawProps): void {
    if (
      this.leftTop.x > width ||
      this.leftTop.y > height ||
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
  init(ctx?: DrawCanvasContext | undefined) {
    const offsetX = -this.width / 2 + this.width * this.offsetXRatio
    const offsetY = this.height * this.offsetYRatio

    this.leftTop.x = this.x + offsetX
    this.leftTop.y = this.y + offsetY
    this.leftBottom.x = this.x + offsetX
    this.leftBottom.y = this.y + this.height + offsetY
    this.rightTop.x = this.x + this.width + offsetX
    this.rightTop.y = this.y + offsetY

    this.rightBottom.x = this.x + this.width + offsetX
    this.rightBottom.y = this.y + this.height + offsetY

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
    return {
      x: (this.leftBottom.x + this.rightBottom.x) / 2,
      y: (this.leftTop.y + this.leftBottom.y) / 2,
    }
  }

  zoom(zoomScale: number): void {
    const center = this.getZoomPoint(zoomScale, { x: this.x, y: this.y })
    this.update({
      x: center.x,
      y: center.y,
      font: { size: this.font.size * zoomScale },
    })
  }

  // earlyStopIntermediateState(
  //   before: StayText,
  //   after: StayText,
  //   ratio: number,
  //   transitionType: EasingFunction,
  //   containerWidth: number,
  //   containerHeight: number
  // ) {
  //   const x = this.getNumberIntermediateState(before.x, after.x, ratio, transitionType)
  //   const width = this.getNumberIntermediateState(before.width, after.width, ratio, transitionType)

  //   if (x < -width || x > containerWidth) {
  //     return true
  //   }

  //   const y = this.getNumberIntermediateState(before.y, after.y, ratio, transitionType)
  //   const height = this.getNumberIntermediateState(
  //     before.height,
  //     after.height,
  //     ratio,
  //     transitionType
  //   )

  //   if (y < -height || y > containerHeight) {
  //     return true
  //   }
  //   return false
  // }

  // zeroShape(): StayText {
  //   return new StayText({
  //     x: this.x,
  //     y: this.y,
  //     text: this.text,
  //     font: this.font,
  //     border: this.border,
  //     textBaseline: this.textBaseline,
  //     textAlign: this.textAlign,
  //     offsetXRatio: this.offsetXRatio,
  //     offsetYRatio: this.offsetYRatio,
  //     props: { ...this._copy(), color: { ...this.color, a: 0 } },
  //   })
  // }

  // intermediateState(
  //   before: StayText,
  //   after: StayText,
  //   ratio: number,
  //   transitionType: EasingFunction
  // ) {
  //   const x = this.getNumberIntermediateState(before.x, after.x, ratio, transitionType)
  //   const width = this.getNumberIntermediateState(before.width, after.width, ratio, transitionType)

  //   const y = this.getNumberIntermediateState(before.y, after.y, ratio, transitionType)
  //   const height = this.getNumberIntermediateState(
  //     before.height,
  //     after.height,
  //     ratio,
  //     transitionType
  //   )

  //   const font = this.getFontIntermediateState(before.font, after.font, ratio, transitionType)
  //   const props = this.getIntermediateProps(before, after, ratio, transitionType)
  //   let text = after.text

  //   if (
  //     before.text !== after.text &&
  //     isRGBA(before.color) &&
  //     isRGBA(after.color) &&
  //     isRGBA(props.color) &&
  //     this.autoTransitionDiffText
  //   ) {
  //     let color = props.color
  //     if (ratio > 0.5) {
  //       const opacity = this.getNumberIntermediateState(
  //         0,
  //         after.color.a,
  //         (ratio - 0.5) * 2,
  //         transitionType
  //       )
  //       color = { ...color, a: opacity }
  //     } else {
  //       text = before.text
  //       const opacity = this.getNumberIntermediateState(
  //         0,
  //         before.color.a,
  //         (0.5 - ratio) * 2,
  //         transitionType
  //       )
  //       color = { ...color, a: opacity }
  //     }
  //     props.color = color
  //   }

  //   return new StayText({
  //     x,
  //     y,
  //     text,
  //     font,
  //     width,
  //     height,
  //     border: after.border,
  //     offsetXRatio: this.getNumberIntermediateState(
  //       before.offsetXRatio,
  //       after.offsetXRatio,
  //       ratio,
  //       transitionType
  //     ),
  //     offsetYRatio: this.getNumberIntermediateState(
  //       before.offsetYRatio,
  //       after.offsetYRatio,
  //       ratio,
  //       transitionType
  //     ),
  //     textAlign: after.textAlign,
  //     textBaseline: after.textBaseline,
  //     props: { ...props },
  //   })
  // }
}

import type { EasingFunction } from "../types/animation"
import type { DrawCanvasContext } from "../types/canvas"
import type { Coordinate, Rect } from "../types/geometry"
import { SHAPE_DRAW_TYPES } from "../userConstants"
import type {
  Border,
  CanvasFillProps,
  CanvasStrokeProps,
  DiagonalDirection,
  Font,
  FourrDirection,
  ShapeDrawProps,
  TextAttr,
} from "../types/shapes"
import {
  borderSame,
  fillSame,
  strokeSame,
} from "../utils/equality"
import { getRGBAStr, isRGB, isRGBA } from "../utils/color"
import { getDefaultFont, getSize } from "../utils/typography"
import { RGBA, rgbaToString } from "../vendor/w3color"
import { AnimatedShape } from "./animatedShape"
import { BlackColor, InstantShape, ZeroColor } from "./instantShape"
import { Rectangle } from "./rectangle"

function alignedLeft(anchorX: number, width: number, textAlign: CanvasTextAlign) {
  if (textAlign === "center") return anchorX - width / 2
  if (textAlign === "right" || textAlign === "end") return anchorX - width
  return anchorX
}

export class StayText extends AnimatedShape {
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
  private ascent: number
  private drawPoint: Coordinate

  constructor(props: TextAttr) {
    super(props)
    const {
      x,
      y,
      text,
      font,
      border,
      textBaseline,
      textAlign,
      offsetXRatio,
      offsetYRatio,
      autoTransitionDiffText,
    } = props
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
    this.ascent = 0
    this.drawPoint = { x: 0, y: 0 }
    const size = getSize(text, this.font, this.textBaseline)
    this.width = size.width
    this.height = size.height
    this.ascent = size.ascent
    this.autoTransitionDiffText = autoTransitionDiffText ?? true

    this.init()
  }

  getTransProps(): string[] {
    return ["x", "y", "font", "offsetXRatio", "offsetYRatio"]
  }
  intermediateState(
    before: StayText,
    after: StayText,
    ratio: number,
    transitionType: EasingFunction
  ): StayText {
    const obj = this.getIntermediateObj(before, after, ratio, transitionType)
    return new StayText({
      ...this,
      ...obj,
    })
  }
  zeroShape(): StayText {
    return new StayText({
      ...this,
      x: this.x,
      y: this.y,
      font: this.font,
      ...this.getZeroConfig(),
    })
  }
  childSameAs(shape: StayText): boolean {
    return (
      this.x === shape.x &&
      this.y === shape.y &&
      this.text === shape.text &&
      this.font.fontFamily === shape.font.fontFamily &&
      this.font.fontWeight === shape.font.fontWeight &&
      this.font.italic === shape.font.italic &&
      this.font.underline === shape.font.underline &&
      this.font.strikethrough === shape.font.strikethrough &&
      this.font.size === shape.font.size &&
      this.offsetXRatio === shape.offsetXRatio &&
      this.offsetYRatio === shape.offsetYRatio &&
      this.textBaseline === shape.textBaseline &&
      this.textAlign === shape.textAlign &&
      this.autoTransitionDiffText === shape.autoTransitionDiffText &&
      borderSame(this.border, shape.border)
    )
  }
  getBound(): Rect {
    return {
      x: this.leftTop.x,
      y: this.leftTop.y,
      width: this.width,
      height: this.height,
    }
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
      font: { ...this.font },
      border: this.border?.map((border) => ({ ...border })),
      textBaseline: this.textBaseline,
      textAlign: this.textAlign,
      offsetXRatio: this.offsetXRatio,
      offsetYRatio: this.offsetYRatio,
      autoTransitionDiffText: this.autoTransitionDiffText,
      ...this.copyProps(),
    })
  }

  get fontStr() {
    const { size, fontFamily, fontWeight, italic } = this.font
    return `${fontWeight} ${italic ? "italic" : ""} ${size ?? 16}px ${fontFamily ?? "monospace"}`
  }

  commonDraw({ context }: ShapeDrawProps): void {
    context.font = this.fontStr
    context.textBaseline = this.textBaseline
    context.textAlign = this.textAlign
  }

  fill({ context }: ShapeDrawProps): void {
    context.fillText(this.text, this.drawPoint.x, this.drawPoint.y)
  }

  stroke({ context, width, height }: ShapeDrawProps): void {
    context.strokeText(this.text, this.drawPoint.x, this.drawPoint.y)

    if (this.font.strikethrough) {
      context.lineWidth = this.height / 10
      context.beginPath()
      context.moveTo(this.leftTop.x, this.leftTop.y + this.height / 2)
      context.lineTo(this.rightBottom.x, this.leftTop.y + this.height / 2)
      context.stroke()
    }
    if (this.font.underline) {
      context.lineWidth = this.height / 10
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
  }

  init(ctx?: DrawCanvasContext | undefined) {
    const offsetX = this.width * this.offsetXRatio
    const offsetY = this.height * this.offsetYRatio
    this.drawPoint.x = this.x + offsetX
    this.drawPoint.y = this.y + offsetY

    const left = alignedLeft(this.drawPoint.x, this.width, this.textAlign)
    const top = this.drawPoint.y - this.ascent

    this.leftTop.x = left
    this.leftTop.y = top
    this.leftBottom.x = left
    this.leftBottom.y = top + this.height
    this.rightTop.x = left + this.width
    this.rightTop.y = top
    this.rightBottom.x = left + this.width
    this.rightBottom.y = top + this.height

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

  update(props: Partial<TextAttr>) {
    const { x, y, font, text, border, textBaseline, textAlign, offsetXRatio, offsetYRatio } = props
    this.x = x ?? this.x
    this.y = y ?? this.y
    this.font = { ...this.font, ...font }
    this.text = text ?? this.text
    this.border = border ?? this.border
    this.textBaseline = textBaseline ?? this.textBaseline
    this.textAlign = textAlign ?? this.textAlign
    this.offsetXRatio = offsetXRatio ?? this.offsetXRatio
    this.offsetYRatio = offsetYRatio ?? this.offsetYRatio
    const size = getSize(this.text, this.font, this.textBaseline)
    this.width = size.width
    this.height = size.height
    this.ascent = size.ascent
    this.applyUpdate(props)
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
}

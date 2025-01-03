import { SHAPE_DRAW_TYPES } from "../userConstants"
import {
  AnimatedShapeProps,
  Coordinate,
  EasingFunction,
  Rect,
  ShapeDrawProps,
  ShapeProps,
} from "../userTypes"
import { isRGBA } from "../utils"
import { RGBA } from "../w3color"
import { AnimatedShape } from "./animatedShape"
import { InstantShape, ZeroColor } from "./instantShape"
import { Line } from "./line"
import { Point } from "./point"

export interface RectangleAttr extends AnimatedShapeProps {
  x: number
  y: number
  width: number
  height: number
}

export class Rectangle extends AnimatedShape {
  area: number
  bottomBorder: Line
  height: number
  leftBorder: Line
  leftBottom: Coordinate
  leftTop: Coordinate
  rightBorder: Line
  rightBottom: Coordinate
  rightTop: Coordinate
  stepZoomY: number
  topBorder: Line
  width: number
  x: number
  y: number
  center: Coordinate
  constructor(props: RectangleAttr) {
    super(props)
    const { x, y, width, height } = props
    this.x = x
    this.y = y
    this.width = width
    this.height = height
    this.stepZoomY = 1

    this.leftTop = { x: this.x, y: this.y }
    this.rightTop = { x: this.x + this.width, y: this.y }
    this.rightBottom = { x: this.x + this.width, y: this.y + this.height }
    this.leftBottom = { x: this.x, y: this.y + this.height }
    this.center = { x: this.x + this.width / 2, y: this.y + this.height / 2 }
    this.leftBorder = new Line({
      x1: this.x,
      y1: this.y,
      x2: this.x,
      y2: this.y + this.height,
    })
    this.rightBorder = new Line({
      x1: this.x + this.width,
      y1: this.y,
      x2: this.x + this.width,
      y2: this.y + this.height,
    })
    this.topBorder = new Line({
      x1: this.x,
      y1: this.y,
      x2: this.x + this.width,
      y2: this.y,
    })
    this.bottomBorder = new Line({
      x1: this.x,
      y1: this.y + this.height,
      x2: this.x + this.width,
      y2: this.y + this.height,
    })
    this.area = this.width * this.height

    this.updateRelatedValue()
  }

  getTransProps() {
    return ["x", "y", "width", "height"]
  }

  intermediateState(
    before: Rectangle,
    after: Rectangle,
    ratio: number,
    transitionType: EasingFunction
  ): Rectangle {
    const obj = this.getIntermediateObj(before, after, ratio, transitionType)
    return new Rectangle(obj)
  }
  zeroShape(): Rectangle {
    return new Rectangle({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      color: ZeroColor,
    })
  }
  childSameAs(shape: Rectangle): boolean {
    return (
      this.x === shape.x &&
      this.y === shape.y &&
      this.width === shape.width &&
      this.height === shape.height
    )
  }
  getBound(): Rect {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
    }
  }

  getCenterPoint(): Coordinate {
    return {
      x: this.x + this.width / 2,
      y: this.y + this.height / 2,
    }
  }

  computeFitInfo(width: number, height: number) {
    const widthRatio = this.width / width
    const heightRatio = this.height / height

    let offsetX = 0
    let offsetY = 0
    const scaleRatio = Math.min(widthRatio, heightRatio)
    const afterWidth = width * scaleRatio
    const afterHeight = height * scaleRatio

    if (widthRatio > heightRatio) {
      offsetX = (this.width - afterWidth) / 2
    } else {
      offsetY = (this.height - afterHeight) / 2
    }
    return {
      rectangle: new Rectangle({
        x: this.x + offsetX,
        y: this.y + offsetY,
        width: afterWidth,
        height: afterHeight,
      }),
      scaleRatio,
      offsetX,
      offsetY,
    }
  }

  copy(): Rectangle {
    return new Rectangle({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      ...this.copyProps(),
    })
  }

  draw({ context }: ShapeDrawProps) {
    if (this.type === SHAPE_DRAW_TYPES.STROKE) {
      context.strokeRect(this.x, this.y, this.width, this.height)
    } else if (this.type === SHAPE_DRAW_TYPES.FILL) {
      context.fillRect(this.x, this.y, this.width, this.height)
    }
  }

  move(offsetX: number, offsetY: number) {
    this.update({
      x: this.x + offsetX,
      y: this.y + offsetY,
    })
  }

  reset() {
    this.zoomY = 1
    this.stepZoomY = 1
    this.zoomCenter = { x: 0, y: 0 }
  }

  screenToWorld(offsetX: number, offsetY: number, scaleRatio: number) {
    const worldLeftTop = this.screenToWorldPoint(
      { x: this.x, y: this.y },
      offsetX,
      offsetY,
      scaleRatio
    )
    return {
      x: worldLeftTop.x,
      y: worldLeftTop.y,
      width: this.screenToWorldLength(this.width, scaleRatio),
      height: this.screenToWorldLength(this.height, scaleRatio),
    }
  }

  update(props: Partial<RectangleAttr>): this {
    this.x = props.x ?? this.x
    this.y = props.y ?? this.y
    this.width = props.width ?? this.width
    this.height = props.height ?? this.height
    this._update(props)
    this.updateRelatedValue()

    return this
  }

  updateRelatedValue() {
    this.leftTop.x = this.x
    this.leftTop.y = this.y

    this.rightTop.x = this.x + this.width
    this.rightTop.y = this.y

    this.rightBottom.x = this.x + this.width
    this.rightBottom.y = this.y + this.height

    this.leftBottom.x = this.x
    this.leftBottom.y = this.y + this.height

    this.leftBorder.update({ x1: this.x, y1: this.y, x2: this.x, y2: this.y + this.height })

    this.rightBorder.update({
      x1: this.x + this.width,
      y1: this.y,
      x2: this.x + this.width,
      y2: this.y + this.height,
    })
    this.topBorder.update({ x1: this.x, y1: this.y, x2: this.x + this.width, y2: this.y })
    this.bottomBorder.update({
      x1: this.x,
      y1: this.y + this.height,
      x2: this.x + this.width,
      y2: this.y + this.height,
    })

    this.center.x = this.x + this.width / 2
    this.center.y = this.y + this.height / 2
    this.area = this.width * this.height
  }

  worldToScreen(offsetX: number, offsetY: number, scaleRatio: number) {
    const screenPoint = this.worldToScreenPoint(
      { x: this.x, y: this.y },
      offsetX,
      offsetY,
      scaleRatio
    )

    return new Rectangle({
      x: screenPoint.x,
      y: screenPoint.y,
      width: this.worldToScreenLength(this.width, scaleRatio),
      height: this.worldToScreenLength(this.height, scaleRatio),
    })
  }

  zoom(zoomScale: number) {
    const leftTop = this.getZoomPoint(zoomScale, this.leftTop)
    this.update({
      x: leftTop.x,
      y: leftTop.y,
      width: this.width * zoomScale,
      height: this.height * zoomScale,
    })
  }
}

import { SHAPE_DRAW_TYPES } from "../userConstants"
import { EasingFunction } from "../userTypes"
import { Line } from "./line"
import { Point } from "./point"
import { Shape, ShapeDrawProps, ShapeProps } from "./shape"

export interface RectShapeAttr {
  x: number
  y: number
  width: number
  height: number
}

export interface RectangleAttr extends RectShapeAttr {
  props?: ShapeProps
}

export class Rectangle extends Shape {
  area: number
  bottomBorder: Line
  height: number
  leftBorder: Line
  leftBottom: Point
  leftTop: Point
  rightBorder: Line
  rightBottom: Point
  rightTop: Point
  stepZoomY: number
  topBorder: Line
  width: number
  x: number
  y: number
  center: Point
  constructor({ x, y, width, height, props = {} }: RectangleAttr) {
    super(props)
    this.x = x
    this.y = y
    this.width = width
    this.height = height
    this.stepZoomY = 1

    this.leftTop = new Point(this.x, this.y)
    this.rightTop = new Point(this.x + this.width, this.y)
    this.rightBottom = new Point(this.x + this.width, this.y + this.height)
    this.leftBottom = new Point(this.x, this.y + this.height)
    this.center = new Point(this.x + this.width / 2, this.y + this.height / 2)
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

  contains(point: Point): boolean {
    return (
      point.x > this.x &&
      point.x < this.x + this.width &&
      point.y > this.y &&
      point.y < this.y + this.height
    )
  }

  copy(): Rectangle {
    return new Rectangle({
      ...this,
      props: this._copy(),
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
    this.zoomCenter = new Point(0, 0)
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

  update({
    x = this.x,
    y = this.y,
    width = this.width,
    height = this.height,
    props,
  }: Partial<RectangleAttr>): this {
    this.x = x
    this.y = y
    this.width = width
    this.height = height
    this._update(props ?? {})
    this.updateRelatedValue()

    return this
  }

  updateRelatedValue() {
    this.leftTop.update({ x: this.x, y: this.y })
    this.rightTop.update({ x: this.x + this.width, y: this.y })
    this.rightBottom.update({ x: this.x + this.width, y: this.y + this.height })
    this.leftBottom.update({ x: this.x, y: this.y + this.height })
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
    this.center.update({
      x: this.x + this.width / 2,
      y: this.y + this.height / 2,
    })
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

  intermediateState(
    before: Rectangle,
    after: Rectangle,
    ratio: number,
    transitionType: EasingFunction
  ) {
    let color = after.color
    if (typeof before.color === "string" && typeof after.color === "string") {
      color = this.getColorIntermediateState(before.color, after.color, ratio, transitionType)
    }
    return new Rectangle({
      x: this.getNumberIntermediateState(before.x, after.x, ratio, transitionType),
      y: this.getNumberIntermediateState(before.y, after.y, ratio, transitionType),
      width: this.getNumberIntermediateState(before.width, after.width, ratio, transitionType),
      height: this.getNumberIntermediateState(before.height, after.height, ratio, transitionType),
      props: this.getIntermediateProps(before, after, ratio, transitionType),
    })
  }
}

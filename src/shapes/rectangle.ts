import { SHAPE_DRAW_TYPES } from "../userConstants"
import type { EasingFunction } from "../types/animation"
import type { Coordinate, Rect } from "../types/geometry"
import type {
  AnimatedShapeProps,
  ShapeDrawProps,
  ShapeProps,
} from "../types/shapes"
import { isRGBA } from "../utils/color"
import { fitRect } from "../utils/geometry"
import { RGBA } from "../vendor/w3color"
import { AnimatedShape } from "./animatedShape"
import { InstantShape, ZeroColor } from "./instantShape"
import { Line, type LineProps } from "./line"
import { Point } from "./point"

export interface RectangleAttr extends AnimatedShapeProps {
  x: number
  y: number
  width: number
  height: number
  filter?: string
}

const borderNames = ["leftBorder", "rightBorder", "topBorder", "bottomBorder"] as const
type BorderName = typeof borderNames[number]

function borderCoordinates({ x, y, width, height }: Rectangle, name: BorderName): LineProps {
  switch (name) {
    case "leftBorder": return { x1: x, y1: y, x2: x, y2: y + height }
    case "rightBorder": return { x1: x + width, y1: y, x2: x + width, y2: y + height }
    case "topBorder": return { x1: x, y1: y, x2: x + width, y2: y }
    case "bottomBorder": return { x1: x, y1: y + height, x2: x + width, y2: y + height }
  }
}

function assignBorder(rectangle: Rectangle, name: BorderName, border: Line) {
  Object.defineProperty(rectangle, name, {
    value: border,
    enumerable: true,
    configurable: true,
    writable: true,
  })
  return border
}

const borderProperties = Object.fromEntries(borderNames.map((name) => [name, {
  enumerable: true,
  configurable: true,
  get(this: Rectangle) {
    return assignBorder(this, name, new Line(borderCoordinates(this, name)))
  },
  set(this: Rectangle, border: Line) {
    assignBorder(this, name, border)
  },
}]))

function updateMaterializedBorders(rectangle: Rectangle) {
  for (const name of borderNames) {
    const border = Object.getOwnPropertyDescriptor(rectangle, name)?.value as Line | undefined
    if (border) border.update(borderCoordinates(rectangle, name))
  }
}

export class Rectangle extends AnimatedShape {
  area: number
  bottomBorder!: Line
  height: number
  leftBorder!: Line
  leftBottom: Coordinate
  leftTop: Coordinate
  rightBorder!: Line
  rightBottom: Coordinate
  rightTop: Coordinate
  stepZoomY: number
  topBorder!: Line
  width: number
  x: number
  y: number
  center: Coordinate
  filter?: string
  constructor(props: RectangleAttr) {
    super(props)
    const { x, y, width, height, filter } = props
    this.x = x
    this.y = y
    this.width = width
    this.height = height
    this.stepZoomY = 1
    this.filter = filter

    this.leftTop = { x: this.x, y: this.y }
    this.rightTop = { x: this.x + this.width, y: this.y }
    this.rightBottom = { x: this.x + this.width, y: this.y + this.height }
    this.leftBottom = { x: this.x, y: this.y + this.height }
    this.center = { x: this.x + this.width / 2, y: this.y + this.height / 2 }
    // Keep enumerable, writable border properties without allocating unused animated Lines.
    Object.defineProperties(this, borderProperties)
    this.area = this.width * this.height
  }

  commonDraw(props: ShapeDrawProps): void {
    props.context.filter = this.filter ?? "none"
  }
  fill({ context }: ShapeDrawProps): void {
    context.fillRect(this.x, this.y, this.width, this.height)
  }

  afterDraw(props: ShapeDrawProps): void {
    props.context.filter = "none"
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
      filter: this.filter,
      ...this.getZeroConfig(),
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
    const fit = fitRect(
      { x: 0, y: 0, width, height },
      this.getBound()
    )
    const offsetX = fit.rect.x - this.x
    const offsetY = fit.rect.y - this.y
    return {
      rectangle: new Rectangle(fit.rect),
      scaleRatio: fit.scale,
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
      filter: this.filter,
      ...this.copyProps(),
    })
  }

  stroke({ context }: ShapeDrawProps) {
    context.strokeRect(this.x, this.y, this.width, this.height)
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
    this.filter = props.filter ?? this.filter
    this.applyUpdate(props)
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

    updateMaterializedBorders(this)

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

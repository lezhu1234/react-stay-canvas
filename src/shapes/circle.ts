import { SHAPE_DRAW_TYPES } from "../userConstants"
import { Point } from "./point"
import { Shape } from "./shape"
import { Coordinate, ShapeDrawProps, ShapeProps } from "../userTypes"

export interface CircleAttr {
  x: number
  y: number
  radius: number
  props?: ShapeProps
}

export class Circle extends Shape {
  getCenterPoint(): Coordinate {
    return { x: this.x, y: this.y }
  }
  center!: Point
  radius: number
  x: number
  y: number
  constructor({ x, y, radius, props }: CircleAttr) {
    super(props || {})
    this.x = x
    this.y = y
    this.radius = radius
  }
  contains(point: Point): boolean {
    return point.distance(this.center) < this.radius
  }

  copy(): Circle {
    return new Circle({ ...this, props: this._copy() })
  }

  draw({ context }: ShapeDrawProps): void {
    context.beginPath()
    context.arc(this.x, this.y, this.radius, 0, 2 * Math.PI)
    if (this.type === SHAPE_DRAW_TYPES.FILL) {
      context.fill()
    } else {
      context.stroke()
    }
  }
  init() {
    this.center = new Point(this.x, this.y)
  }
  move(offsetX: number, offsetY: number): void {
    this.update({
      x: this.x + offsetX,
      y: this.y + offsetY,
    })
  }
  update({ x, y, radius, props }: Partial<CircleAttr>) {
    this.x = x === undefined ? this.x : x
    this.y = y === undefined ? this.y : y
    this.radius = radius === undefined ? this.radius : radius
    this._update(props || {})
    this.init()
    return this
  }
  zoom(zoomScale: number): void {
    const center = this.getZoomPoint(zoomScale, this.center)
    this.update({
      x: center.x,
      y: center.y,
      radius: this.radius * zoomScale,
    })
  }
}

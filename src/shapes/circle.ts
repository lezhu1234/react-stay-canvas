import { SHAPE_DRAW_TYPES } from "../userConstants"
import { Point } from "./point"

import {
  CanvasFillProps,
  CanvasStrokeProps,
  Coordinate,
  Rect,
  ShapeDrawProps,
  ShapeProps,
} from "../userTypes"
import { BlackColor, InstantShape, ZeroColor } from "./instantShape"
import { rgbaToString } from "../w3color"

export interface CircleAttr extends ShapeProps {
  x: number
  y: number
  radius: number
  stroke?: CanvasStrokeProps
  fill?: CanvasFillProps
}

export class Circle extends InstantShape {
  getBound(): Rect {
    return {
      x: this.x - this.radius,
      y: this.y - this.radius,
      width: this.radius * 2,
      height: this.radius * 2,
    }
  }
  getCenterPoint(): Coordinate {
    return { x: this.x, y: this.y }
  }
  center!: Coordinate
  radius: number
  x: number
  y: number

  constructor(props: CircleAttr) {
    super(props)
    const { x, y, radius, stroke, fill } = props
    this.x = x
    this.y = y
    this.radius = radius
  }
  contains(point: Point): boolean {
    return point.distance(this.center) < this.radius
  }

  copy(): Circle {
    return new Circle({
      x: this.x,
      y: this.y,
      radius: this.radius,
      ...this.copyProps(),
    })
  }

  commonDraw({ context }: ShapeDrawProps): void {
    context.beginPath()
    context.arc(this.x, this.y, this.radius, 0, 2 * Math.PI)
  }

  fill({ context }: ShapeDrawProps): void {
    context.fill()
  }
  stroke({ context }: ShapeDrawProps): void {
    context.stroke()
  }
  init() {
    this.center = { x: this.x, y: this.y }
  }
  move(offsetX: number, offsetY: number): void {
    this.update({
      x: this.x + offsetX,
      y: this.y + offsetY,
    })
  }
  update(props: Partial<CircleAttr>) {
    const { x, y, radius } = props
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

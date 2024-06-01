import { Point } from "./point"
import { Shape, ShapeDrawProps, ShapeProps } from "./shape"
import { Vector } from "./vector"
export interface UpdateLineProps {
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  props?: ShapeProps
}
export interface LineProps {
  x1: number
  y1: number
  x2: number
  y2: number
  props?: ShapeProps
}
export class Line extends Shape {
  endPoint: Point
  startPoint: Point
  vector: Vector
  x1: number
  x2: number
  y1: number
  y2: number

  constructor({ x1, y1, x2, y2, props }: LineProps) {
    super(props || {})
    this.x1 = x1
    this.y1 = y1
    this.x2 = x2
    this.y2 = y2

    this.vector = new Vector(this.x2 - this.x1, this.y2 - this.y1)
    this.startPoint = new Point(this.x1, this.y1)
    this.endPoint = new Point(this.x2, this.y2)

    this.updateRelatedValue()
  }

  contains(point: Point): boolean {
    throw new Error("Method not implemented.")
  }

  copy(): Line {
    return new Line({
      x1: this.x1,
      y1: this.y1,
      x2: this.x2,
      y2: this.y2,
      props: {
        color: this.color,
        lineWidth: this.lineWidth,
      },
    })
  }

  distanceToPoint(point: Point) {
    const pointVector = new Vector(point.x - this.x1, point.y - this.y1)
    const angle = this.vector.angle(pointVector)
    return Math.abs(Math.sin(angle) * pointVector.norm())
  }

  draw({ context }: ShapeDrawProps) {
    context.beginPath()
    context.moveTo(this.x1, this.y1)
    context.lineTo(this.x2, this.y2)
    context.stroke()
  }

  len() {
    return this.vector.norm()
  }
  move(offsetX: number, offsetY: number) {
    this.update({
      x1: this.x1 + offsetX,
      y1: this.y1 + offsetY,
      x2: this.x2 + offsetX,
      y2: this.y2 + offsetY,
    })
  }

  nearPoint(point: Point, offset: number = 10) {
    return this.segmentDistanceToPoint(point) < offset
  }

  projectLen(point: Point) {}

  segmentDistanceToPoint(point: Point) {
    const pointVector = new Vector(point.x - this.x1, point.y - this.y1)
    const projectLen = pointVector.project(this.vector)
    if (projectLen < 0 || projectLen > this.len()) {
      return Math.min(point.distance(this.startPoint), point.distance(this.endPoint))
    }
    return this.distanceToPoint(point)
  }

  update({ x1, y1, x2, y2, props }: UpdateLineProps) {
    this.x1 = x1 || this.x1
    this.y1 = y1 || this.y1
    this.x2 = x2 || this.x2
    this.y2 = y2 || this.y2
    this._update(props || {})
    this.updateRelatedValue()
    return this
  }

  updateRelatedValue() {
    this.vector = new Vector(this.x2 - this.x1, this.y2 - this.y1)
    this.startPoint.update({ x: this.x1, y: this.y1 })
    this.endPoint.update({ x: this.x2, y: this.y2 })
  }

  zoom(zoomScale: number): void {
    const startPoint = this.getZoomPoint(zoomScale, { x: this.x1, y: this.y1 })
    const endPoint = this.getZoomPoint(zoomScale, { x: this.x2, y: this.y2 })
    this.update({
      x1: startPoint.x,
      y1: startPoint.y,
      x2: endPoint.x,
      y2: endPoint.y,
    })
  }
}

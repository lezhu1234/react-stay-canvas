import { Point } from "./point"
import { Coordinate, Rect, ShapeDrawProps, ShapeProps } from "../userTypes"
import { Vector } from "./vector"
import { InstantShape } from "./instantShape"
export interface UpdateLineProps extends ShapeProps {
  x1?: number
  y1?: number
  x2?: number
  y2?: number
}
export interface LineProps extends ShapeProps {
  x1: number
  y1: number
  x2: number
  y2: number
}
export class Line extends InstantShape {
  commonDraw(props: ShapeDrawProps): void {
    throw new Error("Method not implemented.")
  }
  fill(props: ShapeDrawProps): void {
    throw new Error("Method not implemented.")
  }
  getBound(): Rect {
    throw new Error("Method not implemented.")
  }
  endPoint: Coordinate
  startPoint: Coordinate
  vector: Vector
  x1: number
  x2: number
  y1: number
  y2: number

  constructor(props: LineProps) {
    super(props)
    const { x1, y1, x2, y2 } = props
    this.x1 = x1
    this.y1 = y1
    this.x2 = x2
    this.y2 = y2

    this.vector = new Vector(this.x2 - this.x1, this.y2 - this.y1)
    this.startPoint = { x: this.x1, y: this.y1 }
    this.endPoint = { x: this.x2, y: this.y2 }

    this.updateRelatedValue()
  }

  getCenterPoint(): Coordinate {
    return { x: (this.x1 + this.x2) / 2, y: (this.y1 + this.y2) / 2 }
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
      ...this.copyProps(),
    })
  }

  distanceToPoint(point: Point) {
    const pointVector = new Vector(point.x - this.x1, point.y - this.y1)
    const angle = this.vector.angle(pointVector)
    return Math.abs(Math.sin(angle) * pointVector.norm())
  }

  stroke({ context }: ShapeDrawProps) {
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

  update(props: UpdateLineProps) {
    const { x1, y1, x2, y2 } = props
    this.x1 = x1 ?? this.x1
    this.y1 = y1 ?? this.y1
    this.x2 = x2 ?? this.x2
    this.y2 = y2 ?? this.y2
    this._update(props)
    this.updateRelatedValue()
    return this
  }

  updateRelatedValue() {
    this.vector = new Vector(this.x2 - this.x1, this.y2 - this.y1)
    this.startPoint.x = this.x1
    this.startPoint.y = this.y1
    this.endPoint.x = this.x2
    this.endPoint.y = this.y2
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

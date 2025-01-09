import { Point } from "./point"
import { Coordinate, EasingFunction, Rect, ShapeDrawProps, ShapeProps } from "../userTypes"
import { Vector } from "./vector"
import { InstantShape } from "./instantShape"
import { AnimatedShape } from "."
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
export class Line extends AnimatedShape {
  getTransProps(): string[] {
    return ["x1", "y1", "x2", "y2"]
  }
  intermediateState(
    before: Line,
    after: Line,
    ratio: number,
    transitionType: EasingFunction
  ): Line {
    const obj = this.getIntermediateObj(before, after, ratio, transitionType)
    return new Line(obj)
  }
  zeroShape(): Line {
    return new Line({
      x1: this.x1,
      y1: this.y1,
      x2: this.x2,
      y2: this.y2,
      ...this.getZeroConfig(),
    })
  }
  childSameAs(shape: Line): boolean {
    return (
      this.x1 === shape.x1 && this.y1 === shape.y1 && this.x2 === shape.x2 && this.y2 === shape.y2
    )
  }
  commonDraw(props: ShapeDrawProps): void {
    // throw new Error("Method not implemented.")
  }
  fill(props: ShapeDrawProps): void {
    // throw new Error("Method not implemented.")
  }
  getBound(): Rect {
    return {
      x: Math.min(this.x1, this.x2),
      y: Math.min(this.y1, this.y2),
      width: Math.abs(this.x2 - this.x1),
      height: Math.abs(this.y2 - this.y1),
    }
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
    return false
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
    this.applyUpdate(props)
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

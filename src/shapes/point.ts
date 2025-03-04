import { Line } from "./line"
import { Coordinate, Rect, ShapeDrawProps, ShapeProps } from "../userTypes"
import { InstantShape } from "./instantShape"
export interface PointProps extends ShapeProps {
  x: number
  y: number
}

export class Point extends InstantShape {
  commonDraw(props: ShapeDrawProps): void {}
  fill({ context }: ShapeDrawProps): void {
    context.fillRect(this.x, this.y, 1, 1)
  }
  getBound(): Rect {
    throw new Error("Method not implemented.")
  }
  getCenterPoint(): Coordinate {
    return {
      x: this.x,
      y: this.y,
    }
  }
  x: number
  y: number

  constructor(props: PointProps) {
    super(props)
    const { x, y } = props
    this.x = x
    this.y = y
  }

  contains(point: Point): boolean {
    return false
  }

  copy(): Point {
    return new Point({
      x: this.x,
      y: this.y,
      ...this.copyProps(),
    })
  }
  distance(point: Coordinate): number {
    const dx = point.x - this.x
    const dy = point.y - this.y
    return Math.sqrt(dx * dx + dy * dy)
  }
  stroke({ context }: ShapeDrawProps): void {}
  move(offsetX: number, offsetY: number): void {
    this.update({ x: this.x + offsetX, y: this.y + offsetY })
  }
  near(point: Point, offset: number = 10): boolean {
    return this.distance(point) < offset
  }
  nearLine(line: Line, offset: number = 10): boolean {
    return line.nearPoint(this, offset)
  }

  update(props: PointProps) {
    const { x, y } = props
    this.x = x === undefined ? this.x : x
    this.y = y === undefined ? this.y : y
    this.applyUpdate(props || {})
    return this
  }

  zoom(zoomScale: number): void {
    const point = this.getZoomPoint(zoomScale, this)
    this.update({ ...point })
  }
}

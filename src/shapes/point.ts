import { Line } from "./line"
import { Shape, ShapeDrawProps, ShapeProps } from "./shape"
export interface PointProps {
  x: number
  y: number
  props?: ShapeProps
}
export class Point extends Shape {
  x: number
  y: number

  constructor(x: number, y: number, props: ShapeProps = {}) {
    super(props)
    this.x = x
    this.y = y
  }

  contains(point: Point): boolean {
    return false
  }

  copy(): Point {
    return new Point(this.x, this.y, {
      color: this.color,
      lineWidth: this.lineWidth,
    })
  }
  distance(point: Point): number {
    const dx = point.x - this.x
    const dy = point.y - this.y
    return Math.sqrt(dx * dx + dy * dy)
  }
  draw({ context }: ShapeDrawProps): void {
    context.lineWidth = this.lineWidth
    context.fillStyle = this.color
    context.fillRect(this.x, this.y, 1, 1)
  }
  move(offsetX: number, offsetY: number): void {
    this.update({ x: this.x + offsetX, y: this.y + offsetY })
  }
  near(point: Point, offset: number = 10): boolean {
    return this.distance(point) < offset
  }
  nearLine(line: Line, offset: number = 10): boolean {
    return line.nearPoint(this, offset)
  }

  update({ x, y, props }: PointProps) {
    this.x = x === undefined ? this.x : x
    this.y = y === undefined ? this.y : y
    this._update(props || {})
    return this
  }

  zoom(zoomScale: number): void {
    const point = this.getZoomPoint(zoomScale, this)
    this.update({ ...point })
  }
}

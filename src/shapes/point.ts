import { Line } from "./line"
import { Shape, ShapeProps } from "./shape"
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

  copy(): Shape {
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
  draw(ctx: CanvasRenderingContext2D): void {
    ctx.lineWidth = this.lineWidth
    ctx.fillStyle = this.color
    ctx.fillRect(this.x, this.y, 1, 1)
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
    this.x = x || this.x
    this.y = y || this.y
    this._update(props || {})
  }

  zoom(zoomScale: number): void {
    const point = this.getZoomPoint(zoomScale, this)
    this.update({ ...point })
  }
}

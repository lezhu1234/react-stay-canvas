import { SHAPE_DRAW_TYPES } from "../userConstants"
import { Point } from "./point"
import { Shape, ShapeDrawProps, ShapeProps } from "./shape"

export interface PathAttr {
  points: Point[]
  radius: number
  props?: ShapeProps
}

export class Path extends Shape {
  path!: Path2D
  points: Point[]
  radius: number
  constructor({ points, radius, props }: PathAttr) {
    super(props || {})
    this.points = points
    this.radius = radius
    this.init()
  }
  contains(point: Point, ctx: CanvasRenderingContext2D): boolean {
    return ctx.isPointInPath(this.path, point.x, point.y)
  }
  copy(): Shape {
    return new Path({
      ...this,
      props: this._copy(),
    })
  }
  draw({ context }: ShapeDrawProps): void {
    if (this.type === SHAPE_DRAW_TYPES.FILL) {
      context.fill(this.path)
    } else {
      context.stroke(this.path)
    }
  }

  getPath(): Path2D {
    const path = new Path2D()
    this.points.forEach((point, index) => {
      if (index === 0) {
        path.moveTo(point.x, point.y)
        // path.arc(point.x, point.y, this.radius, 0, 2 * Math.PI)
      } else {
        path.lineTo(point.x, point.y)
      }
    })
    return path
  }

  init() {
    this.path = this.getPath()
  }
  move(offsetX: number, offsetY: number): void {
    this.update({
      points: this.points.map((point) => {
        point.move(offsetX, offsetY)
        return point
      }),
    })
  }
  update({ points, radius, props }: Partial<PathAttr>) {
    this.points = points || this.points
    this.radius = radius === undefined ? this.radius : radius
    this._update(props || {})
    this.init()
    return this
  }

  zoom(zoomScale: number): void {
    this.update({
      points: this.points.map((point) => {
        point.zoom(zoomScale)
        return point
      }),
    })
  }
}

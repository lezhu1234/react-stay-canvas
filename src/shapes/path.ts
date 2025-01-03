import { SHAPE_DRAW_TYPES } from "../userConstants"
import { getCornersByCenterLine } from "../utils"
import { Line } from "./line"
import { Point } from "./point"
import { Coordinate, Rect, ShapeDrawProps, ShapeProps } from "../userTypes"
import { DrawCanvasContext } from "../types"
import { InstantShape } from "./instantShape"

export interface PathAttr extends ShapeProps {
  points: Point[]
  radius: number
}

export class Path extends InstantShape {
  copy(): Path {
    throw new Error("Method not implemented.")
  }
  getBound(): Rect {
    throw new Error("Method not implemented.")
  }
  points: Point[]
  radius: number
  constructor(props: PathAttr) {
    super(props)
    const { points, radius } = props
    this.points = points
    this.radius = radius
  }

  get path(): Path2D {
    const path = new Path2D()
    this.points.forEach((p, i) => {
      path.moveTo(p.x, p.y)
      path.arc(p.x, p.y, this.radius, 0, 2 * Math.PI)

      if (i > 0) {
        const lastPoint = this.points[i - 1]

        const pathRectCorners = getCornersByCenterLine(
          new Line({
            x1: p.x,
            y1: p.y,
            x2: lastPoint.x,
            y2: lastPoint.y,
          }),
          this.radius * 2
        )

        pathRectCorners.forEach((p, i) => {
          if (i === 0) {
            path.moveTo(p.x, p.y)
          } else {
            path.lineTo(p.x, p.y)
          }
        })
      }
    })
    return path
  }

  getCenterPoint(): Coordinate {
    let x = 0,
      y = 0
    this.points.forEach((point) => {
      x += point.x
      y += point.y
    })
    return { x: x / this.points.length, y: y / this.points.length }
  }
  // contains(point: Point, ctx: DrawCanvasContext): boolean {
  //   return ctx.isPointInPath(this.path, point.x, point.y)
  // }
  // copy(): Path {
  //   return new Path({
  //     radius: this.radius,
  //     points: this.points.map((point) => point.copy()),
  //     props: this._copy(),
  //   })
  // }
  draw({ context }: ShapeDrawProps): void {
    if (this.type === SHAPE_DRAW_TYPES.FILL) {
      context.fill(this.path)
    } else {
      context.stroke(this.path)
    }
  }

  move(offsetX: number, offsetY: number): void {
    this.update({
      points: this.points.map((point) => {
        point.move(offsetX, offsetY)
        return point
      }),
    })
  }
  update(props: Partial<PathAttr>) {
    const { points, radius } = props
    this.points = points || this.points
    this.radius = radius === undefined ? this.radius : radius
    this._update(props || {})
    return this
  }

  zoom(zoomScale: number): void {
    this.update({
      points: this.points.map((point) => {
        const { x, y } = this.getZoomPoint(zoomScale, point)
        return point.update({ x, y })
      }),
      radius: this.radius * zoomScale,
    })
  }
}

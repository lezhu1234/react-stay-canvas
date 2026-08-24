import { getCornersByCenterLine } from "../utils/geometry"
import { Line } from "./line"
import { Point } from "./point"
import type { Coordinate, Rect } from "../types/geometry"
import type { ShapeDrawProps, ShapeProps } from "../types/shapes"
import { InstantShape } from "./instantShape"

function squaredDistanceToSegment(point: Coordinate, start: Coordinate, end: Coordinate) {
  const segmentX = end.x - start.x
  const segmentY = end.y - start.y
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY

  if (segmentLengthSquared === 0) {
    const pointX = point.x - start.x
    const pointY = point.y - start.y
    return pointX * pointX + pointY * pointY
  }

  const projection =
    ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) /
    segmentLengthSquared
  const ratio = Math.max(0, Math.min(1, projection))
  const offsetX = point.x - (start.x + ratio * segmentX)
  const offsetY = point.y - (start.y + ratio * segmentY)
  return offsetX * offsetX + offsetY * offsetY
}

function isInsideBound(point: Coordinate, bound: Rect) {
  return (
    point.x >= bound.x &&
    point.x <= bound.x + bound.width &&
    point.y >= bound.y &&
    point.y <= bound.y + bound.height
  )
}

export interface PathAttr extends ShapeProps {
  points: Point[]
  radius: number
}

export class Path extends InstantShape {
  commonDraw(props: ShapeDrawProps): void {}
  fill({ context }: ShapeDrawProps): void {
    context.fill(this.path)
  }
  copy(): Path {
    return new Path({
      points: this.points.map((point) => point.copy()),
      radius: this.radius,
      ...this.copyProps(),
    })
  }
  getBound(): Rect {
    if (this.points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 }
    }

    let minX = this.points[0].x
    let minY = this.points[0].y
    let maxX = minX
    let maxY = minY

    for (const point of this.points) {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    }

    return {
      x: minX - this.radius,
      y: minY - this.radius,
      width: maxX - minX + this.radius * 2,
      height: maxY - minY + this.radius * 2,
    }
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

      if (i === 0) return
      const lastPoint = this.points[i - 1]
      if (lastPoint.x === p.x && lastPoint.y === p.y) return

      const pathRectCorners = getCornersByCenterLine(
        new Line({
          x1: p.x,
          y1: p.y,
          x2: lastPoint.x,
          y2: lastPoint.y,
        }),
        this.radius * 2
      )

      pathRectCorners.forEach((corner, cornerIndex) => {
        if (cornerIndex === 0) {
          path.moveTo(corner.x, corner.y)
        } else {
          path.lineTo(corner.x, corner.y)
        }
      })
    })
    return path
  }

  contains(point: Coordinate): boolean {
    if (this.points.length === 0 || !isInsideBound(point, this.getBound())) return false

    const radiusSquared = this.radius * this.radius
    if (this.points.length === 1) {
      return squaredDistanceToSegment(point, this.points[0], this.points[0]) <= radiusSquared
    }

    for (let index = 1; index < this.points.length; index += 1) {
      if (
        squaredDistanceToSegment(point, this.points[index - 1], this.points[index]) <=
        radiusSquared
      ) {
        return true
      }
    }
    return false
  }

  getCenterPoint(): Coordinate {
    if (this.points.length === 0) return { x: 0, y: 0 }

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
  stroke({ context }: ShapeDrawProps): void {
    context.stroke(this.path)
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
    this.applyUpdate(props || {})
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

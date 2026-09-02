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

export interface PathAttr extends Omit<ShapeProps, "fillConfig"> {
  points: Point[]
}

export class Path extends InstantShape {
  commonDraw(props: ShapeDrawProps): void {}
  fill(props: ShapeDrawProps): void {}
  copy(): Path {
    const { fillConfig: _fillConfig, ...copyProps } = this.copyProps()
    return new Path({
      points: this.points.map((point) => point.copy()),
      ...copyProps,
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

    const halfWidth = this.strokeConfig.lineWidth / 2
    return {
      x: minX - halfWidth,
      y: minY - halfWidth,
      width: maxX - minX + this.strokeConfig.lineWidth,
      height: maxY - minY + this.strokeConfig.lineWidth,
    }
  }
  points: Point[]
  constructor(props: PathAttr) {
    super({
      ...props,
      fillConfig: undefined,
      strokeConfig: {
        ...props.strokeConfig,
        lineCap: props.strokeConfig?.lineCap ?? "round",
        lineJoin: props.strokeConfig?.lineJoin ?? "round",
      },
    })
    const { points } = props
    this.points = points
  }

  get path(): Path2D {
    const path = new Path2D()
    const firstPoint = this.points[0]
    if (!firstPoint) return path

    path.moveTo(firstPoint.x, firstPoint.y)
    if (this.points.length === 1) {
      path.lineTo(firstPoint.x, firstPoint.y)
      return path
    }

    for (let index = 1; index < this.points.length; index += 1) {
      const point = this.points[index]
      path.lineTo(point.x, point.y)
    }
    return path
  }

  contains(point: Coordinate): boolean {
    if (this.points.length === 0 || !isInsideBound(point, this.getBound())) return false

    const halfWidth = this.strokeConfig.lineWidth / 2
    const halfWidthSquared = halfWidth * halfWidth
    if (this.points.length === 1) {
      return squaredDistanceToSegment(point, this.points[0], this.points[0]) <= halfWidthSquared
    }

    for (let index = 1; index < this.points.length; index += 1) {
      if (
        squaredDistanceToSegment(point, this.points[index - 1], this.points[index]) <=
        halfWidthSquared
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
    if (this.points.length === 0) return
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
    const { points } = props
    this.points = points || this.points
    this.applyUpdate(props || {})
    return this
  }

  zoom(zoomScale: number): void {
    this.update({
      points: this.points.map((point) => {
        const { x, y } = this.getZoomPoint(zoomScale, point)
        return point.update({ x, y })
      }),
      strokeConfig: { lineWidth: this.strokeConfig.lineWidth * zoomScale },
    })
  }
}

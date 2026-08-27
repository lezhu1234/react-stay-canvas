import type { Coordinate, Rect } from "../types/geometry"
import type { ShapeDrawProps, ShapeProps } from "../types/shapes"
import { InstantShape } from "./instantShape"

const GEOMETRY_EPSILON = 1e-9

export interface PolygonAttr extends ShapeProps {
  points: Coordinate[]
  fillRule?: CanvasFillRule
  filter?: string
}

function ownPoints(points: Coordinate[]) {
  if (points.length < 3) {
    throw new RangeError("Polygon requires at least 3 points")
  }
  return points.map((point) => ({ ...point }))
}

function edgeCross(start: Coordinate, end: Coordinate, point: Coordinate) {
  return (end.x - start.x) * (point.y - start.y) -
    (point.x - start.x) * (end.y - start.y)
}

function pointOnEdge(point: Coordinate, start: Coordinate, end: Coordinate) {
  if (Math.abs(edgeCross(start, end, point)) > GEOMETRY_EPSILON) return false
  return point.x >= Math.min(start.x, end.x) - GEOMETRY_EPSILON &&
    point.x <= Math.max(start.x, end.x) + GEOMETRY_EPSILON &&
    point.y >= Math.min(start.y, end.y) - GEOMETRY_EPSILON &&
    point.y <= Math.max(start.y, end.y) + GEOMETRY_EPSILON
}

function containsEvenOdd(points: Coordinate[], point: Coordinate) {
  let inside = false
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const start = points[previous]
    const end = points[index]
    if (
      (start.y > point.y) !== (end.y > point.y) &&
      point.x < (end.x - start.x) * (point.y - start.y) / (end.y - start.y) + start.x
    ) {
      inside = !inside
    }
  }
  return inside
}

function containsNonZero(points: Coordinate[], point: Coordinate) {
  let windingNumber = 0
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    if (start.y <= point.y) {
      if (end.y > point.y && edgeCross(start, end, point) > 0) windingNumber += 1
    } else if (end.y <= point.y && edgeCross(start, end, point) < 0) {
      windingNumber -= 1
    }
  }
  return windingNumber !== 0
}

export class Polygon extends InstantShape {
  center: Coordinate
  fillRule: CanvasFillRule
  filter?: string
  points: Coordinate[]
  private bound: Rect

  constructor({ points, fillRule = "nonzero", filter, ...props }: PolygonAttr) {
    super(props)
    this.points = ownPoints(points)
    this.fillRule = fillRule
    this.filter = filter
    this.bound = { x: 0, y: 0, width: 0, height: 0 }
    this.center = { x: 0, y: 0 }
    this.updateGeometry()
  }

  private trace(context: ShapeDrawProps["context"]) {
    context.beginPath()
    context.moveTo(this.points[0].x, this.points[0].y)
    this.points.slice(1).forEach((point) => context.lineTo(point.x, point.y))
    context.closePath()
  }

  private updateGeometry() {
    const xs = this.points.map((point) => point.x)
    const ys = this.points.map((point) => point.y)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    this.bound = {
      x,
      y,
      width: Math.max(...xs) - x,
      height: Math.max(...ys) - y,
    }

    let crossSum = 0
    let centerX = 0
    let centerY = 0
    for (let index = 0; index < this.points.length; index += 1) {
      const start = this.points[index]
      const end = this.points[(index + 1) % this.points.length]
      const cross = start.x * end.y - end.x * start.y
      crossSum += cross
      centerX += (start.x + end.x) * cross
      centerY += (start.y + end.y) * cross
    }

    this.area = Math.abs(crossSum) / 2
    this.center = Math.abs(crossSum) > GEOMETRY_EPSILON
      ? { x: centerX / (3 * crossSum), y: centerY / (3 * crossSum) }
      : {
          x: this.points.reduce((sum, point) => sum + point.x, 0) / this.points.length,
          y: this.points.reduce((sum, point) => sum + point.y, 0) / this.points.length,
        }
  }

  commonDraw({ context }: ShapeDrawProps) {
    context.filter = this.filter ?? "none"
  }

  afterDraw({ context }: ShapeDrawProps) {
    context.filter = "none"
  }

  fill({ context }: ShapeDrawProps) {
    this.trace(context)
    context.fill(this.fillRule)
  }

  stroke({ context }: ShapeDrawProps) {
    this.trace(context)
    context.stroke()
  }

  copy() {
    return new Polygon({
      ...this.copyProps(),
      points: this.points,
      fillRule: this.fillRule,
      filter: this.filter,
    })
  }

  getBound(): Rect {
    return { ...this.bound }
  }

  getCenterPoint(): Coordinate {
    return { ...this.center }
  }

  contains(point: Coordinate) {
    if (
      point.x < this.bound.x ||
      point.x > this.bound.x + this.bound.width ||
      point.y < this.bound.y ||
      point.y > this.bound.y + this.bound.height
    ) {
      return false
    }

    for (let index = 0; index < this.points.length; index += 1) {
      if (pointOnEdge(point, this.points[index], this.points[(index + 1) % this.points.length])) {
        return true
      }
    }
    return this.fillRule === "evenodd"
      ? containsEvenOdd(this.points, point)
      : containsNonZero(this.points, point)
  }

  move(offsetX: number, offsetY: number) {
    this.update({
      points: this.points.map((point) => ({
        x: point.x + offsetX,
        y: point.y + offsetY,
      })),
    })
  }

  update({ points, fillRule, filter, ...props }: Partial<PolygonAttr>) {
    if (points !== undefined) this.points = ownPoints(points)
    this.fillRule = fillRule ?? this.fillRule
    this.filter = filter ?? this.filter
    this.applyUpdate(props)
    this.updateGeometry()
    return this
  }

  zoom(zoomScale: number) {
    this.update({
      points: this.points.map((point) => this.getZoomPoint(zoomScale, point)),
      strokeConfig: { lineWidth: this.strokeConfig.lineWidth * zoomScale },
    })
  }
}

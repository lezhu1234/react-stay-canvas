import type { Line } from "../shapes/line"
import type { PreserveRectSpace } from "../types/coordinateBrands"
import type { Coordinate, Rect } from "../types/geometry"

export interface FitRectResult<Target extends Rect = Rect> {
  rect: PreserveRectSpace<Target, Rect>
  scale: number
}

function assertRect(rect: Readonly<Rect>, name: string) {
  const keys: Array<keyof Rect> = ["x", "y", "width", "height"]
  keys.forEach((key) => {
    const value = rect[key]
    if (!Number.isFinite(value)) throw new TypeError(`${name}.${key} must be finite`)
  })
  if (rect.width < 0 || rect.height < 0) {
    throw new RangeError(`${name} width and height cannot be negative`)
  }
}

/** Returns the axis-aligned union, or undefined when the input is empty. */
export function unionRects<R extends Rect>(
  rects: Iterable<Readonly<R>>
): PreserveRectSpace<R, Rect> | undefined {
  let union: Rect | undefined
  for (const rect of rects) {
    assertRect(rect, "rect")
    if (!union) {
      union = { ...rect }
      continue
    }
    const right = Math.max(union.x + union.width, rect.x + rect.width)
    const bottom = Math.max(union.y + union.height, rect.y + rect.height)
    union.x = Math.min(union.x, rect.x)
    union.y = Math.min(union.y, rect.y)
    union.width = right - union.x
    union.height = bottom - union.y
  }
  return union as PreserveRectSpace<R, Rect> | undefined
}

/** Uniformly contains source inside target and centers the fitted rectangle. */
export function fitRect<Target extends Rect>(
  source: Readonly<Rect>,
  target: Readonly<Target>
): FitRectResult<Target>
export function fitRect<Target extends Rect>(
  source: Readonly<Rect>,
  target: Readonly<Target>
): FitRectResult<Target> {
  assertRect(source, "source")
  assertRect(target, "target")
  if (source.width === 0 && source.height === 0) {
    throw new RangeError("source must have a positive width or height")
  }
  if (target.width <= 0 || target.height <= 0) {
    throw new RangeError("target width and height must be greater than 0")
  }

  const widthScale = source.width === 0 ? Infinity : target.width / source.width
  const heightScale = source.height === 0 ? Infinity : target.height / source.height
  const scale = Math.min(widthScale, heightScale)
  const width = source.width * scale
  const height = source.height * scale

  return {
    rect: {
      x: target.x + (target.width - width) / 2,
      y: target.y + (target.height - height) / 2,
      width,
      height,
    } as PreserveRectSpace<Target, Rect>,
    scale,
  }
}

export function distance(point1: Coordinate, point2: Coordinate): number {
  const dx = point1.x - point2.x
  const dy = point1.y - point2.y
  return Math.sqrt(dx * dx + dy * dy)
}

export function getCornersByCenterLine(centerLine: Line, width: number) {
  const length = centerLine.len()
  const radius = width / 2

  const x1 = centerLine.x1 - (radius * (centerLine.y2 - centerLine.y1)) / length
  const y1 = centerLine.y1 + (radius * (centerLine.x2 - centerLine.x1)) / length
  const x2 = 2 * centerLine.x1 - x1
  const y2 = 2 * centerLine.y1 - y1
  const centerX = (centerLine.x1 + centerLine.x2) / 2
  const centerY = (centerLine.y1 + centerLine.y2) / 2

  return [
    { x: x1, y: y1 },
    { x: x2, y: y2 },
    { x: 2 * centerX - x1, y: 2 * centerY - y1 },
    { x: 2 * centerX - x2, y: 2 * centerY - y2 },
  ]
}

export function numberAlmostEqual(a: number, b: number, epsilon = 0.0001): boolean {
  return Math.abs(a - b) < epsilon
}

export function hasIntersection(rect1: Rect, rect2: Rect): boolean {
  return !(
    rect1.x + rect1.width < rect2.x ||
    rect1.x > rect2.x + rect2.width ||
    rect1.y + rect1.height < rect2.y ||
    rect1.y > rect2.y + rect2.height
  )
}

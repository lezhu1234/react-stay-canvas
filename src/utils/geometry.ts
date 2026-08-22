import type { Line } from "../shapes/line"
import type { Coordinate, Rect } from "../types/geometry"

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

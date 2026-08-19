import type { Border, CanvasFillProps, CanvasStrokeProps } from "../userTypes"
import { colorSame } from "./color"

export function borderSame(first?: Border[], second?: Border[]) {
  if (!first && !second) return true
  if (!first || !second || first.length !== second.length) return false

  return first.every((border, index) => {
    const other = second[index]
    return (
      border.color === other.color &&
      border.size === other.size &&
      border.type === other.type &&
      border.direction === other.direction
    )
  })
}

export function basicArraySame(first?: any[], second?: any[]) {
  if (!first && !second) return true
  if (!first || !second) return false
  return first.length === second.length && first.every((value, index) => value === second[index])
}

export function strokeSame(first: CanvasStrokeProps, second: CanvasStrokeProps) {
  return (
    colorSame(first.color, second.color) &&
    first.lineWidth === second.lineWidth &&
    basicArraySame(first.dash, second.dash) &&
    first.dashOffset === second.dashOffset &&
    first.lineCap === second.lineCap &&
    first.lineJoin === second.lineJoin &&
    first.miterLimit === second.miterLimit
  )
}

export function fillSame(first: CanvasFillProps, second: CanvasFillProps) {
  return colorSame(first.color, second.color)
}

export function isBasicType(
  value: any
): value is string | number | boolean | null | undefined | bigint {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    value === null ||
    value === undefined
  )
}

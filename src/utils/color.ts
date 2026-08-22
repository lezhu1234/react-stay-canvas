import W3Color, { type RGB, type RGBA } from "../vendor/w3color"

export function stringToRgba(color: string): RGBA {
  return new W3Color(color).toRgba()
}

export function isRGB(value: unknown): value is RGB {
  return (
    typeof value === "object" &&
    value !== null &&
    "r" in value &&
    "g" in value &&
    "b" in value &&
    typeof (value as RGB).r === "number" &&
    typeof (value as RGB).g === "number" &&
    typeof (value as RGB).b === "number"
  )
}

export function isRGBA(value: unknown): value is RGBA {
  return (
    isRGB(value) &&
    "a" in value &&
    typeof (value as RGBA).a === "number"
  )
}

export function getRGBAStr(color?: string | RGB | RGBA): string {
  if (typeof color === "string") return color
  if (isRGBA(color)) return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`
  if (isRGB(color)) return `rgba(${color.r}, ${color.g}, ${color.b}, 1)`
  return "rgba(0,0,0,0)"
}

export function colorSame(first?: RGBA, second?: RGBA) {
  if (!first && !second) return true
  if (!first || !second) return false
  return (
    first.a === second.a &&
    first.r === second.r &&
    first.g === second.g &&
    first.b === second.b
  )
}

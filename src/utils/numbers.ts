import type { NumericString, Positive } from "../types/common"

export function validateNumericString(value: string | number): NumericString {
  if (/^[+-]?\d+$/.test(value.toString())) {
    return value as NumericString
  }
  throw new Error("Invalid numeric string")
}

export function ensurePositive<T extends number>(value: T): Positive<T> {
  if (value <= 0) {
    throw new Error("Value must be positive")
  }
  return value as Positive<T>
}

export function ensureNotNegative<T extends number>(value: T): number {
  if (value < 0) {
    throw new Error("Value must be non-negative")
  }
  return value
}

export function ensureInRangeZeroOne<T extends number>(value: T): number {
  if (value < 0 || value > 1) {
    throw new Error("Value must be in range [0, 1]")
  }
  return value
}

export function isRelativeNumericString<T extends NumericString>(value: T) {
  return typeof value === "string" && (value.startsWith("+") || value.startsWith("-"))
}

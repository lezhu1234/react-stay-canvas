import type { PointType } from "./geometry"

/** A Canvas-compatible 2D affine matrix mapping local coordinates to Content. */
export interface Matrix2D {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export interface SemanticChildTransform {
  x?: number
  y?: number
  rotation?: number
  scaleX?: number
  scaleY?: number
  skewX?: number
  skewY?: number
  origin?: PointType
  matrix?: never
}

export interface MatrixChildTransform {
  matrix: Matrix2D
  x?: never
  y?: never
  rotation?: never
  scaleX?: never
  scaleY?: never
  skewX?: never
  skewY?: never
  origin?: never
}

/**
 * A non-destructive Child-local transform. Rotation and skew values are degrees.
 * A raw matrix is an advanced alternative to the semantic fields.
 */
export type ChildTransform = SemanticChildTransform | MatrixChildTransform

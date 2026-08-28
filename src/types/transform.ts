import type { PointType, Rect } from "./geometry"

/** A Canvas-compatible 2D affine matrix mapping local coordinates to Content. */
export interface Matrix2D {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

/** A row-major 3 x 3 matrix mapping local homogeneous points to Content. */
export interface ProjectiveMatrix2D {
  m00: number
  m01: number
  m02: number
  m10: number
  m11: number
  m12: number
  m20: number
  m21: number
  m22: number
}

export interface SemanticAffineChildPlacement {
  type: "affine"
  x?: number
  y?: number
  rotation?: number
  scaleX?: number
  scaleY?: number
  skewX?: number
  skewY?: number
  origin?: PointType
  matrix?: never
  domain?: never
}

export interface MatrixAffineChildPlacement {
  type: "affine"
  matrix: Matrix2D
  x?: never
  y?: never
  rotation?: never
  scaleX?: never
  scaleY?: never
  skewX?: never
  skewY?: never
  origin?: never
  domain?: never
}

export interface ProjectiveChildPlacement {
  type: "projective"
  matrix: ProjectiveMatrix2D
  domain: Rect
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
 * The Child's single local-to-Content placement. Affine semantic rotation and
 * skew values are degrees; a raw affine matrix is the advanced alternative.
 * Projective placement owns an explicit finite local domain.
 */
export type ChildPlacement =
  | SemanticAffineChildPlacement
  | MatrixAffineChildPlacement
  | ProjectiveChildPlacement

export type ChildPlacementSnapshot =
  | Readonly<{
      type: "affine"
      matrix: Readonly<Matrix2D>
    }>
  | Readonly<{
      type: "projective"
      matrix: Readonly<ProjectiveMatrix2D>
      domain: Readonly<Rect>
    }>

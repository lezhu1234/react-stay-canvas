import type { ContentPoint } from "../../types/coordinates"
import type { PointType, Rect } from "../../types/geometry"
import type {
  ChildPlacement,
  ChildPlacementSnapshot,
  Matrix2D,
  ProjectiveMatrix2D,
} from "../../types/transform"
import {
  copyMatrix2D,
  identityMatrix2D,
  invertMatrix2D,
  mapPoint,
  mapRect,
  matrix2DEquals,
  multiplyMatrix2D,
  resolveAffinePlacement,
} from "../transforms/affine2D"
import {
  createFiniteProjectiveMapping,
  mapProjectiveLocalRectToContentBounds,
  mapProjectiveContentToLocalPoint,
  mapProjectiveLocalToContentPoint,
  multiplyProjectiveMatrix2D,
  type FiniteProjectiveMapping,
} from "../transforms/projective2D"

interface AffinePlacementRuntime {
  readonly type: "affine"
  readonly snapshot: Extract<ChildPlacementSnapshot, { type: "affine" }>
  readonly inverse: Matrix2D
}

interface ProjectivePlacementRuntime {
  readonly type: "projective"
  readonly snapshot: Extract<ChildPlacementSnapshot, { type: "projective" }>
  readonly mapping: FiniteProjectiveMapping
}

export type ChildPlacementRuntime =
  | AffinePlacementRuntime
  | ProjectivePlacementRuntime

function affineSnapshot(matrix: Readonly<Matrix2D>): AffinePlacementRuntime["snapshot"] {
  return Object.freeze({
    type: "affine",
    matrix: Object.freeze(copyMatrix2D(matrix)),
  })
}

function projectiveSnapshot(
  mapping: FiniteProjectiveMapping
): ProjectivePlacementRuntime["snapshot"] {
  return Object.freeze({
    type: "projective",
    matrix: mapping.localToContent,
    domain: mapping.localDomain,
  })
}

export function resolveChildPlacement(
  placement: ChildPlacement = { type: "affine" }
): ChildPlacementRuntime {
  if (placement.type === "affine") {
    const matrix = resolveAffinePlacement(placement)
    return {
      type: "affine",
      snapshot: affineSnapshot(matrix),
      inverse: invertMatrix2D(matrix),
    }
  }

  const mapping = createFiniteProjectiveMapping(placement.matrix, placement.domain)
  return {
    type: "projective",
    snapshot: projectiveSnapshot(mapping),
    mapping,
  }
}

export function restoreChildPlacement(
  snapshot: ChildPlacementSnapshot
): ChildPlacementRuntime {
  return resolveChildPlacement(snapshot.type === "affine"
    ? { type: "affine", matrix: snapshot.matrix }
    : { type: "projective", matrix: snapshot.matrix, domain: snapshot.domain })
}

export function copyChildPlacement(
  placement: ChildPlacementSnapshot
): ChildPlacementSnapshot {
  return placement.type === "affine"
    ? { type: "affine", matrix: copyMatrix2D(placement.matrix) }
    : {
        type: "projective",
        matrix: { ...placement.matrix },
        domain: { ...placement.domain },
      }
}

export function copyChildPlacementInput(
  placement: ChildPlacementSnapshot
): ChildPlacement {
  return placement.type === "affine"
    ? { type: "affine", matrix: copyMatrix2D(placement.matrix) }
    : {
        type: "projective",
        matrix: { ...placement.matrix },
        domain: { ...placement.domain },
      }
}

export function childPlacementEquals(
  first: ChildPlacementSnapshot,
  second: ChildPlacementSnapshot
) {
  if (first.type !== second.type) return false
  if (first.type === "affine" && second.type === "affine") {
    return matrix2DEquals(first.matrix, second.matrix)
  }
  if (first.type !== "projective" || second.type !== "projective") return false
  return Object.keys(first.matrix).every((key) =>
    first.matrix[key as keyof ProjectiveMatrix2D] ===
      second.matrix[key as keyof ProjectiveMatrix2D]) &&
    first.domain.x === second.domain.x &&
    first.domain.y === second.domain.y &&
    first.domain.width === second.domain.width &&
    first.domain.height === second.domain.height
}

export function placementToContentPoint(
  placement: ChildPlacementRuntime,
  point: PointType
): ContentPoint | undefined {
  return placement.type === "affine"
    ? mapPoint(placement.snapshot.matrix, point)
    : mapProjectiveLocalToContentPoint(placement.mapping, point)
}

export function placementToLocalPoint(
  placement: ChildPlacementRuntime,
  point: ContentPoint
): PointType | undefined {
  return placement.type === "affine"
    ? mapPoint(placement.inverse, point)
    : mapProjectiveContentToLocalPoint(placement.mapping, point)
}

export function placementShapeBound(
  placement: ChildPlacementRuntime,
  localBound: Rect
): Rect {
  if (placement.type === "affine") {
    return mapRect(placement.snapshot.matrix, localBound)
  }
  return mapProjectiveLocalRectToContentBounds(placement.mapping, localBound) ??
    placement.mapping.contentBounds
}

function affineAsProjective(matrix: Readonly<Matrix2D>): ProjectiveMatrix2D {
  return {
    m00: matrix.a, m01: matrix.c, m02: matrix.e,
    m10: matrix.b, m11: matrix.d, m12: matrix.f,
    m20: 0, m21: 0, m22: 1,
  }
}

function transformProjectiveSnapshot(
  placement: Extract<ChildPlacementSnapshot, { type: "projective" }>,
  before: Readonly<Matrix2D>,
  after?: Readonly<Matrix2D>
): ChildPlacementSnapshot {
  const left = affineAsProjective(before)
  const matrix = after
    ? multiplyProjectiveMatrix2D(
        multiplyProjectiveMatrix2D(left, placement.matrix),
        affineAsProjective(after)
      )
    : multiplyProjectiveMatrix2D(left, placement.matrix)
  return {
    type: "projective",
    matrix,
    domain: after ? mapRect(invertMatrix2D(after), placement.domain) : placement.domain,
  }
}

export function translateProjectivePlacement(
  placement: Extract<ChildPlacementSnapshot, { type: "projective" }>,
  x: number,
  y: number
) {
  return transformProjectiveSnapshot(
    placement,
    { ...identityMatrix2D(), e: x, f: y }
  )
}

export function scaleProjectivePlacement(
  placement: Extract<ChildPlacementSnapshot, { type: "projective" }>,
  scale: number,
  center: PointType
) {
  const matrix = multiplyMatrix2D(
    multiplyMatrix2D(
      { ...identityMatrix2D(), e: center.x, f: center.y },
      { a: scale, b: 0, c: 0, d: scale, e: 0, f: 0 }
    ),
    { ...identityMatrix2D(), e: -center.x, f: -center.y }
  )
  return transformProjectiveSnapshot(placement, matrix)
}

export function placeChildPlacement(
  placement: ChildPlacementSnapshot,
  areaPlacement: Readonly<Matrix2D>,
  inverseAreaPlacement: Readonly<Matrix2D>
): ChildPlacementSnapshot {
  if (placement.type === "affine") {
    return {
      type: "affine",
      matrix: multiplyMatrix2D(
        multiplyMatrix2D(areaPlacement, placement.matrix),
        inverseAreaPlacement
      ),
    }
  }
  return transformProjectiveSnapshot(
    placement,
    areaPlacement,
    inverseAreaPlacement
  )
}

import type { ContentPoint } from "../types/coordinates"
import type { Rect } from "../types/geometry"
import type {
  ProjectiveChildPlacement,
  ProjectiveMatrix2D,
} from "../types/transform"
import { createFiniteProjectiveMapping } from "../stay/transforms/projective2D"

export interface ProjectiveQuad {
  topLeft: ContentPoint
  topRight: ContentPoint
  bottomRight: ContentPoint
  bottomLeft: ContentPoint
}

function assertFinitePoint(point: Readonly<ContentPoint>, name: string) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError(`${name} must contain finite coordinates`)
  }
}

function assertFiniteDomain(domain: Readonly<Rect>) {
  const keys: Array<keyof Rect> = ["x", "y", "width", "height"]
  keys.forEach((key) => {
    if (!Number.isFinite(domain[key])) {
      throw new TypeError(`projective domain ${key} must be finite`)
    }
  })
  if (domain.width <= 0 || domain.height <= 0) {
    throw new RangeError("projective domain width and height must be greater than 0")
  }
  if (!Number.isFinite(domain.x + domain.width) ||
      !Number.isFinite(domain.y + domain.height)) {
    throw new RangeError("projective domain must have finite edges")
  }
}

function unitSquareToQuadMatrix(
  quad: Readonly<ProjectiveQuad>
): ProjectiveMatrix2D {
  const { topLeft, topRight, bottomRight, bottomLeft } = quad
  assertFinitePoint(topLeft, "quad.topLeft")
  assertFinitePoint(topRight, "quad.topRight")
  assertFinitePoint(bottomRight, "quad.bottomRight")
  assertFinitePoint(bottomLeft, "quad.bottomLeft")

  const diagonalX = topLeft.x - topRight.x + bottomRight.x - bottomLeft.x
  const diagonalY = topLeft.y - topRight.y + bottomRight.y - bottomLeft.y
  if (diagonalX === 0 && diagonalY === 0) {
    return {
      m00: topRight.x - topLeft.x,
      m01: bottomLeft.x - topLeft.x,
      m02: topLeft.x,
      m10: topRight.y - topLeft.y,
      m11: bottomLeft.y - topLeft.y,
      m12: topLeft.y,
      m20: 0,
      m21: 0,
      m22: 1,
    }
  }

  const rightX = topRight.x - bottomRight.x
  const leftX = bottomLeft.x - bottomRight.x
  const rightY = topRight.y - bottomRight.y
  const leftY = bottomLeft.y - bottomRight.y
  const denominator = rightX * leftY - leftX * rightY
  const perspectiveX = (diagonalX * leftY - leftX * diagonalY) / denominator
  const perspectiveY = (rightX * diagonalY - diagonalX * rightY) / denominator

  return {
    m00: topRight.x - topLeft.x + perspectiveX * topRight.x,
    m01: bottomLeft.x - topLeft.x + perspectiveY * bottomLeft.x,
    m02: topLeft.x,
    m10: topRight.y - topLeft.y + perspectiveX * topRight.y,
    m11: bottomLeft.y - topLeft.y + perspectiveY * bottomLeft.y,
    m12: topLeft.y,
    m20: perspectiveX,
    m21: perspectiveY,
    m22: 1,
  }
}

function applyDomainToUnitSquare(
  matrix: Readonly<ProjectiveMatrix2D>,
  domain: Readonly<Rect>
): ProjectiveMatrix2D {
  const inverseWidth = 1 / domain.width
  const inverseHeight = 1 / domain.height
  return {
    m00: matrix.m00 * inverseWidth,
    m01: matrix.m01 * inverseHeight,
    m02: matrix.m02 - matrix.m00 * domain.x * inverseWidth
      - matrix.m01 * domain.y * inverseHeight,
    m10: matrix.m10 * inverseWidth,
    m11: matrix.m11 * inverseHeight,
    m12: matrix.m12 - matrix.m10 * domain.x * inverseWidth
      - matrix.m11 * domain.y * inverseHeight,
    m20: matrix.m20 * inverseWidth,
    m21: matrix.m21 * inverseHeight,
    m22: matrix.m22 - matrix.m20 * domain.x * inverseWidth
      - matrix.m21 * domain.y * inverseHeight,
  }
}

/** Maps a finite local rectangle onto a target quadrilateral. */
export function projectivePlacementFromQuad(
  domain: Readonly<Rect>,
  quad: Readonly<ProjectiveQuad>
): ProjectiveChildPlacement {
  assertFiniteDomain(domain)
  const matrix = applyDomainToUnitSquare(unitSquareToQuadMatrix(quad), domain)
  const mapping = createFiniteProjectiveMapping(matrix, domain)
  return {
    type: "projective",
    matrix: { ...mapping.localToContent },
    domain: { ...mapping.localDomain },
  }
}

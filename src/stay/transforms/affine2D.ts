import type { PointType, Rect } from "../../types/geometry"
import type {
  Matrix2D,
  MatrixAffineChildPlacement,
  SemanticAffineChildPlacement,
} from "../../types/transform"

const DEGREES_TO_RADIANS = Math.PI / 180
function finite(value: number, name: string) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`)
  return value
}

export function identityMatrix2D(): Matrix2D {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
}

export function copyMatrix2D(matrix: Readonly<Matrix2D>): Matrix2D {
  return { ...matrix }
}

export function multiplyMatrix2D(
  left: Readonly<Matrix2D>,
  right: Readonly<Matrix2D>
): Matrix2D {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  }
}

function translationMatrix(x: number, y: number): Matrix2D {
  return { a: 1, b: 0, c: 0, d: 1, e: x, f: y }
}

export function areaPlacementMatrix(source: Rect, target: Rect): Matrix2D {
  const scale = target.width / source.width
  return validateMatrix({
    a: scale,
    b: 0,
    c: 0,
    d: scale,
    e: target.x - source.x * scale,
    f: target.y - source.y * scale,
  })
}

function rotationMatrix(degrees: number): Matrix2D {
  const radians = degrees * DEGREES_TO_RADIANS
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  return { a: cosine, b: sine, c: -sine, d: cosine, e: 0, f: 0 }
}

function skewMatrix(xDegrees: number, yDegrees: number): Matrix2D {
  return {
    a: 1,
    b: Math.tan(yDegrees * DEGREES_TO_RADIANS),
    c: Math.tan(xDegrees * DEGREES_TO_RADIANS),
    d: 1,
    e: 0,
    f: 0,
  }
}

function scaleMatrix(x: number, y: number): Matrix2D {
  return { a: x, b: 0, c: 0, d: y, e: 0, f: 0 }
}

function validateMatrix(matrix: Readonly<Matrix2D>): Matrix2D {
  const result = {
    a: finite(matrix.a, "placement.matrix.a"),
    b: finite(matrix.b, "placement.matrix.b"),
    c: finite(matrix.c, "placement.matrix.c"),
    d: finite(matrix.d, "placement.matrix.d"),
    e: finite(matrix.e, "placement.matrix.e"),
    f: finite(matrix.f, "placement.matrix.f"),
  }
  const determinant = result.a * result.d - result.b * result.c
  if (!Number.isFinite(determinant) || determinant === 0) {
    throw new RangeError("affine placement matrix must be invertible")
  }
  return result
}

export function resolveAffinePlacement(
  placement: SemanticAffineChildPlacement | MatrixAffineChildPlacement
): Matrix2D {
  if ("matrix" in placement && placement.matrix) {
    return validateMatrix(placement.matrix)
  }

  const x = finite(placement.x ?? 0, "placement.x")
  const y = finite(placement.y ?? 0, "placement.y")
  const rotation = finite(placement.rotation ?? 0, "placement.rotation")
  const scaleX = finite(placement.scaleX ?? 1, "placement.scaleX")
  const scaleY = finite(placement.scaleY ?? 1, "placement.scaleY")
  const skewX = finite(placement.skewX ?? 0, "placement.skewX")
  const skewY = finite(placement.skewY ?? 0, "placement.skewY")
  const originX = finite(placement.origin?.x ?? 0, "placement.origin.x")
  const originY = finite(placement.origin?.y ?? 0, "placement.origin.y")

  const matrices = [
    translationMatrix(x, y),
    translationMatrix(originX, originY),
    rotationMatrix(rotation),
    skewMatrix(skewX, skewY),
    scaleMatrix(scaleX, scaleY),
    translationMatrix(-originX, -originY),
  ]
  return validateMatrix(
    matrices.reduce((result, matrix) => multiplyMatrix2D(result, matrix), identityMatrix2D())
  )
}

export function invertMatrix2D(matrix: Readonly<Matrix2D>): Matrix2D {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c
  if (!Number.isFinite(determinant) || determinant === 0) {
    throw new RangeError("affine placement matrix must be invertible")
  }
  const inverse = {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant,
  }
  if (Object.values(inverse).some((value) => !Number.isFinite(value))) {
    throw new RangeError("affine placement matrix must be invertible")
  }
  return inverse
}

export function matrix2DEquals(
  first: Readonly<Matrix2D>,
  second: Readonly<Matrix2D>
) {
  return first.a === second.a && first.b === second.b &&
    first.c === second.c && first.d === second.d &&
    first.e === second.e && first.f === second.f
}

export function mapPoint(matrix: Readonly<Matrix2D>, point: PointType): PointType {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  }
}

export function mapVector(matrix: Readonly<Matrix2D>, vector: PointType): PointType {
  return {
    x: matrix.a * vector.x + matrix.c * vector.y,
    y: matrix.b * vector.x + matrix.d * vector.y,
  }
}

export function mapRect(matrix: Readonly<Matrix2D>, rect: Rect): Rect {
  const corners = [
    mapPoint(matrix, { x: rect.x, y: rect.y }),
    mapPoint(matrix, { x: rect.x + rect.width, y: rect.y }),
    mapPoint(matrix, { x: rect.x + rect.width, y: rect.y + rect.height }),
    mapPoint(matrix, { x: rect.x, y: rect.y + rect.height }),
  ]
  const xs = corners.map(({ x }) => x)
  const ys = corners.map(({ y }) => y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return {
    x: left,
    y: top,
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - top,
  }
}

export function isIdentityMatrix2D(matrix: Readonly<Matrix2D>) {
  return matrix2DEquals(matrix, identityMatrix2D())
}

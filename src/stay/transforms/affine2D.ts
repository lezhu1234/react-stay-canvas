import type { PointType, Rect } from "../../types/geometry"
import type { ChildTransform, Matrix2D } from "../../types/transform"

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
    a: finite(matrix.a, "transform.matrix.a"),
    b: finite(matrix.b, "transform.matrix.b"),
    c: finite(matrix.c, "transform.matrix.c"),
    d: finite(matrix.d, "transform.matrix.d"),
    e: finite(matrix.e, "transform.matrix.e"),
    f: finite(matrix.f, "transform.matrix.f"),
  }
  const determinant = result.a * result.d - result.b * result.c
  if (!Number.isFinite(determinant) || determinant === 0) {
    throw new RangeError("transform matrix must be invertible")
  }
  return result
}

export function resolveChildTransform(transform: ChildTransform = {}): Matrix2D {
  if ("matrix" in transform && transform.matrix) {
    return validateMatrix(transform.matrix)
  }

  const x = finite(transform.x ?? 0, "transform.x")
  const y = finite(transform.y ?? 0, "transform.y")
  const rotation = finite(transform.rotation ?? 0, "transform.rotation")
  const scaleX = finite(transform.scaleX ?? 1, "transform.scaleX")
  const scaleY = finite(transform.scaleY ?? 1, "transform.scaleY")
  const skewX = finite(transform.skewX ?? 0, "transform.skewX")
  const skewY = finite(transform.skewY ?? 0, "transform.skewY")
  const originX = finite(transform.origin?.x ?? 0, "transform.origin.x")
  const originY = finite(transform.origin?.y ?? 0, "transform.origin.y")

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
    throw new RangeError("transform matrix must be invertible")
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
    throw new RangeError("transform matrix must be invertible")
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

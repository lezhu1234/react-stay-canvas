import type { ContentPoint, ContentRect } from "../../types/coordinates"
import type { PointType, Rect } from "../../types/geometry"
import type { ProjectiveMatrix2D } from "../../types/transform"
export type { ProjectiveMatrix2D } from "../../types/transform"

/**
 * @internal A projective mapping whose finite local domain never touches its
 * horizon. This algebraic value does not certify domain-wide floating-point
 * resolution; renderer and hit-test callers own their operational error budget.
 */
export interface FiniteProjectiveMapping {
  readonly localDomain: Readonly<Rect>
  readonly localToContent: Readonly<ProjectiveMatrix2D>
  readonly contentToLocal: Readonly<ProjectiveMatrix2D>
  readonly contentBounds: Readonly<ContentRect>
}

const MATRIX_KEYS: ReadonlyArray<keyof ProjectiveMatrix2D> = [
  "m00", "m01", "m02",
  "m10", "m11", "m12",
  "m20", "m21", "m22",
]

interface Dyadic {
  readonly coefficient: bigint
  readonly exponent: number
}

const FLOAT_BUFFER = new ArrayBuffer(8)
const FLOAT_VIEW = new DataView(FLOAT_BUFFER)
let BIGINT_ZERO: bigint
let BIGINT_ONE: bigint
let BIGINT_TWO: bigint
let FRACTION_MASK: bigint
let SIGN_MASK: bigint
let exactRuntimeInitialized = false

function initializeExactRuntime() {
  if (exactRuntimeInitialized) return
  if (typeof BigInt !== "function" ||
      typeof FLOAT_VIEW.getBigUint64 !== "function" ||
      typeof FLOAT_VIEW.setBigUint64 !== "function") {
    throw new Error(
      "projective placement requires BigInt and DataView BigUint64 support"
    )
  }
  BIGINT_ZERO = BigInt(0)
  BIGINT_ONE = BigInt(1)
  BIGINT_TWO = BigInt(2)
  FRACTION_MASK = (BIGINT_ONE << BigInt(52)) - BIGINT_ONE
  SIGN_MASK = BIGINT_ONE << BigInt(63)
  exactRuntimeInitialized = true
}

function copyMatrix(
  matrix: Readonly<ProjectiveMatrix2D>
): ProjectiveMatrix2D {
  const values = MATRIX_KEYS.map((key) => {
    const value = matrix[key]
    if (!Number.isFinite(value)) {
      throw new TypeError(`projective matrix ${key} must be finite`)
    }
    return value
  })
  return {
    m00: values[0], m01: values[1], m02: values[2],
    m10: values[3], m11: values[4], m12: values[5],
    m20: values[6], m21: values[7], m22: values[8],
  }
}

export function multiplyProjectiveMatrix2D(
  left: Readonly<ProjectiveMatrix2D>,
  right: Readonly<ProjectiveMatrix2D>
): ProjectiveMatrix2D {
  const result = {} as ProjectiveMatrix2D
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      const key = `m${row}${column}` as keyof ProjectiveMatrix2D
      result[key] = [0, 1, 2].reduce((sum, index) =>
        sum + left[`m${row}${index}` as keyof ProjectiveMatrix2D] *
          right[`m${index}${column}` as keyof ProjectiveMatrix2D], 0)
    }
  }
  return result
}

function numberToDyadic(value: number): Dyadic {
  if (value === 0) return { coefficient: BIGINT_ZERO, exponent: 0 }
  FLOAT_VIEW.setFloat64(0, value)
  const bits = FLOAT_VIEW.getBigUint64(0)
  const exponentBits = Number((bits >> BigInt(52)) & BigInt(0x7ff))
  let coefficient = bits & FRACTION_MASK
  let exponent = -1074
  if (exponentBits !== 0) {
    coefficient |= BIGINT_ONE << BigInt(52)
    exponent = exponentBits - 1023 - 52
  }
  if ((bits & SIGN_MASK) !== BIGINT_ZERO) coefficient = -coefficient
  return { coefficient, exponent }
}

function addDyadics(left: Dyadic, right: Dyadic): Dyadic {
  if (left.coefficient === BIGINT_ZERO) return right
  if (right.coefficient === BIGINT_ZERO) return left
  const exponent = Math.min(left.exponent, right.exponent)
  return {
    coefficient:
      (left.coefficient << BigInt(left.exponent - exponent)) +
      (right.coefficient << BigInt(right.exponent - exponent)),
    exponent,
  }
}

function multiplyDyadics(left: Dyadic, right: Dyadic): Dyadic {
  return {
    coefficient: left.coefficient * right.coefficient,
    exponent: left.exponent + right.exponent,
  }
}

function exactLinearCombination(
  a: number,
  x: number,
  b: number,
  y: number,
  constant: number
) {
  return addDyadics(
    addDyadics(
      multiplyDyadics(numberToDyadic(a), numberToDyadic(x)),
      multiplyDyadics(numberToDyadic(b), numberToDyadic(y))
    ),
    numberToDyadic(constant)
  )
}

function subtractProducts(
  a: number,
  b: number,
  c: number,
  d: number
): Dyadic {
  const first = multiplyDyadics(numberToDyadic(a), numberToDyadic(b))
  const second = multiplyDyadics(numberToDyadic(c), numberToDyadic(d))
  return addDyadics(first, { coefficient: -second.coefficient, exponent: second.exponent })
}

function exactAdjugate(matrix: Readonly<ProjectiveMatrix2D>): Dyadic[] {
  const {
    m00: a, m01: b, m02: c,
    m10: d, m11: e, m12: f,
    m20: g, m21: h, m22: i,
  } = matrix
  return [
    subtractProducts(e, i, f, h),
    subtractProducts(c, h, b, i),
    subtractProducts(b, f, c, e),
    subtractProducts(f, g, d, i),
    subtractProducts(a, i, c, g),
    subtractProducts(c, d, a, f),
    subtractProducts(d, h, e, g),
    subtractProducts(b, g, a, h),
    subtractProducts(a, e, b, d),
  ]
}

function exactDeterminant(
  matrix: Readonly<ProjectiveMatrix2D>,
  adjugate: readonly Dyadic[]
) {
  return [matrix.m00, matrix.m01, matrix.m02].reduce(
    (sum, value, index) => addDyadics(
      sum,
      multiplyDyadics(numberToDyadic(value), adjugate[index * 3])
    ),
    { coefficient: BIGINT_ZERO, exponent: 0 }
  )
}

function bitLength(value: bigint) {
  const magnitude = value < BIGINT_ZERO ? -value : value
  return magnitude.toString(2).length
}

function dyadicTopExponent(value: Dyadic) {
  return value.exponent + bitLength(value.coefficient) - 1
}

function roundRatio(
  numerator: bigint,
  denominator: bigint,
  binaryShift: number
) {
  const scaledNumerator = binaryShift >= 0
    ? numerator << BigInt(binaryShift)
    : numerator
  const scaledDenominator = binaryShift >= 0
    ? denominator
    : denominator << BigInt(-binaryShift)
  let quotient = scaledNumerator / scaledDenominator
  const remainder = scaledNumerator % scaledDenominator
  const doubledRemainder = remainder * BIGINT_TWO
  if (doubledRemainder > scaledDenominator ||
      (doubledRemainder === scaledDenominator && quotient % BIGINT_TWO === BIGINT_ONE)) {
    quotient += BIGINT_ONE
  }
  return quotient
}

function compareRatioToPower(
  numerator: bigint,
  denominator: bigint,
  ratioExponent: number,
  power: number
) {
  const shift = ratioExponent - power
  const left = shift >= 0 ? numerator << BigInt(shift) : numerator
  const right = shift >= 0 ? denominator : denominator << BigInt(-shift)
  return left < right ? -1 : left > right ? 1 : 0
}

function divideDyadics(numerator: Dyadic, denominator: Dyadic) {
  if (numerator.coefficient === BIGINT_ZERO) return 0
  const negative = (numerator.coefficient < BIGINT_ZERO) !==
    (denominator.coefficient < BIGINT_ZERO)
  const numeratorMagnitude = numerator.coefficient < BIGINT_ZERO
    ? -numerator.coefficient
    : numerator.coefficient
  const denominatorMagnitude = denominator.coefficient < BIGINT_ZERO
    ? -denominator.coefficient
    : denominator.coefficient
  const ratioExponent = numerator.exponent - denominator.exponent
  let exponent = bitLength(numeratorMagnitude) -
    bitLength(denominatorMagnitude) + ratioExponent
  if (compareRatioToPower(
    numeratorMagnitude,
    denominatorMagnitude,
    ratioExponent,
    exponent
  ) < 0) exponent -= 1

  let magnitude: number
  if (exponent < -1022) {
    const units = roundRatio(
      numeratorMagnitude,
      denominatorMagnitude,
      ratioExponent + 1074
    )
    magnitude = Number(units) * Number.MIN_VALUE
  } else {
    let significand = roundRatio(
      numeratorMagnitude,
      denominatorMagnitude,
      ratioExponent + 52 - exponent
    )
    if (significand === BIGINT_ONE << BigInt(53)) {
      significand >>= BIGINT_ONE
      exponent += 1
    }
    magnitude = Number(significand) / 2 ** 52 * 2 ** exponent
  }
  return negative ? -magnitude : magnitude
}

function dyadicToNumber(value: Dyadic, scaleExponent: number) {
  if (value.coefficient === BIGINT_ZERO) return 0
  const negative = value.coefficient < BIGINT_ZERO
  const magnitude = negative ? -value.coefficient : value.coefficient
  const discardedBits = Math.max(0, bitLength(magnitude) - 53)
  let significand = magnitude >> BigInt(discardedBits)
  if (discardedBits > 0) {
    const remainder = magnitude - (significand << BigInt(discardedBits))
    const halfway = BIGINT_ONE << BigInt(discardedBits - 1)
    if (remainder > halfway ||
        (remainder === halfway && significand % BIGINT_TWO === BIGINT_ONE)) {
      significand += BIGINT_ONE
    }
  }
  const exponent = value.exponent + scaleExponent + discardedBits
  const result = exponent < -1074
    ? Number(significand) / 2 ** 52 * 2 ** (exponent + 52)
    : Number(significand) * 2 ** exponent
  return negative ? -result : result
}

function matrixFromAdjugate(adjugate: readonly Dyadic[]): ProjectiveMatrix2D {
  const nonZero = adjugate.filter(({ coefficient }) => coefficient !== BIGINT_ZERO)
  const topExponents = nonZero.map(dyadicTopExponent)
  const minimumShift = -1074 - Math.min(...topExponents)
  const maximumShift = 1023 - Math.max(...topExponents)
  if (minimumShift > maximumShift) {
    throw new RangeError("projective matrix must have a finite inverse")
  }
  const normalizedShift = -Math.max(...topExponents)
  const scaleExponent = minimumShift > 0
    ? Math.min(Math.max(normalizedShift, minimumShift), maximumShift)
    : maximumShift < 0 ? maximumShift : 0
  const values = adjugate.map((value) => dyadicToNumber(value, scaleExponent))
  if (values.some((value, index) =>
    !Number.isFinite(value) ||
    (adjugate[index].coefficient !== BIGINT_ZERO && value === 0))) {
    throw new RangeError("projective matrix must have a finite inverse")
  }
  return {
    m00: values[0], m01: values[1], m02: values[2],
    m10: values[3], m11: values[4], m12: values[5],
    m20: values[6], m21: values[7], m22: values[8],
  }
}

function invertMatrix(matrix: Readonly<ProjectiveMatrix2D>): ProjectiveMatrix2D {
  const adjugate = exactAdjugate(matrix)
  if (exactDeterminant(matrix, adjugate).coefficient === BIGINT_ZERO) {
    throw new RangeError("projective matrix must be invertible")
  }
  return matrixFromAdjugate(adjugate)
}

function copyDomain(domain: Readonly<Rect>): Rect {
  const result = { ...domain }
  for (const key of ["x", "y", "width", "height"] as const) {
    if (!Number.isFinite(result[key])) {
      throw new TypeError(`projective domain ${key} must be finite`)
    }
  }
  if (result.width <= 0 || result.height <= 0) {
    throw new RangeError("projective domain width and height must be greater than 0")
  }
  if (!Number.isFinite(result.x + result.width) ||
      !Number.isFinite(result.y + result.height)) {
    throw new RangeError("projective domain must have finite edges")
  }
  return result
}

function domainCorners(domain: Readonly<Rect>): readonly PointType[] {
  return [
    { x: domain.x, y: domain.y },
    { x: domain.x + domain.width, y: domain.y },
    { x: domain.x + domain.width, y: domain.y + domain.height },
    { x: domain.x, y: domain.y + domain.height },
  ]
}

function exactHomogeneousComponents(
  matrix: Readonly<ProjectiveMatrix2D>,
  point: Readonly<PointType>
) {
  return {
    x: exactLinearCombination(
      matrix.m00, point.x, matrix.m01, point.y, matrix.m02),
    y: exactLinearCombination(
      matrix.m10, point.x, matrix.m11, point.y, matrix.m12),
    denominator: exactLinearCombination(
      matrix.m20, point.x, matrix.m21, point.y, matrix.m22),
  }
}

function denominatorSign(
  matrix: Readonly<ProjectiveMatrix2D>,
  point: Readonly<PointType>
) {
  const denominator = exactLinearCombination(
    matrix.m20,
    point.x,
    matrix.m21,
    point.y,
    matrix.m22
  ).coefficient
  return denominator > BIGINT_ZERO ? 1 : denominator < BIGINT_ZERO ? -1 : 0
}

function mapPoint(
  matrix: Readonly<ProjectiveMatrix2D>,
  point: Readonly<PointType>
): PointType | undefined {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined

  const homogeneous = exactHomogeneousComponents(matrix, point)
  const { denominator } = homogeneous
  if (denominator.coefficient === BIGINT_ZERO) return undefined

  const x = divideDyadics(homogeneous.x, denominator)
  const y = divideDyadics(homogeneous.y, denominator)
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined
}

function mapDomainCorners(
  matrix: Readonly<ProjectiveMatrix2D>,
  domain: Readonly<Rect>
): PointType[] {
  const corners = domainCorners(domain)
  const denominatorSigns = corners.map((point) => denominatorSign(matrix, point))
  // The homogeneous denominator is affine in x/y. A uniform non-zero sign at
  // every corner therefore proves the whole rectangular domain avoids w = 0.
  const sign = denominatorSigns[0]
  if (sign === 0 || denominatorSigns.some((value) => value !== sign)) {
    throw new RangeError("projective domain must not touch or cross the horizon")
  }

  return corners.map((point) => {
    const mapped = mapPoint(matrix, point)
    if (!mapped) {
      throw new RangeError("projective domain must have finite projected corners")
    }
    return mapped
  })
}

function boundsOf(points: readonly PointType[]): ContentRect {
  const xs = points.map(({ x }) => x)
  const ys = points.map(({ y }) => y)
  const left = nextDown(Math.min(...xs))
  const top = nextDown(Math.min(...ys))
  const right = nextUp(Math.max(...xs))
  const bottom = nextUp(Math.max(...ys))
  const width = expandExtent(left, right - left, right)
  const height = expandExtent(top, bottom - top, bottom)
  const bounds = { x: left, y: top, width, height }
  if (Object.values(bounds).some((value) => !Number.isFinite(value))) {
    throw new RangeError("projective domain must have finite projected bounds")
  }
  return bounds
}

function nextUp(value: number) {
  if (value === Number.POSITIVE_INFINITY) return value
  if (Object.is(value, -0)) return Number.MIN_VALUE
  FLOAT_VIEW.setFloat64(0, value)
  const bits = FLOAT_VIEW.getBigUint64(0)
  FLOAT_VIEW.setBigUint64(0, value >= 0 ? bits + BIGINT_ONE : bits - BIGINT_ONE)
  return FLOAT_VIEW.getFloat64(0)
}

function nextDown(value: number) {
  return -nextUp(-value)
}

function expandExtent(origin: number, extent: number, end: number) {
  if (origin + extent >= end) return extent
  return extent + Math.max(Number.MIN_VALUE, Math.abs(extent) * Number.EPSILON)
}

function pointInDomain(
  domain: Readonly<Rect>,
  point: Readonly<PointType>
) {
  return point.x >= domain.x &&
    point.x <= domain.x + domain.width &&
    point.y >= domain.y &&
    point.y <= domain.y + domain.height
}

export function containsProjectiveLocalPoint(
  mapping: FiniteProjectiveMapping,
  point: Readonly<PointType>
) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false
  return pointInDomain(mapping.localDomain, point)
}

export function createFiniteProjectiveMapping(
  localToContent: Readonly<ProjectiveMatrix2D>,
  localDomain: Readonly<Rect>
): FiniteProjectiveMapping {
  // Keep affine-only package loading compatible with runtimes that cannot
  // execute the exact arithmetic required by projective placement.
  initializeExactRuntime()
  const matrix = Object.freeze(copyMatrix(localToContent))
  const domain = Object.freeze(copyDomain(localDomain))
  const projectedCorners = mapDomainCorners(matrix, domain)
  const inverse = Object.freeze(invertMatrix(matrix))

  return Object.freeze({
    localDomain: domain,
    localToContent: matrix,
    contentToLocal: inverse,
    contentBounds: Object.freeze(boundsOf(projectedCorners)),
  })
}

export function mapProjectiveLocalToContentPoint(
  mapping: FiniteProjectiveMapping,
  point: Readonly<PointType>
): ContentPoint | undefined {
  if (!containsProjectiveLocalPoint(mapping, point)) return undefined
  return mapPoint(mapping.localToContent, point)
}

export function mapProjectiveContentToLocalPoint(
  mapping: FiniteProjectiveMapping,
  point: Readonly<ContentPoint>
): PointType | undefined {
  const localPoint = mapPoint(mapping.contentToLocal, point)
  return localPoint && containsProjectiveLocalPoint(mapping, localPoint)
    ? localPoint
    : undefined
}

/** @internal Returns conservative Content bounds for the visible local part. */
export function mapProjectiveLocalRectToContentBounds(
  mapping: FiniteProjectiveMapping,
  rect: Readonly<Rect>
): ContentRect | undefined {
  const left = Math.max(mapping.localDomain.x, rect.x)
  const top = Math.max(mapping.localDomain.y, rect.y)
  const right = Math.min(
    mapping.localDomain.x + mapping.localDomain.width,
    rect.x + rect.width
  )
  const bottom = Math.min(
    mapping.localDomain.y + mapping.localDomain.height,
    rect.y + rect.height
  )
  if (right < left || bottom < top) return undefined
  const points = domainCorners({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }).map((point) => mapPoint(mapping.localToContent, point))
  if (points.some((point) => !point)) return undefined
  return boundsOf(points as PointType[])
}

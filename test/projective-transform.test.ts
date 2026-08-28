import { describe, expect, it, vi } from "vitest"

import {
  containsProjectiveLocalPoint,
  createFiniteProjectiveMapping,
  mapProjectiveContentToLocalPoint,
  mapProjectiveLocalToContentPoint,
  type ProjectiveMatrix2D,
} from "../src/stay/transforms/projective2D"

const perspective: ProjectiveMatrix2D = {
  m00: 1.2,
  m01: 0.1,
  m02: 30,
  m10: -0.2,
  m11: 0.9,
  m12: 20,
  m20: 0.001,
  m21: -0.0005,
  m22: 1,
}

function expectPoint(
  point: { x: number; y: number } | undefined,
  expected: { x: number; y: number }
) {
  expect(point).toBeDefined()
  expect(point!.x).toBeCloseTo(expected.x)
  expect(point!.y).toBeCloseTo(expected.y)
}

function scaleMatrix(
  matrix: Readonly<ProjectiveMatrix2D>,
  scale: number
): ProjectiveMatrix2D {
  return {
    m00: matrix.m00 * scale,
    m01: matrix.m01 * scale,
    m02: matrix.m02 * scale,
    m10: matrix.m10 * scale,
    m11: matrix.m11 * scale,
    m12: matrix.m12 * scale,
    m20: matrix.m20 * scale,
    m21: matrix.m21 * scale,
    m22: matrix.m22 * scale,
  }
}

describe("finite projective mapping", () => {
  it("does not require the exact projective runtime for affine-only use", async () => {
    vi.stubGlobal("BigInt", undefined)
    try {
      const { resolveChildPlacement } = await import(
        "../src/stay/placements/childPlacement"
      )
      expect(resolveChildPlacement({ type: "affine", x: 12 }).snapshot).toEqual({
        type: "affine",
        matrix: { a: 1, b: 0, c: 0, d: 1, e: 12, f: 0 },
      })
      expect(() => createFiniteProjectiveMapping(
        perspective,
        { x: 0, y: 0, width: 20, height: 10 }
      )).toThrow("projective placement requires BigInt")
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("maps local points to Content and back through an invertible homography", () => {
    const transform = createFiniteProjectiveMapping(
      perspective,
      { x: 0, y: 0, width: 200, height: 100 }
    )

    const contentPoint = mapProjectiveLocalToContentPoint(transform, { x: 50, y: 20 })
    expectPoint(contentPoint, { x: 92 / 1.04, y: 28 / 1.04 })
    expectPoint(
      mapProjectiveContentToLocalPoint(transform, contentPoint!),
      { x: 50, y: 20 }
    )

  })

  it("keeps the declared domain and conservative Content bounds immutable", () => {
    const domain = { x: 0, y: 0, width: 200, height: 100 }
    const transform = createFiniteProjectiveMapping(perspective, domain)
    domain.width = 1

    expect(transform.localDomain).toEqual({ x: 0, y: 0, width: 200, height: 100 })
    expect(Object.isFrozen(transform)).toBe(true)
    expect(Object.isFrozen(transform.localToContent)).toBe(true)
    expect(Object.isFrozen(transform.contentToLocal)).toBe(true)
    expect(Object.isFrozen(transform.contentBounds)).toBe(true)
    expect(transform.contentBounds.x).toBeCloseTo(30)
    expect(transform.contentBounds.y).toBeCloseTo(-20 / 1.2)
    expect(transform.contentBounds.width).toBeCloseTo(280 / 1.15 - 30)
    expect(transform.contentBounds.height).toBeCloseTo(110 / 0.95 + 20 / 1.2)
  })

  it("treats non-zero homogeneous matrix scales as the same mapping", () => {
    const domain = { x: 0, y: 0, width: 200, height: 100 }
    const original = createFiniteProjectiveMapping(perspective, domain)
    const scaled = createFiniteProjectiveMapping(scaleMatrix(perspective, -1e120), domain)

    const localPoint = { x: 137, y: 42 }
    const originalPoint = mapProjectiveLocalToContentPoint(original, localPoint)
    expectPoint(mapProjectiveLocalToContentPoint(scaled, localPoint), originalPoint!)
    expect(scaled.contentBounds.x).toBeCloseTo(original.contentBounds.x)
    expect(scaled.contentBounds.y).toBeCloseTo(original.contentBounds.y)
    expect(scaled.contentBounds.width).toBeCloseTo(original.contentBounds.width)
    expect(scaled.contentBounds.height).toBeCloseTo(original.contentBounds.height)
  })

  it("uses the finite local domain as the shared mapping boundary", () => {
    const transform = createFiniteProjectiveMapping(
      perspective,
      { x: 10, y: 20, width: 50, height: 40 }
    )

    expect(containsProjectiveLocalPoint(transform, { x: 10, y: 20 })).toBe(true)
    expect(containsProjectiveLocalPoint(transform, { x: 60, y: 60 })).toBe(true)
    expect(containsProjectiveLocalPoint(transform, { x: 9, y: 20 })).toBe(false)
    expect(mapProjectiveLocalToContentPoint(transform, { x: 9, y: 20 })).toBeUndefined()
    expect(mapProjectiveContentToLocalPoint(transform, { x: -10_000, y: -10_000 }))
      .toBeUndefined()
  })

  it("accepts either homogeneous sign when the whole domain stays on one side", () => {
    const negativeIdentity = createFiniteProjectiveMapping({
      m00: -1, m01: 0, m02: 0,
      m10: 0, m11: -1, m12: 0,
      m20: 0, m21: 0, m22: -1,
    }, { x: 0, y: 0, width: 10, height: 10 })
    expectPoint(
      mapProjectiveLocalToContentPoint(negativeIdentity, { x: 4, y: 7 }),
      { x: 4, y: 7 }
    )

    const horizonOutsideDomain = createFiniteProjectiveMapping({
      m00: 0, m01: 0, m02: 1,
      m10: 0, m11: 1, m12: 0,
      m20: 1, m21: 0, m22: 0,
    }, { x: 1, y: 0, width: 9, height: 10 })
    expectPoint(
      mapProjectiveLocalToContentPoint(horizonOutsideDomain, { x: 2, y: 6 }),
      { x: 0.5, y: 3 }
    )
  })

  it("rejects singular and non-finite matrices", () => {
    expect(() => createFiniteProjectiveMapping({
      m00: 1, m01: 0, m02: 0,
      m10: 2, m11: 0, m12: 0,
      m20: 0, m21: 0, m22: 1,
    }, { x: 0, y: 0, width: 10, height: 10 }))
      .toThrow("projective matrix must be invertible")
    expect(() => createFiniteProjectiveMapping({
      ...perspective,
      m12: Number.NaN,
    }, { x: 0, y: 0, width: 10, height: 10 }))
      .toThrow("projective matrix m12 must be finite")
    expect(() => createFiniteProjectiveMapping({
      m00: 25073519, m01: 268390138, m02: 750440539,
      m10: -353651508, m11: 89991384, m12: 642437229,
      m20: -328577989, m21: 358381522, m22: 1392877768,
    }, { x: 0, y: 0, width: 1, height: 1 }))
      .toThrow("projective matrix must be invertible")
    expect(() => createFiniteProjectiveMapping({
      m00: 1, m01: 5, m02: 0,
      m10: 9, m11: 45, m12: 0,
      m20: 0, m21: 0, m22: 7,
    }, { x: 0, y: 0, width: 1, height: 1 }))
      .toThrow("projective matrix must be invertible")
  })

  it("rejects invalid domains and domains that touch or cross the horizon", () => {
    expect(() => createFiniteProjectiveMapping(
      perspective,
      { x: 0, y: 0, width: 0, height: 10 }
    )).toThrow("projective domain width and height must be greater than 0")
    expect(() => createFiniteProjectiveMapping(
      perspective,
      { x: 0, y: 0, width: 10, height: Number.POSITIVE_INFINITY }
    )).toThrow("projective domain height must be finite")
    expect(() => createFiniteProjectiveMapping(
      perspective,
      { x: Number.MAX_VALUE, y: 0, width: Number.MAX_VALUE, height: 10 }
    )).toThrow("projective domain must have finite edges")

    expect(() => createFiniteProjectiveMapping({
      m00: 1, m01: 0, m02: 0,
      m10: 0, m11: 1, m12: 0,
      m20: 1, m21: 0, m22: -5,
    }, { x: 0, y: 0, width: 10, height: 10 }))
      .toThrow("projective domain must not touch or cross the horizon")
    expect(() => createFiniteProjectiveMapping({
      m00: 0, m01: 0, m02: 1,
      m10: 0, m11: 1, m12: 0,
      m20: 1, m21: 0, m22: 0,
    }, { x: 0, y: 0, width: 10, height: 10 }))
      .toThrow("projective domain must not touch or cross the horizon")
    expect(() => createFiniteProjectiveMapping({
      m00: 1, m01: 0, m02: 0,
      m10: 0, m11: 0, m12: 1,
      m20: 1e308, m21: -1e308, m22: 0,
    }, { x: 1, y: 1, width: 1, height: 1 }))
      .toThrow("projective domain must not touch or cross the horizon")
  })

  it("does not infer a caller-specific tolerance for inverse results", () => {
    const drift = createFiniteProjectiveMapping({
      m00: 1, m01: 0, m02: 0,
      m10: 1, m11: 0.0011, m12: 0,
      m20: 0, m21: 0, m22: 1,
    }, { x: 0, y: 0, width: 1, height: 1 })
    const boundary = mapProjectiveLocalToContentPoint(drift, { x: 1, y: 1 })
    expect(mapProjectiveContentToLocalPoint(drift, boundary!)).toBeUndefined()

    const identity = createFiniteProjectiveMapping({
      m00: 1, m01: 0, m02: 0,
      m10: 0, m11: 1, m12: 0,
      m20: 0, m21: 0, m22: 1,
    }, { x: 1e15, y: 0, width: 1, height: 1 })
    expect(mapProjectiveContentToLocalPoint(identity, { x: 1e15 + 10, y: 0.5 }))
      .toBeUndefined()
  })

  it("keeps Content bounds outward-rounded around every projected corner", () => {
    const transform = createFiniteProjectiveMapping({
      m00: 10000001000, m01: 0, m02: -10000000000,
      m10: 0, m11: 1, m12: 0,
      m20: 9999999999, m21: 0, m22: 1,
    }, { x: 0, y: 0, width: 1, height: 1 })
    const projectedRight = mapProjectiveLocalToContentPoint(transform, { x: 1, y: 0 })!

    expect(transform.contentBounds.x + transform.contentBounds.width)
      .toBeGreaterThanOrEqual(projectedRight.x)

    const interiorDrift = createFiniteProjectiveMapping({
      m00: 0, m01: 1, m02: 0,
      m10: 20.000000000000004, m11: 20, m12: 20,
      m20: 30, m21: 30, m22: 30,
    }, { x: 0, y: 0, width: 1, height: 1 })
    const projectedInterior = mapProjectiveLocalToContentPoint(
      interiorDrift,
      { x: 0.01, y: 0.03 }
    )!
    expect(projectedInterior.y).toBeGreaterThanOrEqual(interiorDrift.contentBounds.y)

    const multiUlpDrift = createFiniteProjectiveMapping({
      m00: -9.737506582285338e-14,
      m01: -0.000608984919302872,
      m02: -73564089047.23409,
      m10: 2.2776710357841702e-11,
      m11: -698004729974478700,
      m12: -3.3534599302392997e-7,
      m20: 4.987470157246468e-21,
      m21: -83330.75808110654,
      m22: -5.2338611781054925e-20,
    }, { x: 0, y: 0, width: 1, height: 1 })
    const projectedMultiUlpInterior = mapProjectiveLocalToContentPoint(
      multiUlpDrift,
      { x: 0.8601479462979515, y: 0.9237247751156727 }
    )!
    expect(projectedMultiUlpInterior.y).toBeLessThanOrEqual(
      multiUlpDrift.contentBounds.y + multiUlpDrift.contentBounds.height
    )
  })

  it("does not misclassify numerically collapsed domains as horizon crossings", () => {
    expect(() => createFiniteProjectiveMapping({
      m00: 1, m01: 0, m02: 0,
      m10: 0, m11: 1, m12: 0,
      m20: 1, m21: 1, m22: 1,
    }, { x: 1e308, y: 1e308, width: 2e292, height: 2e292 }))
      .not.toThrow()
  })

  it("inverts stable matrices whose determinant would underflow directly", () => {
    const transform = createFiniteProjectiveMapping({
      m00: 1, m01: 0, m02: 0,
      m10: 0, m11: 1e-200, m12: 0,
      m20: 0, m21: 0, m22: 1e-200,
    }, { x: 0, y: 0, width: 1e-200, height: 1 })
    const content = mapProjectiveLocalToContentPoint(transform, { x: 1e-200, y: 1 })
    expectPoint(content, { x: 1, y: 1 })
    expectPoint(
      mapProjectiveContentToLocalPoint(transform, content!),
      { x: 1e-200, y: 1 }
    )
  })

  it("preserves finite inverse representations across the full exponent range", () => {
    const wideRange = createFiniteProjectiveMapping({
      m00: 1e308, m01: 0, m02: 0,
      m10: 0, m11: 1e-308, m12: 0,
      m20: 0, m21: 0, m22: 1,
    }, { x: 0, y: 0, width: 1e-308, height: 1 })
    const wideContent = mapProjectiveLocalToContentPoint(
      wideRange,
      { x: 1e-308, y: 1 }
    )
    expectPoint(wideContent, { x: 1, y: 1e-308 })
    expectPoint(
      mapProjectiveContentToLocalPoint(wideRange, wideContent!),
      { x: 1e-308, y: 1 }
    )

    const tinyPivots = createFiniteProjectiveMapping({
      m00: 1, m01: 0, m02: 0,
      m10: 0, m11: 1e-310, m12: 0,
      m20: 0, m21: 0, m22: 1e-310,
    }, { x: 0, y: 0, width: 1e-310, height: 1 })
    const tinyContent = mapProjectiveLocalToContentPoint(
      tinyPivots,
      { x: 1e-310, y: 1 }
    )
    expectPoint(tinyContent, { x: 1, y: 1 })
    expectPoint(
      mapProjectiveContentToLocalPoint(tinyPivots, tinyContent!),
      { x: 1e-310, y: 1 }
    )

    const q = 2 ** 486
    const n = 2 ** 52 + 1
    expect(() => createFiniteProjectiveMapping({
      m00: 1, m01: 0, m02: 0,
      m10: 0, m11: n * q, m12: (n - 1) * q,
      m20: 0, m21: (n + 1) * q, m22: n * q,
    }, { x: 0, y: 0, width: 1, height: 1 })).not.toThrow()
  })
})

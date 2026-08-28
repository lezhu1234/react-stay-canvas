import { describe, expect, it } from "vitest"

import {
  projectivePlacementFromQuad,
  type ProjectiveQuad,
} from "../src/utils/projectivePlacement"
import {
  createFiniteProjectiveMapping,
  mapProjectiveLocalToContentPoint,
} from "../src/stay/transforms/projective2D"

function expectPoint(
  actual: { x: number; y: number } | undefined,
  expected: { x: number; y: number }
) {
  expect(actual).toBeDefined()
  expect(actual!.x).toBeCloseTo(expected.x)
  expect(actual!.y).toBeCloseTo(expected.y)
}

function expectMappedCorners(
  domain: { x: number; y: number; width: number; height: number },
  quad: ProjectiveQuad
) {
  const placement = projectivePlacementFromQuad(domain, quad)
  const mapping = createFiniteProjectiveMapping(placement.matrix, placement.domain)
  expectPoint(mapProjectiveLocalToContentPoint(mapping, {
    x: domain.x,
    y: domain.y,
  }), quad.topLeft)
  expectPoint(mapProjectiveLocalToContentPoint(mapping, {
    x: domain.x + domain.width,
    y: domain.y,
  }), quad.topRight)
  expectPoint(mapProjectiveLocalToContentPoint(mapping, {
    x: domain.x + domain.width,
    y: domain.y + domain.height,
  }), quad.bottomRight)
  expectPoint(mapProjectiveLocalToContentPoint(mapping, {
    x: domain.x,
    y: domain.y + domain.height,
  }), quad.bottomLeft)
}

describe("projectivePlacementFromQuad", () => {
  it("maps a non-zero local domain onto a perspective quadrilateral", () => {
    expectMappedCorners(
      { x: 20, y: 30, width: 240, height: 120 },
      {
        topLeft: { x: 40, y: 12 },
        topRight: { x: 310, y: 38 },
        bottomRight: { x: 292, y: 154 },
        bottomLeft: { x: 28, y: 178 },
      }
    )
  })

  it("supports affine quadrilaterals through the same placement contract", () => {
    expectMappedCorners(
      { x: 0, y: 0, width: 100, height: 50 },
      {
        topLeft: { x: 10, y: 20 },
        topRight: { x: 210, y: 40 },
        bottomRight: { x: 190, y: 140 },
        bottomLeft: { x: -10, y: 120 },
      }
    )
  })

  it("returns an independent snapshot and does not mutate its inputs", () => {
    const domain = { x: 0, y: 0, width: 100, height: 80 }
    const quad: ProjectiveQuad = {
      topLeft: { x: 5, y: 10 },
      topRight: { x: 130, y: 20 },
      bottomRight: { x: 120, y: 100 },
      bottomLeft: { x: 0, y: 110 },
    }
    const placement = projectivePlacementFromQuad(domain, quad)

    domain.width = 1
    quad.topLeft.x = 999

    expect(placement.domain).toEqual({ x: 0, y: 0, width: 100, height: 80 })
    expect(placement.matrix.m02).toBe(5)
  })

  it("rejects invalid domains and quadrilaterals", () => {
    const quad: ProjectiveQuad = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 100, y: 0 },
      bottomRight: { x: 100, y: 80 },
      bottomLeft: { x: 0, y: 80 },
    }
    expect(() => projectivePlacementFromQuad(
      { x: 0, y: 0, width: 0, height: 80 },
      quad
    )).toThrow("projective domain width and height must be greater than 0")
    expect(() => projectivePlacementFromQuad(
      { x: 0, y: 0, width: 100, height: 80 },
      { ...quad, topRight: { x: Number.NaN, y: 0 } }
    )).toThrow("quad.topRight must contain finite coordinates")
    expect(() => projectivePlacementFromQuad(
      { x: 0, y: 0, width: 100, height: 80 },
      {
        topLeft: { x: 0, y: 0 },
        topRight: { x: 0, y: 0 },
        bottomRight: { x: 0, y: 0 },
        bottomLeft: { x: 0, y: 0 },
      }
    )).toThrow("invertible")
  })
})

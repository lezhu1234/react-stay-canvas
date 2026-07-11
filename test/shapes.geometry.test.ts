import { describe, it, expect } from "vitest"
import { Rectangle, Circle, Line, Point } from "react-stay-canvas"

// Dimension 1 (Shapes): pure geometry — no canvas needed.

describe("Rectangle geometry", () => {
  const rect = () => new Rectangle({ x: 10, y: 20, width: 100, height: 50 })

  it("computes area", () => {
    expect(rect().area).toBe(100 * 50)
  })

  it("contains points inside and rejects outside", () => {
    const r = rect()
    expect(r.contains(new Point({ x: 50, y: 40 }))).toBe(true)
    expect(r.contains(new Point({ x: 5, y: 40 }))).toBe(false)
    expect(r.contains(new Point({ x: 200, y: 40 }))).toBe(false)
  })

  it("exposes corner coordinates", () => {
    const r = rect()
    expect(r.leftTop).toMatchObject({ x: 10, y: 20 })
    expect(r.rightBottom).toMatchObject({ x: 110, y: 70 })
  })

  it("computeFitInfo scales content to fit inside the rect", () => {
    // fit a 50x50 into 100x50 -> limited by height -> ratio 1
    const { scaleRatio } = rect().computeFitInfo(50, 50)
    expect(scaleRatio).toBeCloseTo(1)
  })

  it("copy() is independent of the original", () => {
    const r = rect()
    const c = r.copy()
    c.update({ x: 999 })
    expect(r.x).toBe(10)
    expect(c.x).toBe(999)
  })
})

describe("Circle geometry", () => {
  it("contains points within the radius", () => {
    const circle = new Circle({ x: 0, y: 0, radius: 10 })
    expect(circle.contains(new Point({ x: 3, y: 4 }))).toBe(true) // dist 5
    expect(circle.contains(new Point({ x: 8, y: 8 }))).toBe(false) // dist ~11.3
  })
})

describe("Line geometry", () => {
  const line = () => new Line({ x1: 0, y1: 0, x2: 10, y2: 0 })

  it("length", () => {
    expect(line().len()).toBeCloseTo(10)
  })

  it("segment distance uses the nearer endpoint beyond the segment", () => {
    const l = line()
    expect(l.segmentDistanceToPoint(new Point({ x: 5, y: 3 }))).toBeCloseTo(3)
    // point past the x2 end -> distance to that endpoint (10), not the infinite line (0)
    expect(l.segmentDistanceToPoint(new Point({ x: 20, y: 0 }))).toBeCloseTo(10)
  })

  it("nearPoint respects the offset", () => {
    const l = line()
    expect(l.nearPoint(new Point({ x: 5, y: 3 }), 5)).toBe(true)
    expect(l.nearPoint(new Point({ x: 5, y: 30 }), 5)).toBe(false)
  })
})

describe("Point geometry", () => {
  it("distance and near", () => {
    const p = new Point({ x: 0, y: 0 })
    expect(p.distance({ x: 3, y: 4 })).toBeCloseTo(5)
    expect(p.near(new Point({ x: 3, y: 4 }), 6)).toBe(true)
    expect(p.near(new Point({ x: 3, y: 4 }), 4)).toBe(false)
  })
})

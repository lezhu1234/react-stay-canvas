import { describe, it, expect } from "vitest"
import { Line, Rectangle } from "react-stay-canvas"

// Dimension 7 (Animation): the interpolation core — intermediateState(before,
// after, ratio, easing) is what progress() drives each frame.

describe("animation interpolation (intermediateState)", () => {
  it("Line endpoints interpolate linearly", () => {
    const a = new Line({ x1: 0, y1: 0, x2: 0, y2: 0 })
    const b = new Line({ x1: 0, y1: 0, x2: 10, y2: 20 })
    const at = (r: number) => b.intermediateState(a, b, r, "linear") as any
    expect(at(0).x2).toBeCloseTo(0)
    expect(at(0.5).x2).toBeCloseTo(5)
    expect(at(0.5).y2).toBeCloseTo(10)
    expect(at(1).x2).toBeCloseTo(10)
  })

  it("Rectangle box interpolates x/y/width/height", () => {
    const a = new Rectangle({ x: 0, y: 0, width: 0, height: 0 })
    const b = new Rectangle({ x: 10, y: 20, width: 100, height: 200 })
    const mid = b.intermediateState(a, b, 0.5, "linear") as any
    expect(mid.x).toBeCloseTo(5)
    expect(mid.y).toBeCloseTo(10)
    expect(mid.width).toBeCloseTo(50)
    expect(mid.height).toBeCloseTo(100)
  })

  it("easing curves the progress (easeInQuad slower than linear at t=0.5)", () => {
    const a = new Rectangle({ x: 0, y: 0, width: 0, height: 0 })
    const b = new Rectangle({ x: 0, y: 0, width: 10, height: 0 })
    const lin = b.intermediateState(a, b, 0.5, "linear") as any
    const ease = b.intermediateState(a, b, 0.5, "easeInQuad") as any
    expect(lin.width).toBeCloseTo(5)
    expect(ease.width).toBeLessThan(lin.width) // ease-in starts slow
  })
})

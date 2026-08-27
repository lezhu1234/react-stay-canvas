import { describe, expect, it } from "vitest"

import { fitRect, unionRects } from "react-stay-canvas"

describe("rectangle fit utilities", () => {
  it("unions negative and positive rectangles without mutating the inputs", () => {
    const first = { x: -20, y: 10, width: 30, height: 40 }
    const second = { x: 5, y: -10, width: 20, height: 30 }

    expect(unionRects([first, second])).toEqual({
      x: -20,
      y: -10,
      width: 45,
      height: 60,
    })
    expect(first).toEqual({ x: -20, y: 10, width: 30, height: 40 })
    expect(unionRects([])).toBeUndefined()
  })

  it("uniformly contains and centers a source rectangle", () => {
    expect(fitRect(
      { x: 100, y: 50, width: 400, height: 200 },
      { x: 20, y: 30, width: 1000, height: 600 }
    )).toEqual({
      rect: { x: 20, y: 80, width: 1000, height: 500 },
      scale: 2.5,
    })
  })

  it("supports a zero extent on one axis and rejects invalid rectangles", () => {
    expect(fitRect(
      { x: 10, y: 20, width: 0, height: 100 },
      { x: 0, y: 0, width: 200, height: 400 }
    )).toEqual({
      rect: { x: 100, y: 0, width: 0, height: 400 },
      scale: 4,
    })
    expect(() => fitRect(
      { x: 0, y: 0, width: 0, height: 0 },
      { x: 0, y: 0, width: 100, height: 100 }
    )).toThrow("source must have a positive width or height")
    expect(() => unionRects([{ x: 0, y: 0, width: Infinity, height: 10 }]))
      .toThrow("rect.width must be finite")
  })
})

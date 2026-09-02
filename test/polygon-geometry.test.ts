import { describe, expect, it, vi } from "vitest"
import { Polygon } from "react-stay-canvas"

const trianglePoints = [
  { x: 0, y: 0 },
  { x: 12, y: 0 },
  { x: 0, y: 6 },
]

describe("Polygon geometry", () => {
  it("owns at least three points and rejects invalid replacement geometry atomically", () => {
    expect(() => new Polygon({ points: [] })).toThrow("Polygon requires at least 3 points")

    const source = trianglePoints.map((point) => ({ ...point }))
    const polygon = new Polygon({ points: source })
    source[0].x = 99
    expect(polygon.points[0]).toEqual({ x: 0, y: 0 })

    expect(() => polygon.update({ points: [{ x: 1, y: 2 }] })).toThrow(
      "Polygon requires at least 3 points"
    )
    expect(polygon.points).toEqual(trianglePoints)
  })

  it("computes bounds, signed-area magnitude, and the area centroid", () => {
    const polygon = new Polygon({ points: trianglePoints })

    expect(polygon.getBound()).toEqual({ x: 0, y: 0, width: 12, height: 6 })
    expect(polygon.area).toBe(36)
    expect(polygon.getCenterPoint()).toEqual({ x: 4, y: 2 })
  })

  it("hits the filled area and its boundary without accepting the coarse bound", () => {
    const polygon = new Polygon({ points: trianglePoints })

    expect(polygon.contains({ x: 2, y: 2 })).toBe(true)
    expect(polygon.contains({ x: 6, y: 3 })).toBe(true)
    expect(polygon.contains({ x: 10, y: 5 })).toBe(false)
    expect(polygon.contains({ x: -1, y: 0 })).toBe(false)
  })

  it("matches native nonzero and evenodd fill-rule semantics", () => {
    const twiceWoundSquare = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]

    expect(new Polygon({ points: twiceWoundSquare }).contains({ x: 5, y: 5 })).toBe(true)
    expect(new Polygon({ points: twiceWoundSquare, fillRule: "evenodd" }).contains({ x: 5, y: 5 })).toBe(false)
  })

  it("traces a closed native path for fill and stroke and restores its filter", () => {
    const commands: Array<string | [string, number, number]> = []
    const context = {
      filter: "none",
      beginPath: vi.fn(() => commands.push("begin")),
      moveTo: vi.fn((x: number, y: number) => commands.push(["move", x, y])),
      lineTo: vi.fn((x: number, y: number) => commands.push(["line", x, y])),
      closePath: vi.fn(() => commands.push("close")),
      fill: vi.fn(),
      stroke: vi.fn(),
    }
    const polygon = new Polygon({
      points: trianglePoints,
      fillRule: "evenodd",
      filter: "blur(4px)",
    })
    const drawProps = { context: context as never, now: 0, width: 20, height: 20 }

    polygon.commonDraw(drawProps)
    polygon.fill(drawProps)
    polygon.stroke(drawProps)
    polygon.afterDraw(drawProps)

    expect(context.fill).toHaveBeenCalledWith("evenodd")
    expect(context.stroke).toHaveBeenCalledOnce()
    expect(context.closePath).toHaveBeenCalledTimes(2)
    expect(context.filter).toBe("none")
    expect(commands.slice(0, 5)).toEqual([
      "begin",
      ["move", 0, 0],
      ["line", 12, 0],
      ["line", 0, 6],
      "close",
    ])
  })

  it("moves, zooms, updates, and copies independently", () => {
    const polygon = new Polygon({
      points: trianglePoints,
      zoomCenter: { x: 0, y: 0 },
      layer: 1,
      strokeConfig: { lineWidth: 2, dash: [3, 2] },
      fillConfig: { color: { r: 10, g: 20, b: 30, a: 1 } },
    })

    polygon.move(3, 4)
    expect(polygon.points).toEqual([
      { x: 3, y: 4 },
      { x: 15, y: 4 },
      { x: 3, y: 10 },
    ])
    polygon.zoom(2)
    expect(polygon.getBound()).toEqual({ x: 6, y: 8, width: 24, height: 12 })
    expect(polygon.strokeConfig.lineWidth).toBe(4)

    const copy = polygon.copy()
    copy.update({ points: trianglePoints })
    copy.strokeConfig.dash.push(9)
    copy.fillConfig.color.r = 200

    expect(copy.layer).toBe(1)
    expect(polygon.getBound()).toEqual({ x: 6, y: 8, width: 24, height: 12 })
    expect(polygon.strokeConfig.dash).toEqual([3, 2])
    expect(polygon.fillConfig.color.r).toBe(10)
  })
})

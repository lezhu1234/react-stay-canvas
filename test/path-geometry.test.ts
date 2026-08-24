import { afterEach, describe, expect, it, vi } from "vitest"
import { Path, Point } from "react-stay-canvas"

describe("Path geometry", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("treats an empty path as empty geometry", () => {
    const path = new Path({ points: [], radius: 4 })

    expect(path.getBound()).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    expect(path.getCenterPoint()).toEqual({ x: 0, y: 0 })
    expect(path.contains({ x: 0, y: 0 })).toBe(false)
  })

  it("uses the radius as a single point's bound and hit area", () => {
    const path = new Path({ points: [new Point({ x: 10, y: 20 })], radius: 5 })

    expect(path.getBound()).toEqual({ x: 5, y: 15, width: 10, height: 10 })
    expect(path.contains({ x: 13, y: 24 })).toBe(true)
    expect(path.contains({ x: 10, y: 25 })).toBe(true)
    expect(path.contains({ x: 16, y: 20 })).toBe(false)
  })

  it("hits the nearest segment and rejects points inside only the coarse bound", () => {
    const path = new Path({
      points: [
        new Point({ x: 10, y: 10 }),
        new Point({ x: 30, y: 10 }),
        new Point({ x: 30, y: 40 }),
      ],
      radius: 5,
    })

    expect(path.getBound()).toEqual({ x: 5, y: 5, width: 30, height: 40 })
    expect(path.contains({ x: 20, y: 14 })).toBe(true)
    expect(path.contains({ x: 25, y: 20 })).toBe(true)
    expect(path.contains({ x: 20, y: 20 })).toBe(false)
    expect(path.contains({ x: 36, y: 20 })).toBe(false)
  })

  it("uses projection distance for diagonal segments", () => {
    const path = new Path({
      points: [new Point({ x: 0, y: 0 }), new Point({ x: 10, y: 10 })],
      radius: 2,
    })

    expect(path.contains({ x: 5, y: 6 })).toBe(true)
    expect(path.contains({ x: 5, y: 9 })).toBe(false)
  })

  it("skips zero-length connectors when consecutive points repeat", () => {
    const commands: number[][] = []
    vi.stubGlobal("Path2D", class {
      moveTo(x: number, y: number) { commands.push([x, y]) }
      arc(x: number, y: number, radius: number, start: number, end: number) {
        commands.push([x, y, radius, start, end])
      }
      lineTo(x: number, y: number) { commands.push([x, y]) }
    })
    const path = new Path({
      points: [
        new Point({ x: 4, y: 6 }),
        new Point({ x: 4, y: 6 }),
        new Point({ x: 14, y: 6 }),
      ],
      radius: 3,
    })

    void path.path

    expect(commands.flat().every(Number.isFinite)).toBe(true)
    expect(path.contains({ x: 4, y: 8 })).toBe(true)
  })

  it("recomputes geometry after movement and zoom", () => {
    const path = new Path({
      points: [new Point({ x: 10, y: 10 }), new Point({ x: 20, y: 10 })],
      radius: 2,
      zoomCenter: { x: 0, y: 0 },
    })

    path.move(5, 10)
    expect(path.getBound()).toEqual({ x: 13, y: 18, width: 14, height: 4 })

    path.zoom(2)
    expect(path.getBound()).toEqual({ x: 26, y: 36, width: 28, height: 8 })
    expect(path.contains({ x: 40, y: 40 })).toBe(true)
  })
})

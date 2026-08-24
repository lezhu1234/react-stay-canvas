import { afterEach, describe, expect, it, vi } from "vitest"
import { Path, Point } from "react-stay-canvas"

describe("Path geometry", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("treats an empty path as empty geometry", () => {
    const path = new Path({ points: [] })

    expect(path.getBound()).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    expect(path.getCenterPoint()).toEqual({ x: 0, y: 0 })
    expect(path.contains({ x: 0, y: 0 })).toBe(false)
  })

  it("uses half the native line width as a single point's bound and hit area", () => {
    const path = new Path({
      points: [new Point({ x: 10, y: 20 })],
      strokeConfig: { lineWidth: 10 },
    })

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
      strokeConfig: { lineWidth: 10 },
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
      strokeConfig: { lineWidth: 4 },
    })

    expect(path.contains({ x: 5, y: 6 })).toBe(true)
    expect(path.contains({ x: 5, y: 9 })).toBe(false)
  })

  it("builds one native centerline even when consecutive points repeat", () => {
    const commands: number[][] = []
    vi.stubGlobal("Path2D", class {
      moveTo(x: number, y: number) { commands.push([x, y]) }
      lineTo(x: number, y: number) { commands.push([x, y]) }
    })
    const path = new Path({
      points: [
        new Point({ x: 4, y: 6 }),
        new Point({ x: 4, y: 6 }),
        new Point({ x: 14, y: 6 }),
      ],
      strokeConfig: { lineWidth: 6 },
    })

    void path.path

    expect(commands).toEqual([[4, 6], [4, 6], [14, 6]])
    expect(commands.flat().every(Number.isFinite)).toBe(true)
    expect(path.contains({ x: 4, y: 8 })).toBe(true)
  })

  it("defaults to a round native stroke and preserves explicit Canvas styles", () => {
    const rounded = new Path({ points: [new Point({ x: 0, y: 0 })] })
    const styled = new Path({
      points: [new Point({ x: 0, y: 0 }), new Point({ x: 10, y: 0 })],
      strokeConfig: {
        dash: [3, 2],
        lineCap: "square",
        lineJoin: "bevel",
        lineWidth: 7,
      },
    })

    expect(rounded.strokeConfig).toMatchObject({ lineCap: "round", lineJoin: "round" })
    expect(styled.strokeConfig).toMatchObject({
      dash: [3, 2],
      lineCap: "square",
      lineJoin: "bevel",
      lineWidth: 7,
    })
  })

  it("paints the native centerline with stroke and never fills it", () => {
    const commands: string[] = []
    vi.stubGlobal("Path2D", class {
      lineTo(x: number, y: number) { commands.push(`L ${x},${y}`) }
      moveTo(x: number, y: number) { commands.push(`M ${x},${y}`) }
    })
    const path = new Path({
      points: [new Point({ x: 2, y: 3 }), new Point({ x: 8, y: 9 })],
      strokeConfig: { lineWidth: 4 },
    })
    const context = { fill: vi.fn(), stroke: vi.fn() }

    path.stroke({ context: context as never, now: 0, width: 20, height: 20 })
    path.fill({ context: context as never, now: 0, width: 20, height: 20 })

    expect(commands).toEqual(["M 2,3", "L 8,9"])
    expect(context.stroke).toHaveBeenCalledOnce()
    expect(context.fill).not.toHaveBeenCalled()
  })

  it("recomputes geometry after movement and zoom", () => {
    const path = new Path({
      points: [new Point({ x: 10, y: 10 }), new Point({ x: 20, y: 10 })],
      strokeConfig: { lineWidth: 4 },
      zoomCenter: { x: 0, y: 0 },
    })

    path.move(5, 10)
    expect(path.getBound()).toEqual({ x: 13, y: 18, width: 14, height: 4 })

    path.zoom(2)
    expect(path.strokeConfig.lineWidth).toBe(8)
    expect(path.getBound()).toEqual({ x: 26, y: 36, width: 28, height: 8 })
    expect(path.contains({ x: 40, y: 40 })).toBe(true)
  })
})

import { describe, it, expect, vi } from "vitest"
import { Rectangle, Circle, Line, Path, Point, StayText } from "react-stay-canvas"

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
    const storeValue = { selected: true }
    const r = new Rectangle({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      layer: 2,
      zIndex: 7,
      zoomY: 1.5,
      zoomCenter: { x: 4, y: 5 },
      strokeConfig: {
        color: { r: 1, g: 2, b: 3, a: 1 },
        dash: [2, 4],
      },
      fillConfig: { color: { r: 4, g: 5, b: 6, a: 1 } },
      globalConfig: { gco: "destination-over" },
      transition: { type: "linear", durationMs: 20, delayMs: 10 },
      shapeStore: new Map([["selection", storeValue]]),
    })
    const c = r.copy()

    c.update({ x: 999 })
    c.strokeConfig.color.r = 255
    c.strokeConfig.dash.push(8)
    c.fillConfig.color.g = 255
    c.transition.durationMs = 100
    c.shapeStore.set("copy-only", true)

    expect(r.x).toBe(10)
    expect(c.x).toBe(999)
    expect(c).toMatchObject({ layer: 2, zIndex: 7, zoomY: 1.5 })
    expect(c.zoomCenter).toEqual({ x: 4, y: 5 })
    expect(c.globalConfig.gco).toBe("destination-over")
    expect(r.strokeConfig.color.r).toBe(1)
    expect(r.strokeConfig.dash).toEqual([2, 4])
    expect(r.fillConfig.color.g).toBe(5)
    expect(r.transition.durationMs).toBe(20)
    expect(r.shapeStore.has("copy-only")).toBe(false)
    expect(c.shapeStore.get("selection")).toBe(storeValue)
  })
})

describe("Shape snapshots", () => {
  it("copies Path points independently", () => {
    const path = new Path({
      points: [new Point({ x: 1, y: 2 }), new Point({ x: 3, y: 4 })],
      radius: 5,
      layer: 1,
    })

    const snapshot = path.copy()
    snapshot.points[0].update({ x: 99, y: 2 })

    expect(snapshot.layer).toBe(1)
    expect(snapshot.radius).toBe(5)
    expect(path.points[0].x).toBe(1)
  })

  it("isolates StayText-owned font and border values", () => {
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        constructor(
          public width: number,
          public height: number
        ) {}

        getContext() {
          return {
            measureText: () => ({
              width: 24,
              fontBoundingBoxAscent: 10,
              fontBoundingBoxDescent: 2,
            }),
          }
        }
      }
    )
    const text = new StayText({
      x: 0,
      y: 0,
      text: "copy",
      font: { size: 12, fontWeight: 600 },
      border: [{ direction: "bottom", type: "solid", color: "red", size: 2 }],
      autoTransitionDiffText: false,
    })

    const snapshot = text.copy()
    snapshot.font.size = 30
    snapshot.border![0].color = "blue"

    expect(snapshot.autoTransitionDiffText).toBe(false)
    expect(text.font.size).toBe(12)
    expect(text.border![0].color).toBe("red")
    vi.unstubAllGlobals()
  })
})

describe("StayText anchors", () => {
  const installTextMetrics = () => {
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        constructor(
          public width: number,
          public height: number
        ) {}

        getContext() {
          return {
            measureText: () => ({
              width: 24,
              fontBoundingBoxAscent: 10,
              fontBoundingBoxDescent: 2,
            }),
          }
        }
      }
    )
  }

  it("preserves the legacy upper-center anchor for the default alignment", () => {
    installTextMetrics()
    const text = new StayText({ x: 100, y: 50, text: "legacy" })
    const context = { fillText: vi.fn() }

    text.fill({ context } as any)

    expect(text.getBound()).toEqual({ x: 88, y: 50, width: 24, height: 12 })
    expect(context.fillText).toHaveBeenCalledWith("legacy", 88, 62)
    vi.unstubAllGlobals()
  })

  it("uses x and y as the native anchor for explicit center and middle alignment", () => {
    installTextMetrics()
    const text = new StayText({
      x: 100,
      y: 50,
      text: "centered",
      textAlign: "center",
      textBaseline: "middle",
    })
    const context = { fillText: vi.fn() }

    text.fill({ context } as any)

    expect(text.getBound()).toEqual({ x: 88, y: 44, width: 24, height: 12 })
    expect(text.getCenterPoint()).toEqual({ x: 100, y: 50 })
    expect(context.fillText).toHaveBeenCalledWith("centered", 100, 50)

    const rightBottom = new StayText({
      x: 100,
      y: 50,
      text: "right-bottom",
      textAlign: "right",
      textBaseline: "bottom",
    })
    expect(rightBottom.getBound()).toEqual({ x: 76, y: 38, width: 24, height: 12 })

    text.zoomCenter = { x: 100, y: 50 }
    text.zoom(2)
    expect(text.getCenterPoint()).toEqual({ x: 100, y: 50 })
    vi.unstubAllGlobals()
  })

  it("keeps offsets, movement, and animation relative to the resolved anchor", () => {
    installTextMetrics()
    const before = new StayText({
      x: 40,
      y: 30,
      text: "moving",
      textAlign: "center",
      textBaseline: "middle",
      offsetXRatio: 0.25,
      offsetYRatio: 0.5,
    })
    const after = new StayText({
      x: 80,
      y: 70,
      text: "moving",
      textAlign: "center",
      textBaseline: "middle",
      offsetXRatio: 0.25,
      offsetYRatio: 0.5,
    })

    expect(before.getBound()).toEqual({ x: 34, y: 30, width: 24, height: 12 })
    before.move(10, 20)
    expect(before.getBound()).toEqual({ x: 44, y: 50, width: 24, height: 12 })
    const middle = after.intermediateState(before, after, 0.5, "linear")
    expect(middle.getCenterPoint()).toEqual({ x: 71, y: 66 })
    vi.unstubAllGlobals()
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

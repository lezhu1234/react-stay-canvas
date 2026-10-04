import { describe, it, expect, vi } from "vitest"
import { Rectangle, Circle, Line, Path, Point, StayText } from "react-stay-canvas"
import { createTextMeasureContext } from "./helpers/textMetrics"

// Dimension 1 (Shapes): pure geometry — no canvas needed.

const expectLineGeometry = (line: Line) => {
  expect(line.startPoint).toEqual({ x: line.x1, y: line.y1 })
  expect(line.endPoint).toEqual({ x: line.x2, y: line.y2 })
  expect(line.vector).toEqual({ x: line.x2 - line.x1, y: line.y2 - line.y1 })
  expect(line.len()).toBeCloseTo(Math.hypot(line.x2 - line.x1, line.y2 - line.y1))
}

const expectRectangleGeometry = (rectangle: Rectangle) => {
  expect(rectangle.leftTop).toEqual({ x: rectangle.x, y: rectangle.y })
  expect(rectangle.rightTop).toEqual({ x: rectangle.x + rectangle.width, y: rectangle.y })
  expect(rectangle.rightBottom).toEqual({
    x: rectangle.x + rectangle.width,
    y: rectangle.y + rectangle.height,
  })
  expect(rectangle.leftBottom).toEqual({ x: rectangle.x, y: rectangle.y + rectangle.height })
  expect(rectangle.center).toEqual({
    x: rectangle.x + rectangle.width / 2,
    y: rectangle.y + rectangle.height / 2,
  })
  expect(rectangle.area).toBe(rectangle.width * rectangle.height)
  const { x, y, width, height } = rectangle
  expect([
    rectangle.leftBorder, rectangle.rightBorder, rectangle.topBorder, rectangle.bottomBorder,
  ].map(({ x1, y1, x2, y2 }) => [x1, y1, x2, y2])).toEqual([
    [x, y, x, y + height],
    [x + width, y, x + width, y + height],
    [x, y, x + width, y],
    [x, y + height, x + width, y + height],
  ])
  expectLineGeometry(rectangle.leftBorder)
  expectLineGeometry(rectangle.rightBorder)
  expectLineGeometry(rectangle.topBorder)
  expectLineGeometry(rectangle.bottomBorder)
}

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

  it("keeps derived geometry in sync through updates and zoom", () => {
    const r = rect()
    expectRectangleGeometry(r)

    r.move(5, -10)
    r.update({ width: 80, height: 30 })
    expectRectangleGeometry(r)

    r.zoom(2)
    expectRectangleGeometry(r)
  })

  it("provides current border geometry on first access after updates", () => {
    const r = rect()
    r.move(5, -10)
    r.update({ width: 80, height: 30 })
    r.zoom(2)

    expect(Object.keys(r)).toEqual(expect.arrayContaining([
      "leftBorder", "rightBorder", "topBorder", "bottomBorder",
    ]))
    expectRectangleGeometry(r)
    expect(r.leftBorder).toBeInstanceOf(Line)
    expect(r.topBorder.nearPoint(new Point({ x: 40, y: 20 }), 1)).toBe(true)
  })

  it("retains accessed and replaced border identities through later geometry updates", () => {
    const r = rect()
    const left = r.leftBorder
    left.update({ strokeConfig: { lineWidth: 7 } })
    left.shapeStore.set("edge", "left")
    const top = new Line({ x1: 0, y1: 0, x2: 1, y2: 1 })
    r.topBorder = top

    r.update({ x: 5, y: 6, width: 7, height: 8 })
    expect(r.leftBorder).toBe(left)
    expect(r.topBorder).toBe(top)
    expect(left.strokeConfig.lineWidth).toBe(7)
    expect(left.shapeStore.get("edge")).toBe("left")
    expectRectangleGeometry(r)
    const copied = r.copy()
    expect(copied.leftBorder).not.toBe(left)
    expect(copied.topBorder).not.toBe(top)
    expectRectangleGeometry(copied)
  })

  it("initializes geometry independently for copies and intermediate states", () => {
    const before = new Rectangle({ x: 0, y: 10, width: 20, height: 30 })
    const after = new Rectangle({ x: 20, y: 30, width: 40, height: 10 })
    const copy = after.copy()
    const middle = after.intermediateState(before, after, 0.5, "linear")

    expect(middle.getBound()).toEqual({ x: 10, y: 20, width: 30, height: 20 })
    expectRectangleGeometry(copy)
    expectRectangleGeometry(middle)
    copy.move(100, 100)
    expect(after.leftTop).toEqual({ x: 20, y: 30 })
    expectRectangleGeometry(after)
  })

  it("computeFitInfo scales content to fit inside the rect", () => {
    // fit a 50x50 into 100x50 -> limited by height -> ratio 1
    const { rectangle, scaleRatio, offsetX, offsetY } = rect().computeFitInfo(50, 50)
    expect(scaleRatio).toBeCloseTo(1)
    expect(rectangle.getBound()).toEqual({ x: 35, y: 20, width: 50, height: 50 })
    expect({ offsetX, offsetY }).toEqual({ offsetX: 25, offsetY: 0 })
  })

  it("copy() is independent of the original", () => {
    const storeValue = { selected: true }
    const stroke = vi.fn()
    const selectedFill = vi.fn()
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
      stateDrawFuncMap: {
        default: { stroke },
        selected: { fill: selectedFill },
      },
    })
    const c = r.copy()

    c.update({ x: 999 })
    c.strokeConfig.color.r = 255
    c.strokeConfig.dash.push(8)
    c.fillConfig.color.g = 255
    c.transition.durationMs = 100
    c.shapeStore.set("copy-only", true)
    expect(c.stateDrawFuncMap.default).toEqual({ stroke })
    expect(c.stateDrawFuncMap.selected).toEqual({ fill: selectedFill })
    c.stateDrawFuncMap.default.stroke = vi.fn()
    c.stateDrawFuncMap.selected.fill = vi.fn()

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
    expect(r.stateDrawFuncMap.default).toEqual({ stroke })
    expect(r.stateDrawFuncMap.selected).toEqual({ fill: selectedFill })
  })
})

describe("Shape config updates", () => {
  it("keeps deferred local defaults enumerable, independently mutable, and replaceable", () => {
    const first = new Line({ x1: 0, y1: 0, x2: 1, y2: 1 })
    const second = new Line({ x1: 0, y1: 0, x2: 1, y2: 1 })
    expect(Object.keys(first)).toEqual(expect.arrayContaining([
      "shapeStore", "zoomCenter", "zeroPoint", "zeroPointCopy",
    ]))
    first.shapeStore.set("selected", true)
    first.zoomCenter.x = 10
    first.zeroPoint.x = 20
    first.zeroPointCopy.y = 30
    expect(second.shapeStore.size).toBe(0)
    expect(second.zoomCenter).toEqual({ x: 0, y: 0 })
    expect(second.zeroPoint).toEqual({ x: 0, y: 0 })
    expect(second.zeroPointCopy).toEqual({ x: 0, y: 0 })

    const replacementStore = new Map([["custom", 1]])
    const replacementPoint = { x: 40, y: 50 }
    const untouched = new Line({ x1: 0, y1: 0, x2: 1, y2: 1 })
    untouched.shapeStore = replacementStore
    untouched.zeroPoint = replacementPoint
    expect(untouched.shapeStore).toBe(replacementStore)
    expect(untouched.zeroPoint).toBe(replacementPoint)
    const supplied = new Line({ x1: 0, y1: 0, x2: 1, y2: 1,
      shapeStore: replacementStore, zoomCenter: replacementPoint })
    expect(supplied.shapeStore).toBe(replacementStore)
    expect(supplied.zoomCenter).toBe(replacementPoint)
    const copied = supplied.copy()
    copied.shapeStore.clear()
    copied.zoomCenter.x = 100
    expect(supplied.shapeStore.get("custom")).toBe(1)
    expect(supplied.zoomCenter.x).toBe(40)
  })

  it("owns independent defaults and replaces configs without changing the supplied values", () => {
    const config = { color: { r: 1, g: 2, b: 3, a: 1 }, lineWidth: 0, dashOffset: 0 }
    const first = new Line({ x1: 0, y1: 0, x2: 1, y2: 1, strokeConfig: config })
    const second = new Line({ x1: 0, y1: 0, x2: 1, y2: 1 })
    const previous = first.strokeConfig

    expect(first.strokeConfig).not.toBe(config)
    expect(first.strokeConfig.color).toBe(config.color)
    expect(first.strokeConfig.lineWidth).toBe(0)
    first.strokeConfig.dash.push(2)
    expect(second.strokeConfig.dash).toEqual([])
    expect(first.fillConfig).not.toBe(second.fillConfig)
    expect(first.globalConfig).not.toBe(second.globalConfig)

    first.update({ strokeConfig: { lineWidth: 3, color: undefined } })
    expect(first.strokeConfig).not.toBe(previous)
    expect(previous.lineWidth).toBe(0)
    expect(first.strokeConfig.color).toBe(config.color)
    expect(config).toEqual({ color: { r: 1, g: 2, b: 3, a: 1 }, lineWidth: 0, dashOffset: 0 })
  })

  it("keeps required Canvas defaults when optional config fields are undefined", () => {
    const line = new Line({
      x1: 0,
      y1: 0,
      x2: 10,
      y2: 10,
      strokeConfig: { dash: undefined, lineWidth: undefined },
    })

    expect(line.strokeConfig.dash).toEqual([])
    expect(line.strokeConfig.lineWidth).toBe(1)

    line.update({
      strokeConfig: { dash: [4, 6], lineWidth: 2 },
    })
    line.update({
      strokeConfig: { dash: undefined, lineWidth: undefined },
    })

    expect(line.strokeConfig.dash).toEqual([4, 6])
    expect(line.strokeConfig.lineWidth).toBe(2)
  })
})

describe("Shape snapshots", () => {
  it("copies Path points independently", () => {
    const path = new Path({
      points: [new Point({ x: 1, y: 2 }), new Point({ x: 3, y: 4 })],
      layer: 1,
      strokeConfig: { lineWidth: 10 },
    })

    const snapshot = path.copy()
    snapshot.points[0].update({ x: 99, y: 2 })

    expect(snapshot.layer).toBe(1)
    expect(snapshot.strokeConfig.lineWidth).toBe(10)
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

        getContext() { return createTextMeasureContext(24) }
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

        getContext() { return createTextMeasureContext(24) }
      }
    )
  }

  it("uses x and y as the native anchor for the default alignment", () => {
    installTextMetrics()
    const text = new StayText({ x: 100, y: 50, text: "default" })
    const context = { fillText: vi.fn() }

    text.fill({ context } as any)

    expect(text.getBound()).toEqual({ x: 100, y: 40, width: 24, height: 12 })
    expect(context.fillText).toHaveBeenCalledWith("default", 100, 50)
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

  it.each([
    ["top", 50],
    ["hanging", 48],
    ["middle", 44],
    ["alphabetic", 40],
    ["ideographic", 39],
    ["bottom", 38],
  ] as const)("derives the %s bound from metrics measured at that baseline", (textBaseline, top) => {
    installTextMetrics()
    const text = new StayText({ x: 100, y: 50, text: "baseline", textBaseline })

    expect(text.getBound()).toEqual({ x: 100, y: top, width: 24, height: 12 })
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

  it("keeps endpoints, vector, and length synchronized after updates and zoom", () => {
    const l = new Line({ x1: 2, y1: 3, x2: 12, y2: 8, zoomCenter: { x: 0, y: 0 } })
    expectLineGeometry(l)

    l.update({ x1: -4, y2: 20 })
    expectLineGeometry(l)
    l.zoom(2)
    expectLineGeometry(l)
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

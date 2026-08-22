// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { Rectangle } from "react-stay-canvas"
import { createStage } from "./helpers/stage"

const rect = (x: number, y: number, w = 10, h = 10) =>
  new Rectangle({ x, y, width: w, height: h })

// Dimension 8 (Interactions): pan (move), zoom, and undo/redo/log snapshots.

// move/zoom apply synchronously; the returned promise only resolves once the
// render loop next draws (stubbed off here), so assert synchronously and drain
// the pending nextTick via a manual draw.
describe("move (pan)", () => {
  it("shifts children by the offset after moveStart", () => {
    const { stage } = createStage()
    const shape = rect(10, 10)
    stage.tools.appendChild({ className: "r", shape })

    stage.tools.moveStart()
    void stage.tools.move(5, 7)
    stage.draw({})

    expect(shape.x).toBe(15)
    expect(shape.y).toBe(17)
  })
})

describe("zoom", () => {
  it("zooms in on negative deltaY and out on positive", () => {
    const { stage } = createStage()
    const a = rect(100, 100, 100, 100)
    stage.tools.appendChild({ className: "r", shape: a })
    void stage.tools.zoom(-100, { x: 100, y: 100 }) // zoom in
    stage.draw({})
    expect(a.width).toBeGreaterThan(100)

    const b = rect(100, 100, 100, 100)
    stage.tools.appendChild({ className: "r2", shape: b })
    void stage.tools.zoom(100, { x: 100, y: 100 }) // zoom out
    stage.draw({})
    expect(b.width).toBeLessThan(100)
  })
})

describe("undo / redo / log", () => {
  it("steps back and forward through logged snapshots", () => {
    const { stage } = createStage()
    const { appendChild, log, undo, redo, getChildrenWithoutRoot } = stage.tools
    const count = () => getChildrenWithoutRoot().length

    appendChild({ className: "a", shape: rect(0, 0) })
    log()
    appendChild({ className: "b", shape: rect(20, 20) })
    log()
    expect(count()).toBe(2)

    undo()
    expect(count()).toBe(1)
    undo()
    expect(count()).toBe(0)

    redo()
    expect(count()).toBe(1)
    redo()
    expect(count()).toBe(2)
  })
})

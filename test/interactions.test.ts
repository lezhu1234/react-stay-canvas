// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { Rectangle, StayImage } from "react-stay-canvas"
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

  it("tracks Shape updates without replacing the owning Child", () => {
    const { stage } = createStage()
    const child = stage.tools.appendChild({ className: "box", shape: rect(10, 20, 30, 40) })
    stage.tools.log()

    child.shape.update({ x: 70, width: 90 })
    stage.tools.log()
    stage.tools.undo()
    expect(stage.tools.getChildById<Rectangle>(child.id)?.shape.getBound()).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    })

    stage.tools.redo()
    expect(stage.tools.getChildById<Rectangle>(child.id)?.shape.getBound()).toEqual({
      x: 70,
      y: 20,
      width: 90,
      height: 40,
    })
  })

  it("can set the current scene as a non-undoable history baseline", () => {
    const { stage } = createStage()
    const background = stage.tools.appendChild({ className: "background", shape: rect(0, 0) })
    stage.tools.resetHistory()

    const annotation = stage.tools.appendChild({ className: "annotation", shape: rect(20, 20) })
    stage.tools.log()
    stage.tools.undo()

    expect(stage.tools.getChildById(background.id)).toBeTruthy()
    expect(stage.tools.getChildById(annotation.id)).toBeUndefined()
    stage.tools.undo()
    expect(stage.tools.getChildById(background.id)).toBeTruthy()
  })

  it("restores root and Child geometry after a logged scene transform", () => {
    const { stage } = createStage()
    const child = stage.tools.appendChild({ className: "box", shape: rect(10, 20) })
    const root = stage.tools.getChildBySelector<Rectangle>(".stay-canvas")!
    stage.tools.resetHistory()

    stage.tools.moveStart()
    void stage.tools.move(30, 40)
    stage.tools.log()
    expect(root.shape.getBound()).toMatchObject({ x: 30, y: 40 })
    expect(child.shape.getBound()).toMatchObject({ x: 40, y: 60 })

    stage.tools.undo()
    expect(root.shape.getBound()).toMatchObject({ x: 0, y: 0 })
    expect(child.shape.getBound()).toMatchObject({ x: 10, y: 20 })
  })

  it("does not add an equivalent snapshot or discard the redo tail", () => {
    const { stage } = createStage()
    const first = stage.tools.appendChild({ className: "box", shape: rect(0, 0) })
    stage.tools.log()
    const second = stage.tools.appendChild({ className: "box", shape: rect(20, 20) })
    stage.tools.log()
    stage.tools.undo()

    first.moveInit()
    first.move(0, 0)
    stage.tools.log()
    stage.tools.redo()

    expect(stage.tools.getChildById(second.id)).toBeTruthy()
  })

  it("commits application state and Canvas changes as one history item", () => {
    let applicationState = { title: "Draft", revision: 1 }
    const restore = vi.fn((snapshot: typeof applicationState) => {
      applicationState = structuredClone(snapshot)
    })
    const { stage } = createStage({
      historyAdapter: {
        capture: () => structuredClone(applicationState),
        restore,
      },
    })
    stage.tools.resetHistory()

    const child = stage.tools.appendChild({ className: "box", shape: rect(0, 0) })
    applicationState = { title: "Reviewed", revision: 2 }
    stage.tools.log()

    stage.tools.undo()
    expect(stage.tools.getChildById(child.id)).toBeUndefined()
    expect(applicationState).toEqual({ title: "Draft", revision: 1 })

    stage.tools.redo()
    expect(stage.tools.getChildById(child.id)).toBeTruthy()
    expect(applicationState).toEqual({ title: "Reviewed", revision: 2 })
    expect(restore).toHaveBeenCalledTimes(2)
  })

  it("records an explicit application-only transaction", () => {
    let applicationState = 0
    const { stage } = createStage({
      historyAdapter: {
        capture: () => applicationState,
        restore: (snapshot) => {
          applicationState = snapshot
        },
      },
    })
    stage.tools.resetHistory()

    applicationState = 1
    stage.tools.log()
    applicationState = 2
    stage.tools.log()
    expect(stage.stack).toHaveLength(2)

    stage.tools.undo()
    expect(applicationState).toBe(1)

    applicationState = 3
    stage.tools.log()
    expect(stage.stack).toHaveLength(2)
    stage.tools.redo()
    expect(applicationState).toBe(3)
  })

  it("leaves the Canvas and history cursor untouched when external restore fails", () => {
    let applicationState = 0
    let rejectRestore = false
    const { stage } = createStage({
      historyAdapter: {
        capture: () => applicationState,
        restore: (snapshot) => {
          if (rejectRestore) throw new Error("restore failed")
          applicationState = snapshot
        },
      },
    })
    stage.tools.resetHistory()
    const child = stage.tools.appendChild({ className: "box", shape: rect(0, 0) })
    applicationState = 1
    stage.tools.log()
    rejectRestore = true

    expect(() => stage.tools.undo()).toThrow("restore failed")
    expect(stage.tools.getChildById(child.id)).toBeTruthy()
    expect(stage.stackIndex).toBe(1)
    expect(applicationState).toBe(1)
  })

  it("preserves native object identity when diffing Shape snapshots", () => {
    const { stage } = createStage()
    const firstImage = document.createElement("img")
    const secondImage = document.createElement("img")
    const child = stage.tools.appendChild({
      className: "image",
      shape: new StayImage({
        image: firstImage,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        opacity: 1,
      }),
    })
    stage.tools.log()

    child.shape.update({ image: secondImage })
    stage.tools.log()
    stage.tools.undo()
    expect(stage.tools.getChildById<StayImage>(child.id)?.shape.image).toBe(firstImage)

    stage.tools.redo()
    expect(stage.tools.getChildById<StayImage>(child.id)?.shape.image).toBe(secondImage)
  })
})

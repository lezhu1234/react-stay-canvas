// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { Rectangle } from "react-stay-canvas"
import { createStage } from "./helpers/stage"

// Item 3 unit C: the tool factory is merged, so history (log/undo/redo) and
// animation (createChild/progress) now coexist in one mode. The hazard: diff()
// would copyShapeMap() a timeline child's frozen interpolated frame and undo/redo
// would restore it as a plain instant child — destroying the timeline. Fix:
// createChild no longer tracks animated children for history, and log() filters
// them out defensively. These tests pin that fix + the removed instant-mode guard.
const stroke = { color: { r: 1, g: 2, b: 3, a: 1 }, lineWidth: 2 }

describe("history × animation (item 3 unit C)", () => {
  it("log/undo do NOT freeze or remove an animated child's timeline (GAP-2)", () => {
    const t = createStage({ mode: "animated" }).stage.tools as any
    const child = t.createChild({ className: "a" })
    child.appendKeyFrame(
      "default",
      new Rectangle({ x: 10, y: 10, width: 20, height: 20, strokeConfig: stroke, transition: { durationMs: 300, delayMs: 0 } })
    )
    const framesBefore = child.getSlice("default").length
    t.log() // snapshot — the animated child must be EXCLUDED from the step
    t.progress({ timeMs: 150 }) // seek to an interpolated frame
    t.undo() // must not touch the animated child

    expect(child.shapeFramesMap.size).toBeGreaterThan(0) // timeline survived
    expect(child.getSlice("default").length).toBe(framesBefore) // frames intact
    expect(t.getChildById(child.id)).toBeTruthy() // not removed by undo
    expect(() => t.progress({ timeMs: 300 })).not.toThrow() // still seekable
  })

  it("removeChild of an animated child stays out of history — undo does NOT resurrect it (removal path)", () => {
    // Without the removeChild guard: removeChild re-adds the id, and after
    // removal neither getChildById nor the (degraded) snapshot clone can tell it
    // was animated, so log() would emit a "remove" step and undo would re-append
    // it as a plain instant child. The guard excludes it while it's still live.
    const t = createStage({ mode: "animated" }).stage.tools as any
    const child = t.createChild({ className: "a" })
    child.appendKeyFrame(
      "default",
      new Rectangle({ x: 10, y: 10, width: 20, height: 20, strokeConfig: stroke, transition: { durationMs: 300, delayMs: 0 } })
    )
    t.log()
    t.removeChild(child.id)
    t.log()
    const nonRootAfterRemove = t.getChildrenWithoutRoot().length
    t.undo()
    expect(t.getChildById(child.id)).toBeFalsy() // stays removed — not resurrected as an instant child
    expect(t.getChildrenWithoutRoot().length).toBe(nonRootAfterRemove) // no phantom child
  })

  it("regular (instant) children ARE still tracked by history (undo removes an appended child)", () => {
    // animated mode now also has appendChild/log/undo — the merge is symmetric
    const t = createStage({ mode: "animated" }).stage.tools as any
    const c = t.appendChild({
      className: "b",
      shape: new Rectangle({ x: 0, y: 0, width: 5, height: 5, strokeConfig: stroke }),
    })
    t.log()
    expect(t.getChildById(c.id)).toBeTruthy()
    t.undo()
    expect(t.getChildById(c.id)).toBeFalsy() // instant child IS undoable — fix didn't over-reach
  })

  it("log() after removeChild does not throw (removed id still in the log set) (regression)", () => {
    // removeChild adds the id back to unLogedChildrenIds while getChildById()
    // becomes undefined; log()'s isStayAnimatedChild filter must be null-safe.
    const t = createStage({ mode: "instant" }).stage.tools as any
    const c = t.appendChild({
      className: "b",
      shape: new Rectangle({ x: 0, y: 0, width: 5, height: 5, strokeConfig: stroke }),
    })
    t.log()
    t.removeChild(c.id)
    expect(() => t.log()).not.toThrow()
  })

  it("progress() no longer throws in instant mode (the mode guard was removed)", () => {
    const t = createStage({ mode: "instant" }).stage.tools as any
    expect(() => t.progress({ timeMs: 0 })).not.toThrow()
  })
})

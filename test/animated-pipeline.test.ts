// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { Rectangle } from "react-stay-canvas"
import { createStage } from "./helpers/stage"

// Characterization tests for the ANIMATED-mode pipeline, written BEFORE the
// dual-mode merge (item 3). Today the only animation test covers the pure
// interpolation math (intermediateState); everything below — createChild,
// appendKeyFrame, getTimelineIndexBound, setCurrentTime, progress(), and the
// instant-vs-animated tool/lifecycle partition — is otherwise untested, and the
// merge reworks exactly this code. These lock the CURRENT behavior so each merge
// PR (B unify render loop, C merge tool factory, D deprecate the Mode generic)
// has a net under it. Assertions marked "MERGE WILL CHANGE" document the
// intended, visible diffs the merge should produce.

const rgba = (r: number, g: number, b: number, a = 1) => ({ r, g, b, a })
const stroke = { color: rgba(1, 2, 3), lineWidth: 2 }

// One visible keyframe (default transition 300ms). appendKeyFrame prepends a
// transparent zero-frame at t=0, so the slice is [zero(dur0), rect(dur300)].
function animatedRect(stage: any, geo = { x: 10, y: 20, width: 40, height: 30 }) {
  const child = stage.tools.createChild({ className: "a" })
  child.appendKeyFrame(
    "default",
    new Rectangle({ ...geo, strokeConfig: stroke, transition: { durationMs: 300, delayMs: 0 } })
  )
  return child
}

describe("animated: getTimelineIndexBound (the timeline cursor)", () => {
  it("t=0 sits on the zero-frame (before=after=0, ratio 0)", () => {
    const { stage } = createStage({ mode: "animated" })
    const child = animatedRect(stage)
    const b = child.getTimelineIndexBound(child.getSlice("default"), 0)
    expect(b).toMatchObject({ beforeIndex: 0, afterIndex: 0, ratio: 0 })
  })

  it("mid-transition interpolates (before=0, after=1, ratio 0.5 at t=150 of 300)", () => {
    const { stage } = createStage({ mode: "animated" })
    const child = animatedRect(stage)
    const b = child.getTimelineIndexBound(child.getSlice("default"), 150)
    expect(b.beforeIndex).toBe(0)
    expect(b.afterIndex).toBe(1)
    expect(b.ratio).toBeCloseTo(0.5)
  })

  it("exact end lands on the frame (before=after=1, ratio 0 at t=300)", () => {
    const { stage } = createStage({ mode: "animated" })
    const child = animatedRect(stage)
    const b = child.getTimelineIndexBound(child.getSlice("default"), 300)
    expect(b).toMatchObject({ beforeIndex: 1, afterIndex: 1, ratio: 0 })
  })

  it("past the end clamps to the last frame (ratio 0 at t=450)", () => {
    const { stage } = createStage({ mode: "animated" })
    const child = animatedRect(stage)
    const b = child.getTimelineIndexBound(child.getSlice("default"), 450)
    expect(b).toMatchObject({ beforeIndex: 1, afterIndex: 1, ratio: 0 })
  })

  it("negative time throws", () => {
    const { stage } = createStage({ mode: "animated" })
    const child = animatedRect(stage)
    expect(() => child.getTimelineIndexBound(child.getSlice("default"), -1)).toThrow(/negative/)
  })

  it("a delayed keyframe freezes on the prior frame during its delay window", () => {
    const { stage } = createStage({ mode: "animated" })
    const child = animatedRect(stage) // slice: [zero, rect@dur300]
    // second frame: 200ms after a 100ms delay -> timeline 300..400 delay, 400..600 move
    child.appendKeyFrame(
      "default",
      new Rectangle({ x: 10, y: 20, width: 40, height: 30, strokeConfig: stroke, transition: { durationMs: 200, delayMs: 100 } })
    )
    // t=350 is inside the delay window (300..400): held on frame index 1, ratio 0
    const b = child.getTimelineIndexBound(child.getSlice("default"), 350)
    expect(b).toMatchObject({ beforeIndex: 1, afterIndex: 1, ratio: 0 })
    // totalDurationMs = 300 + (100 delay + 200 dur) = 600
    expect(child.totalDurationMs).toBe(600)
  })
})

describe("animated: setCurrentTime / progress() drive the shapeMap + paint", () => {
  it("an animated child paints NOTHING until progress() populates its shapeMap", () => {
    const { stage, layers } = createStage({ mode: "animated" })
    const strokeRect = vi.spyOn(layers[0].getContext("2d")!, "strokeRect")
    const child = animatedRect(stage)
    expect(child.getShapes(0).length).toBe(0) // empty before any time is set
    stage.draw({}) // a bare draw (the pull model): still nothing to paint
    expect(strokeRect).not.toHaveBeenCalled()
  })

  it("progress() at t=0 paints nothing (the zero-frame is transparent)", () => {
    const { stage, layers } = createStage({ mode: "animated" })
    const strokeRect = vi.spyOn(layers[0].getContext("2d")!, "strokeRect")
    animatedRect(stage)
    stage.tools.progress({ timeMs: 0 })
    expect(strokeRect).not.toHaveBeenCalled()
  })

  // Geometry is constant across this timeline (the zero-frame shares it), so what
  // interpolates is stroke alpha (0→1), which strokeRect args don't carry — the
  // interpolation math itself is covered by the dimension-7 intermediateState
  // test. This test pins that a mid-fade frame IS painted at its geometry (vs t=0
  // where the transparent zero-frame paints nothing).
  it("progress() mid-transition paints the frame at its geometry once it fades in", () => {
    const { stage, layers } = createStage({ mode: "animated" })
    const strokeRect = vi.spyOn(layers[0].getContext("2d")!, "strokeRect")
    animatedRect(stage)
    stage.tools.progress({ timeMs: 150 })
    // geometry is constant (zero-frame shares it); only stroke alpha fades in
    expect(strokeRect).toHaveBeenCalledWith(10, 20, 40, 30)
  })

  it("progress() at the end paints the final opaque frame", () => {
    const { stage, layers } = createStage({ mode: "animated" })
    const strokeRect = vi.spyOn(layers[0].getContext("2d")!, "strokeRect")
    const child = animatedRect(stage)
    stage.tools.progress({ timeMs: 300 })
    expect(strokeRect).toHaveBeenCalledWith(10, 20, 40, 30)
    // the end frame is the real (opaque) shape, so it lives in the child's shapeMap
    expect(child.getShapes(0).length).toBe(1)
  })
})

describe("animated: intermediate-shape cache (getTimelineShapeByBound)", () => {
  it("ratio 0 / 1 return the boundary frames verbatim", () => {
    const { stage } = createStage({ mode: "animated" })
    const child = animatedRect(stage)
    const slice = child.getSlice("default")
    expect(child.getTimelineShapeByBound(slice, { beforeIndex: 0, afterIndex: 1, ratio: 0 })).toBe(slice[0])
    expect(child.getTimelineShapeByBound(slice, { beforeIndex: 0, afterIndex: 1, ratio: 1 })).toBe(slice[1])
  })

  it("an interpolated (before,after,ratio) is cached — same object on the second call", () => {
    const { stage } = createStage({ mode: "animated" })
    const child = animatedRect(stage)
    const slice = child.getSlice("default")
    const bound = { beforeIndex: 0, afterIndex: 1, ratio: 0.5 }
    const first = child.getTimelineShapeByBound(slice, bound)
    const second = child.getTimelineShapeByBound(slice, bound)
    // identity holds only because intermediateState builds a fresh instance each
    // call (so a non-cached second call would NOT be ===) and the single entry
    // never trips the size-10 eviction — both load-bearing for this assertion.
    expect(second).toBe(first) // cache hit returns the identical instance
  })
})

describe("animated: progress({ bound }) sub-range seek (the seek path the merge keeps)", () => {
  // GAP-3 from strategic review: the bound branch (setCurrentTime L221-234) was
  // otherwise unexecuted. Lock that it runs + paints + normalizes a reversed
  // bound; the exact sub-range interpolation value is intentionally NOT pinned
  // here (brittle) — whichever later unit touches progress()'s signature owns
  // deeper bound coverage.
  it("the bound branch runs, paints, and swaps a reversed bound instead of throwing", () => {
    const { stage, layers } = createStage({ mode: "animated" })
    const strokeRect = vi.spyOn(layers[0].getContext("2d")!, "strokeRect")
    // a rect that moves x 0 -> 300 across the second segment (linear)
    const child = stage.tools.createChild({ className: "a" })
    child.appendKeyFrame(
      "default",
      new Rectangle({ x: 0, y: 0, width: 10, height: 10, strokeConfig: stroke, transition: { durationMs: 300, delayMs: 0, type: "linear" } })
    )
    child.appendKeyFrame(
      "default",
      new Rectangle({ x: 300, y: 0, width: 10, height: 10, strokeConfig: stroke, transition: { durationMs: 300, delayMs: 0, type: "linear" } })
    )
    stage.tools.progress({ timeMs: 300, bound: { beforeMs: 150, afterMs: 450 } })
    // the bound REMAPS the interpolation window: composing interp(zero→rectA)@150
    // (x=0) with interp(rectA→rectB)@450 (x=150) at ratio 0.5 lands x≈75. The
    // no-bound fallback at t=300 would instead paint rectA at x=0 — so asserting
    // x≈75 pins that the sub-range branch (setCurrentTime L221-234) shaped the
    // output, which a bare toHaveBeenCalled() could not.
    const paintedXs = strokeRect.mock.calls.map((c) => c[0] as number)
    expect(paintedXs.some((x) => Math.abs(x - 75) < 0.5)).toBe(true)
    // a reversed bound is swapped in place (setCurrentTime L160-164), not thrown
    expect(() =>
      stage.tools.progress({ timeMs: 300, bound: { beforeMs: 450, afterMs: 150 } })
    ).not.toThrow()
  })
})

// The instant/animated tool partition is now DISSOLVED (unit C merged the tool
// factory). These were the "MERGE WILL CHANGE" tests: previously each mode
// exposed only its half; now `tools` exposes EVERY tool in BOTH modes. This is
// the intended flip — kept (not deleted) so the unified surface is pinned.
describe("unified tool surface (item 3 unit C — every tool in every mode)", () => {
  const allTools = ["undo", "redo", "log", "progress", "createChild", "appendChild"]
  it("instant mode exposes the full tool surface (incl. progress/createChild)", () => {
    const t = createStage({ mode: "instant" }).stage.tools as any
    allTools.forEach((name) => expect(typeof t[name]).toBe("function"))
  })

  it("animated mode exposes the full tool surface (incl. undo/redo/log)", () => {
    const t = createStage({ mode: "animated" }).stage.tools as any
    allTools.forEach((name) => expect(typeof t[name]).toBe("function"))
  })
})

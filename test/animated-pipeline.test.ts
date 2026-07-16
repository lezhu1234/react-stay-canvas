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

  it("progress() mid-transition paints the interpolated frame at its geometry", () => {
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
    expect(second).toBe(first) // cache hit returns the identical instance
  })
})

// The instant/animated PARTITION as it stands today. The merge (item 3) is meant
// to DISSOLVE this: after PR C/D `tools` should expose every tool in both modes,
// `mode` becomes a deprecated no-op, and `progress` no longer throws in instant.
// When that lands these expectations flip — that flip is the intended diff, so
// update them there rather than deleting the tests.
describe("animated: instant/animated tool partition (MERGE WILL CHANGE)", () => {
  it("instant mode exposes history tools (undo/redo/log) and NOT progress/createChild", () => {
    const { stage } = createStage({ mode: "instant" })
    const t = stage.tools as any
    expect(typeof t.undo).toBe("function")
    expect(typeof t.redo).toBe("function")
    expect(typeof t.log).toBe("function")
    expect(t.progress).toBeUndefined()
    expect(t.createChild).toBeUndefined()
  })

  it("animated mode exposes progress/createChild and NOT the history tools", () => {
    const { stage } = createStage({ mode: "animated" })
    const t = stage.tools as any
    expect(typeof t.progress).toBe("function")
    expect(typeof t.createChild).toBe("function")
    expect(t.undo).toBeUndefined()
    expect(t.log).toBeUndefined()
  })
})

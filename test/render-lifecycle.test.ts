// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { createStage } from "./helpers/stage"

// Unit B (dual-mode merge): the render lifecycle is UNIFIED — the RAF loop starts
// in every mode, not just instant. stay.ts removed the
// `if (mode === "instant") this.startRender()` gate. renderer.start() draws once
// then schedules `window.requestAnimationFrame(...)`, so a stage whose loop
// engaged calls RAF at least once during construction. We count those calls.
describe("unified render lifecycle (unit B)", () => {
  const rafCountFor = (mode: "instant" | "animated") => {
    let n = 0
    createStage({ mode, raf: () => (n++, 0) })
    return n
  }

  // start() schedules exactly one RAF per construction (the stub returns without
  // recursing), so `toBe(1)` both proves the loop engaged AND guards against a
  // future accidental double-startRender.
  it("starts the render loop exactly once in instant mode (unchanged)", () => {
    expect(rafCountFor("instant")).toBe(1)
  })

  it("ALSO starts the render loop in animated mode (previously gated off)", () => {
    // Before unit B this was 0: the `mode === "instant"` gate skipped startRender
    // for animated, so animated had no loop at all (consumer had to pump progress).
    expect(rafCountFor("animated")).toBe(1)
  })
})

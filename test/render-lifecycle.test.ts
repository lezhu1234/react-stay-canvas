// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { createStage } from "./helpers/stage"

// The RAF render loop engages on construction for every stage: renderer.start()
// draws once then schedules `window.requestAnimationFrame`, so a stage whose loop
// engaged calls RAF exactly once during construction (the stub returns without
// recursing). `toBe(1)` also guards against an accidental double-startRender.
describe("render lifecycle", () => {
  it("engages the render loop exactly once on construction", () => {
    let n = 0
    createStage({ raf: () => (n++, 0) })
    expect(n).toBe(1)
  })
})

// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { createStage } from "./helpers/stage"

// Stay.destroy() tears down the RAF render loop + the DOM event handlers so a
// discarded Stay (StayCanvas reCreate / resize / unmount) can't keep painting or
// stack duplicate handlers on the reused canvas.
describe("Stay.destroy() — teardown", () => {
  it("stops the render loop: startRender() is a no-op after destroy", () => {
    let n = 0
    const { stage } = createStage({ raf: () => (n++, 0) })
    expect(n).toBe(1) // loop engaged at construction
    stage.destroy()
    stage.startRender() // must NOT re-engage
    expect(n).toBe(1)
  })

  it("cancels the pending animation frame", () => {
    const { stage } = createStage({ raf: () => 42 }) // start() captured rafId=42
    const cancel = vi.fn()
    ;(window as any).cancelAnimationFrame = cancel
    stage.destroy()
    expect(cancel).toHaveBeenCalledWith(42)
  })

  it("nulls the on* DOM handlers on the top canvas", () => {
    const { stage, top } = createStage()
    expect(top.onmousedown).not.toBeNull()
    expect(top.onkeydown).not.toBeNull()
    stage.destroy()
    expect(top.onmousedown).toBeNull()
    expect(top.onkeydown).toBeNull()
    expect(top.onmouseleave).toBeNull()
  })

  it("removeEventListener's the addEventListener-bound handlers (wheel/dragstart)", () => {
    const { stage, top } = createStage()
    const rm = vi.spyOn(top, "removeEventListener")
    stage.destroy()
    expect(rm).toHaveBeenCalledWith("wheel", expect.any(Function))
    expect(rm).toHaveBeenCalledWith("dragstart", expect.any(Function))
  })
})

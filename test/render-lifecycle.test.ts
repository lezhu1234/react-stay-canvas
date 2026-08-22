// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { Renderer } from "../src/stay/renderer"
import { createStay } from "../src/stay/stay"
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

  it("cancels the scheduled frame and cannot restart after destroy", () => {
    let scheduledFrame: FrameRequestCallback | undefined
    let scheduledCount = 0
    const cancelled: number[] = []
    window.cancelAnimationFrame = (id) => cancelled.push(id)
    const { stage } = createStage({
      raf: (callback) => {
        scheduledFrame = callback
        scheduledCount++
        return 7
      },
    })

    stage.destroy()
    scheduledFrame?.(Date.now())

    expect(cancelled).toEqual([7])
    expect(scheduledCount).toBe(1)
  })

  it("does not schedule another frame when stopped during draw", () => {
    let scheduledCount = 0
    window.requestAnimationFrame = () => ++scheduledCount
    let renderer: Renderer
    renderer = new Renderer({ layers: [] } as any, () => {
      renderer.stop()
      return []
    })

    renderer.start()

    expect(scheduledCount).toBe(0)
  })

  it("unbinds DOM input when initial frame scheduling fails", () => {
    const layers = [document.createElement("canvas"), document.createElement("canvas")]
    const topLayer = layers[1]
    const addListener = vi.spyOn(topLayer, "addEventListener")
    const removeListener = vi.spyOn(topLayer, "removeEventListener")
    window.requestAnimationFrame = () => {
      throw new Error("RAF unavailable")
    }

    expect(() =>
      createStay(
        layers,
        layers.map(() => (canvas) => canvas.getContext("2d")),
        500,
        500,
        false
      )
    ).toThrow("RAF unavailable")

    expect(removeListener.mock.calls.map(([type]) => type)).toEqual(
      addListener.mock.calls.map(([type]) => type)
    )
  })
})

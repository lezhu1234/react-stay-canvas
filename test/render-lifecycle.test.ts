// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { Renderer } from "../src/stay/renderer"
import { createStay } from "../src/stay/stay"
import { createStage } from "./helpers/stage"
import { CoordinateSystem } from "../src/stay/coordinates/coordinateSystem"

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
    renderer = new Renderer(
      {
        layers: [],
        getSurfaceMetrics: () => ({ logicalWidth: 1, logicalHeight: 1 }),
      } as any,
      () => {
        renderer.stop()
        return []
      },
      new CoordinateSystem()
    )

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

  it("samples before frame commands and leaves newly queued commands for the next frame", async () => {
    const callbacks: FrameRequestCallback[] = []
    const { stage } = createStage({ raf: (callback) => callbacks.push(callback) })
    const events: string[] = []
    let following: Promise<void> | undefined
    vi.spyOn(stage.sceneTransactions, "advance").mockImplementationOnce((now) => {
      events.push(`sample:${now}`)
      following = stage.renderer.atNextFrame((_, time) => { events.push(`following:${time}`) })
    })
    const current = stage.renderer.atNextFrame((_, now) => { events.push(`current:${now}`) })

    try {
      callbacks.shift()!(10)
      await current
      expect(events).toEqual(["sample:10", "current:10"])
      callbacks.shift()!(20)
      await following
      expect(events).toEqual(["sample:10", "current:10", "following:20"])
    } finally {
      stage.destroy()
      await following?.catch(() => {})
    }
  })

  it("rejects the current command batch when frame sampling fails", async () => {
    const callbacks: FrameRequestCallback[] = []
    const { stage } = createStage({ raf: (callback) => callbacks.push(callback) })
    const failure = new Error("Frame sampling failed")
    vi.spyOn(stage.sceneTransactions, "advance").mockImplementationOnce(() => { throw failure })
    const action = vi.fn()
    const result = stage.renderer.atNextFrame(action)
    const rejected = expect(result).rejects.toBe(failure)

    try {
      expect(() => callbacks.shift()!(10)).toThrow(failure)
      await rejected
      expect(action).not.toHaveBeenCalled()
      expect(callbacks).toHaveLength(0)
    } finally {
      stage.destroy()
    }
  })

  it("does not commit or draw when destroyed during frame sampling", async () => {
    const callbacks: FrameRequestCallback[] = []
    const { stage } = createStage({ raf: (callback) => callbacks.push(callback) })
    vi.spyOn(stage.sceneTransactions, "advance").mockImplementationOnce(() => { stage.destroy() })
    const draw = vi.spyOn(stage.renderer, "draw")
    const action = vi.fn()
    const result = stage.renderer.atNextFrame(action)
    const rejected = expect(result).rejects.toThrow("Canvas was destroyed")

    callbacks.shift()!(10)
    await rejected
    expect(action).not.toHaveBeenCalled()
    expect(draw).not.toHaveBeenCalled()
    expect(callbacks).toHaveLength(0)
  })

  it("rejects remaining commands when an earlier frame command destroys the canvas", async () => {
    const callbacks: FrameRequestCallback[] = []
    const { stage } = createStage({ raf: (callback) => callbacks.push(callback) })
    const draw = vi.spyOn(stage.renderer, "draw")
    const first = stage.renderer.atNextFrame(() => { stage.destroy() })
    const action = vi.fn()
    const second = stage.renderer.atNextFrame(action)
    const rejected = expect(second).rejects.toThrow("Canvas was destroyed")

    callbacks.shift()!(10)
    await first
    await rejected
    expect(action).not.toHaveBeenCalled()
    expect(draw).not.toHaveBeenCalled()
    expect(callbacks).toHaveLength(0)
  })
})

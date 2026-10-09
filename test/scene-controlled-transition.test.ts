// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { Rectangle, StayAnimatedChild, type SceneStepChild, type SceneStepSubmission } from "react-stay-canvas"
import { WorkerPlayback } from "../src/stay/worker/playback"
import { createStage } from "./helpers/stage"

const signal = () => new AbortController().signal
const stroke = { color: { r: 1, g: 2, b: 3, a: 1 }, lineWidth: 2 }

function shape(x: number, layer = 0) {
  return new Rectangle({ x, y: 20, width: 40, height: 30, layer,
    strokeConfig: stroke, transition: { type: "linear", durationMs: 0, delayMs: 0 } })
}

function child(id: string, shapes: [string, Rectangle][]): SceneStepChild {
  return { id, className: "scene", shapes: new Map(shapes) }
}

function target(children: SceneStepChild[], durationMs = 100): SceneStepSubmission {
  return { revision: "target", resourceRevision: "resources", durationMs, children }
}

function fixture(children = [child("value", [["body", shape(0)]])]) {
  const frames: FrameRequestCallback[] = []
  const { stage } = createStage({ raf: (callback) => { frames.push(callback); return frames.length } })
  stage.tools.scene.appendStep({ ...target(children, 0), revision: "initial" }, { signal: signal() })
  return {
    stage,
    nextFrame() { frames.shift()!(performance.now()) },
    live(id = "value") { return stage.tools.getChildById(id) as StayAnimatedChild<Rectangle> },
    async accept(submission: SceneStepSubmission) {
      const prepared = await stage.tools.scene.prepareTransition(stage.tools.scene.beginUpdate(), submission, { signal: signal() })
      const commit = stage.tools.scene.commit(prepared)
      frames.shift()!(performance.now())
      await commit
      return prepared
    },
  }
}

afterEach(() => vi.restoreAllMocks())

describe("single-target controlled scene transitions", () => {
  it("rejects an invalid interval even when the source and target contain no shapes", async () => {
    const f = fixture([])
    await expect(f.stage.tools.scene.prepareTransition(f.stage.tools.scene.beginUpdate(), target([], NaN), {
      signal: signal(),
    })).rejects.toThrow(/duration/)
    expect(f.stage.currentSample.time).toBe(0)
    expect(f.stage.tools.scene.revision).toBe("initial")
    f.stage.destroy()
  })

  it("starts at the displayed pose from a nonzero old clock and preserves native target ownership", async () => {
    const f = fixture()
    const overlay = f.stage.tools.appendChild({ id: "overlay", className: "overlay", shape: shape(300) })
    f.stage.tools.progress({ timeMs: 800 })
    const previous = f.live()
    const previousShape = previous.shapeMap.get("body")!
    const supplied = shape(100, 1)
    supplied.zIndex = 7
    const binding = { selection: "target" }
    supplied.shapeStore.set("binding", binding)
    const copy = vi.spyOn(supplied, "copy")
    const prepared = await f.stage.tools.scene.prepareTransition(f.stage.tools.scene.beginUpdate(), target([
      { ...child("value", [["body", supplied]]), placement: { type: "affine", matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } } },
    ]), { signal: signal() })
    expect(copy).toHaveBeenCalledOnce()
    expect(f.live()).toBe(previous)
    expect(previousShape.parent).toBe(previous)
    expect(f.stage.currentSample.time).toBe(800)
    const commit = f.stage.tools.scene.commit(prepared)
    f.nextFrame()
    await commit
    expect(f.stage.currentSample).toEqual({ time: 0 })
    expect(f.live().shapeMap.get("body")!.x).toBe(0)
    expect(f.stage.tools.getChildById("overlay")).toBe(overlay)
    expect(supplied.parent).toBeUndefined()
    supplied.move(1000, 0)
    f.stage.tools.progress({ timeMs: 50 })
    expect(f.live().shapeMap.get("body")!.x).toBeCloseTo(50)
    const endpoint = f.live().getSlice("body").at(-1)!
    const endpointCopy = vi.spyOn(endpoint, "copy")
    f.stage.tools.progress({ timeMs: 100 })
    f.stage.tools.scene.settleTransition()
    expect(f.stage.currentSample).toEqual({ time: 0 })
    expect(f.live().getSlice("body")).toEqual([endpoint])
    expect(f.live().shapeMap.get("body")).toBe(endpoint)
    expect(endpointCopy).not.toHaveBeenCalled()
    expect(endpoint.layer).toBe(1)
    expect(endpoint.zIndex).toBe(7)
    expect(endpoint.shapeStore.get("binding")).toBe(binding)
    expect(f.live().totalDurationMs).toBe(0)
    const appended = f.stage.tools.scene.appendStep(target([child("value", [["body", shape(200, 1)]])]), { signal: signal() })
    expect(appended.endTimeMs).toBe(100)
    f.stage.destroy()
  })

  it("retains entered targets exactly and removes exited children and slices at the endpoint", async () => {
    const f = fixture([
      child("value", [["body", shape(0)], ["removed", shape(200)]]),
      child("leaving", [["body", shape(300)]]),
    ])
    await f.accept(target([child("value", [["body", shape(100)]]), child("entering", [["body", shape(400)]])]))
    f.stage.tools.progress({ timeMs: 50 })
    expect(f.live("leaving").shapeMap.get("body")!.strokeConfig.color.a).toBeCloseTo(0.5)
    expect(f.live("entering").shapeMap.get("body")!.strokeConfig.color.a).toBeCloseTo(0.5)
    f.stage.tools.progress({ timeMs: 100 })
    f.stage.tools.scene.settleTransition()
    expect(f.stage.tools.hasChild("leaving")).toBe(false)
    expect([...f.live().shapeFramesMap.keys()]).toEqual(["body"])
    expect(f.live("entering").getSlice("body")).toHaveLength(1)
    expect(f.live("entering").shapeMap.get("body")!.x).toBe(400)
    f.stage.destroy()
  })

  it("uses the existing playback speed, seek and pause, then freezes the current projection without a new target", async () => {
    const f = fixture()
    await f.accept(target([child("value", [["body", shape(100)]])]))
    let now = 1000
    vi.spyOn(performance, "now").mockImplementation(() => now)
    const playback = new WorkerPlayback(f.stage as never, vi.fn())
    playback.play({ toTimeMs: 100, speed: 2 })
    now += 20
    playback.advance()
    expect(f.live().shapeMap.get("body")!.x).toBeCloseTo(40)
    playback.pause()
    now += 100
    playback.advance()
    expect(f.live().shapeMap.get("body")!.x).toBeCloseTo(40)
    playback.seek({ timeMs: 25 })
    const visible = f.live().shapeMap.get("body")!
    const copy = vi.spyOn(visible, "copy")
    f.stage.tools.scene.settleTransition()
    expect(copy).not.toHaveBeenCalled()
    expect(f.live().shapeMap.get("body")).toBe(visible)
    expect(f.live().getSlice("body")).toEqual([visible])
    expect(playback.state().timeMs).toBe(0)
    await f.accept(target([child("value", [["body", shape(200)]])]))
    f.stage.tools.progress({ timeMs: 50 })
    expect(f.live().shapeMap.get("body")!.x).toBeCloseTo(112.5)
    f.stage.destroy()
  })

  it.each(["abort", "discard", "supersede", "invalid"] as const)(
    "keeps the displayed scene and native parents after %s preparation",
    async (termination) => {
      const f = fixture()
      const previous = f.live()
      const displayed = previous.shapeMap.get("body")!
      const supplied = shape(100, termination === "invalid" ? 9 : 0)
      const epoch = f.stage.tools.scene.beginUpdate()
      const controller = new AbortController()
      const pending = f.stage.tools.scene.prepareTransition(epoch, target([child("value", [["body", supplied]])]), { signal: controller.signal })
      if (termination === "invalid") await expect(pending).rejects.toThrow(/layer/)
      else {
        const prepared = await pending
        if (termination === "abort") controller.abort()
        if (termination === "discard") f.stage.tools.scene.discard(prepared)
        if (termination === "supersede") f.stage.tools.scene.beginUpdate()
        await expect(f.stage.tools.scene.commit(prepared)).rejects.toThrow(/cancelled|discarded|stale/)
      }
      expect(f.live()).toBe(previous)
      expect(f.live().shapeMap.get("body")).toBe(displayed)
      expect(displayed.parent).toBe(previous)
      expect(supplied.parent).toBeUndefined()
      expect(f.stage.tools.scene.revision).toBe("initial")
      f.stage.destroy()
    },
  )

  it("allows an independent offline prepare and sample without losing the live transition endpoint", async () => {
    const f = fixture()
    await f.accept(target([child("value", [["body", shape(100)]])]))
    f.stage.tools.progress({ timeMs: 50 })
    const epoch = f.stage.tools.scene.beginUpdate()
    const offline = await f.stage.tools.scene.prepare(epoch, {
      revision: "offline", resourceRevision: "other", children: [{
        id: "output", className: "output", slices: [{ name: "body", frames: [shape(999)] }],
      }],
    }, { transitionId: "shape", control: { kind: "timeline", durationMs: 0 }, signal: signal() })
    expect(f.stage.tools.scene.sample(offline, 0)[0].shapes.get("body")!.x).toBe(999)
    expect(f.live().shapeMap.get("body")!.x).toBeCloseTo(50)
    expect(f.stage.currentSample.time).toBe(50)
    f.stage.tools.scene.discard(offline)
    f.stage.tools.progress({ timeMs: 100 })
    f.stage.tools.scene.settleTransition()
    expect(f.live().getSlice("body")).toHaveLength(1)
    expect(f.live().shapeMap.get("body")!.x).toBe(100)
    f.stage.destroy()
  })

  it("copies each source and target once and preserves custom native interpolation", async () => {
    class CustomRectangle extends Rectangle {
      override copy() {
        return new CustomRectangle({ x: this.x, y: this.y, width: this.width, height: this.height, ...this.copyProps() })
      }
      override intermediateState(before: Rectangle, after: Rectangle, ratio: number, easing: Rectangle["transition"]["type"]) {
        return new CustomRectangle(this.getIntermediateObj(before, after, ratio, easing))
      }
    }
    const initial = new CustomRectangle({ x: 0, y: 0, width: 40, height: 30, strokeConfig: stroke })
    const f = fixture([child("value", [["body", initial]])])
    const source = f.live().shapeMap.get("body")!
    const sourceCopy = vi.spyOn(source, "copy")
    const submitted = new CustomRectangle({ x: 100, y: 0, width: 40, height: 30, strokeConfig: stroke,
      transition: { type: "linear" } })
    const targetCopy = vi.spyOn(submitted, "copy")
    await f.accept(target([child("value", [["body", submitted]])]))
    expect(sourceCopy).toHaveBeenCalledOnce()
    expect(targetCopy).toHaveBeenCalledOnce()
    expect(source.parent).not.toBe(f.live())
    f.stage.tools.progress({ timeMs: 50 })
    expect(f.live().shapeMap.get("body")).toBeInstanceOf(CustomRectangle)
    expect(f.live().shapeMap.get("body")!.x).toBeCloseTo(50)
    f.stage.tools.progress({ timeMs: 100 })
    f.stage.tools.scene.settleTransition()
    expect(f.live().getSlice("body")[0]).toBeInstanceOf(CustomRectangle)
    expect(sourceCopy).toHaveBeenCalledOnce()
    expect(targetCopy).toHaveBeenCalledOnce()
    f.stage.destroy()
  })

  it.each([50, 100])("keeps resources needed by a retained pose at %sms and releases them exactly once", async (settleTime) => {
    const f = fixture()
    const oldRelease = vi.fn()
    let oldCurrent = true
    const old = await f.stage.tools.scene.prepare(f.stage.tools.scene.beginUpdate(), {
      revision: "leased", resourceRevision: "old", children: [{
        id: "value", className: "scene", slices: [{ name: "body", frames: [shape(0)] }],
      }],
    }, {
      transitionId: "shape", control: { kind: "timeline", durationMs: 0 }, signal: signal(),
      resourceLease: { revision: "old", isCurrent: () => oldCurrent, release: oldRelease },
    })
    const oldCommit = f.stage.tools.scene.commit(old)
    f.nextFrame()
    await oldCommit
    const targetRelease = vi.fn()
    const prepared = await f.stage.tools.scene.prepareTransition(f.stage.tools.scene.beginUpdate(), target([
      child("value", [["body", shape(100)]]),
    ]), {
      signal: signal(), resourceLease: { revision: "resources", isCurrent: () => true, release: targetRelease },
    })
    const commit = f.stage.tools.scene.commit(prepared)
    f.nextFrame()
    await commit
    expect(oldRelease).not.toHaveBeenCalled()
    f.stage.tools.progress({ timeMs: settleTime })
    f.stage.tools.scene.settleTransition()
    f.stage.tools.scene.settleTransition()
    expect(f.live().shapeMap.get("body")!.x).toBeCloseTo(settleTime)
    expect(f.live().getSlice("body")).toHaveLength(1)
    expect(oldRelease).toHaveBeenCalledTimes(settleTime === 100 ? 1 : 0)
    expect(targetRelease).not.toHaveBeenCalled()
    oldCurrent = false
    expect(() => f.stage.tools.scene.appendStep(target([child("value", [["body", shape(200)]])], 0), {
      signal: signal(),
    })).not.toThrow()
    const replacement = await f.stage.tools.scene.prepare(f.stage.tools.scene.beginUpdate(), {
      revision: "replacement", resourceRevision: "new", children: [],
    }, { transitionId: "shape", control: { kind: "timeline", durationMs: 0 }, signal: signal() })
    const replace = f.stage.tools.scene.commit(replacement)
    f.nextFrame()
    await replace
    expect(oldRelease).toHaveBeenCalledOnce()
    expect(targetRelease).toHaveBeenCalledOnce()
    f.stage.destroy()
    expect(oldRelease).toHaveBeenCalledOnce()
    expect(targetRelease).toHaveBeenCalledOnce()
  })

  it("retains displayed shape ownership when copying fails or cancellation occurs while queued", async () => {
    const f = fixture()
    const live = f.live()
    const source = live.shapeMap.get("body")!
    const broken = shape(100)
    vi.spyOn(broken, "copy").mockImplementation(() => { throw new Error("copy failed") })
    await expect(f.stage.tools.scene.prepareTransition(f.stage.tools.scene.beginUpdate(), target([
      child("value", [["body", broken]]),
    ]), { signal: signal() })).rejects.toThrow("copy failed")
    expect(f.live()).toBe(live)
    expect(source.parent).toBe(live)
    const controller = new AbortController()
    const prepared = await f.stage.tools.scene.prepareTransition(f.stage.tools.scene.beginUpdate(), target([
      child("value", [["body", shape(100)]]),
    ]), { signal: controller.signal })
    const commit = f.stage.tools.scene.commit(prepared)
    const rejected = expect(commit).rejects.toThrow(/cancelled/)
    controller.abort()
    f.nextFrame()
    await rejected
    expect(f.live()).toBe(live)
    expect(source.parent).toBe(live)
    f.stage.destroy()
  })
})

// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import {
  Rectangle,
  StayAnimatedChild,
  StayText,
  type SceneBatchSubmission,
  type SceneStepSequenceSubmission,
  type SceneSubmission,
} from "react-stay-canvas"
import { createStage } from "./helpers/stage"

const stroke = { color: { r: 1, g: 2, b: 3, a: 1 }, lineWidth: 2 }

function frame(x: number, durationMs = 0) {
  return new Rectangle({
    x, y: 20, width: 40, height: 30,
    strokeConfig: stroke,
    transition: { durationMs, delayMs: 0, type: "linear" },
  })
}

function label(x: number) {
  return new StayText({
    x,
    y: 70,
    text: "value",
    fillConfig: { color: { r: 4, g: 5, b: 6, a: 1 } },
    transition: { durationMs: 0, delayMs: 0, type: "linear" },
  })
}

function installTextMeasurement() {
  vi.stubGlobal("OffscreenCanvas", class {
    constructor(
      public width: number,
      public height: number,
    ) {}

    getContext() {
      return {
        font: "",
        textAlign: "start",
        textBaseline: "alphabetic",
        measureText: () => ({
          width: 40,
          fontBoundingBoxAscent: 12,
          fontBoundingBoxDescent: 4,
        }),
      }
    }
  })
}

function scene(revision: string, positions: readonly [string, number][]): SceneSubmission {
  return {
    revision,
    resourceRevision: `resources-${revision}`,
    children: positions.map(([id, x]) => ({
      id, className: "scene", slices: [{ name: "body", frames: [frame(x)] }],
    })),
  }
}

function stageWithFrames() {
  const frames: FrameRequestCallback[] = []
  const { stage } = createStage({ raf: (callback) => {
    frames.push(callback)
    return frames.length
  } })
  return {
    stage,
    nextFrame(now = 0) {
      const callback = frames.shift()
      if (!callback) throw new Error("No render frame was scheduled")
      callback(now)
    },
  }
}

function options(revision: string, signal = new AbortController().signal) {
  return {
    transitionId: "shape" as const,
    control: { kind: "timeline" as const, durationMs: 100 },
    signal,
  }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

describe("scene transactions through the public tools surface", () => {
  it("samples independent native shapes without changing live state or the later commit", async () => {
    installTextMeasurement()
    const { stage, nextFrame } = stageWithFrames()
    const live = stage.tools.scene.appendStep({
      revision: "live", resourceRevision: "resources-live", durationMs: 0,
      children: [{ id: "live", className: "live", shapes: new Map([["body", frame(10)]]) }],
    }, { signal: new AbortController().signal })
    expect(live.endTimeMs).toBe(0)
    stage.tools.progress({ timeMs: 25 })
    const liveChild = stage.tools.getChildById("live") as StayAnimatedChild<Rectangle>
    const liveShapeMap = liveChild.shapeMap
    const viewport = stage.tools.viewport.get()
    const history = [...stage.stack]
    const historyIndex = stage.stackIndex
    const cancelPointer = vi.spyOn(stage.eventDispatcher, "cancelPointerSession")

    const replacement: SceneStepSequenceSubmission = {
      revision: "sampled",
      resourceRevision: "resources-sampled",
      steps: (async function* () {
        yield {
          revision: "start", resourceRevision: "resources-sampled", durationMs: 0,
          children: [
            { id: "card", className: "card", placement: { type: "affine", x: 10, y: 20 },
              shapes: new Map([["body", frame(0)], ["label", label(0)]]) },
            { id: "leaving", className: "temporary", shapes: new Map([["body", frame(20)]]) },
          ],
        }
        yield {
          revision: "end", resourceRevision: "resources-sampled", durationMs: 100,
          children: [
            { id: "card", className: "card",
              shapes: new Map([["body", frame(100)], ["label", label(200)]]) },
            { id: "entering", className: "temporary", shapes: new Map([["body", frame(80)]]) },
          ],
        }
      })(),
    }
    const epoch = stage.tools.scene.beginUpdate()
    const prepared = await stage.tools.scene.prepare(epoch, replacement, {
      ...options("sampled"),
      control: { kind: "timeline", durationMs: 0 },
    })

    const sampled = stage.tools.scene.sample(prepared, 50)
    const card = sampled.find(({ id }) => id === "card")!
    const leaving = sampled.find(({ id }) => id === "leaving")!
    const entering = sampled.find(({ id }) => id === "entering")!
    expect((card.shapes.get("body") as Rectangle).x).toBeCloseTo(50)
    expect((card.shapes.get("label") as StayText).x).toBeCloseTo(100)
    expect((leaving.shapes.get("body") as Rectangle).strokeConfig.color.a).toBeCloseTo(0.5)
    expect((entering.shapes.get("body") as Rectangle).strokeConfig.color.a).toBeCloseTo(0.5)
    expect([...card.shapes.values()].every(({ parent }) => parent === undefined)).toBe(true)
    expect(card).toMatchObject({
      id: "card",
      className: "card",
      placement: { type: "affine", matrix: { e: 10, f: 20 } },
    })

    ;(card.shapes.get("body") as Rectangle).move(500, 0)
    ;(card.placement as any).matrix.e = 500
    const resampled = stage.tools.scene.sample(prepared, 50)
    const resampledCard = resampled.find(({ id }) => id === "card")!
    expect(resampledCard).not.toBe(card)
    expect(resampledCard.shapes).not.toBe(card.shapes)
    expect((resampledCard.shapes.get("body") as Rectangle).x).toBeCloseTo(50)
    expect((resampledCard.placement as any).matrix.e).toBe(10)
    expect(stage.tools.scene.sample(prepared, 100)
      .find(({ id }) => id === "leaving")!.shapes.size).toBe(0)
    expect((stage.tools.scene.sample(prepared, 100)
      .find(({ id }) => id === "entering")!.shapes.get("body") as Rectangle).x).toBe(80)

    expect(stage.tools.getChildById("live")).toBe(liveChild)
    expect(liveChild.shapeMap).toBe(liveShapeMap)
    expect(liveChild.shapeMap.get("body")!.x).toBe(10)
    expect(stage.tools.scene.revision).toBe("live")
    expect(stage.tools.viewport.get()).toEqual(viewport)
    expect(stage.stack).toEqual(history)
    expect(stage.stackIndex).toBe(historyIndex)
    expect(cancelPointer).not.toHaveBeenCalled()

    const commit = stage.tools.scene.commit(prepared)
    nextFrame()
    await commit
    expect(cancelPointer).toHaveBeenCalledOnce()
    const committed = stage.tools.getChildById("card") as StayAnimatedChild
    expect((committed.shapeMap.get("body") as Rectangle).x).toBeCloseTo(25)
    expect((committed.shapeMap.get("label") as StayText).x).toBeCloseTo(50)
    stage.destroy()
    vi.unstubAllGlobals()
  })

  it("samples only the current owned preparation with valid resources and time", async () => {
    const first = stageWithFrames()
    const second = stageWithFrames()
    const target: SceneSubmission = {
      revision: "bounded",
      resourceRevision: "resources-bounded",
      children: [{
        id: "card", className: "scene",
        slices: [{ name: "body", frames: [frame(0), frame(100, 100)] }],
      }],
    }
    const epoch = first.stage.tools.scene.beginUpdate()
    const prepared = await first.stage.tools.scene.prepare(epoch, target, {
      ...options("bounded"), control: { kind: "timeline", durationMs: 0 },
    })

    expect(() => second.stage.tools.scene.sample(prepared, 0)).toThrow(/another Canvas or is forged/)
    expect(() => first.stage.tools.scene.sample({ ...prepared }, 0)).toThrow(/another Canvas or is forged/)
    for (const time of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => first.stage.tools.scene.sample(prepared, time)).toThrow(/outside 0\.\.100/)
    }
    first.stage.tools.scene.cancel(epoch)
    expect(() => first.stage.tools.scene.sample(prepared, 0)).toThrow(/cancelled/)

    const discarded = await first.stage.tools.scene.prepare(
      first.stage.tools.scene.beginUpdate(), target, {
        ...options("bounded"), control: { kind: "timeline", durationMs: 0 },
      },
    )
    first.stage.tools.scene.discard(discarded)
    expect(() => first.stage.tools.scene.sample(discarded, 0)).toThrow(/discarded/)

    const stale = await first.stage.tools.scene.prepare(
      first.stage.tools.scene.beginUpdate(), target, {
        ...options("bounded"), control: { kind: "timeline", durationMs: 0 },
      },
    )
    first.stage.tools.scene.beginUpdate()
    expect(() => first.stage.tools.scene.sample(stale, 0)).toThrow(/stale/)

    let resourcesCurrent = true
    const staleResources = await first.stage.tools.scene.prepare(
      first.stage.tools.scene.beginUpdate(), target, {
        ...options("bounded"),
        control: { kind: "timeline", durationMs: 0 },
        resourceLease: {
          revision: "resources-bounded",
          isCurrent: () => resourcesCurrent,
          release: vi.fn(),
        },
      },
    )
    resourcesCurrent = false
    expect(() => first.stage.tools.scene.sample(staleResources, 0)).toThrow(/resources are stale/)
    first.stage.tools.scene.discard(staleResources)

    const committed = await first.stage.tools.scene.prepare(
      first.stage.tools.scene.beginUpdate(), target, {
        ...options("bounded"), control: { kind: "timeline", durationMs: 0 },
      },
    )
    const accepted = first.stage.tools.scene.commit(committed)
    expect(() => first.stage.tools.scene.sample(committed, 0)).toThrow(/queued/)
    first.nextFrame()
    await accepted
    expect(() => first.stage.tools.scene.sample(committed, 0)).toThrow(/committed/)
    first.stage.destroy()
    second.stage.destroy()
  })

  it("prepares complete replacement steps in the native timeline and commits at the existing cursor", async () => {
    const { stage, nextFrame } = stageWithFrames()
    stage.tools.scene.appendStep({
      revision: "old", resourceRevision: "old-font", durationMs: 0,
      children: [{ id: "a", className: "scene", shapes: new Map([["body", frame(10)]]) }],
    }, { signal: new AbortController().signal })
    const old = stage.tools.getChildById("a")
    const firstPrepared = deferred()
    const continueSteps = deferred()
    const first = frame(200)
    const pending = stage.tools.scene.prepare(stage.tools.scene.beginUpdate(), {
      revision: "replacement", resourceRevision: "new-font",
      steps: (async function* () {
        yield { revision: "step-0", resourceRevision: "new-font", durationMs: 0,
          children: [{ id: "a", className: "scene", shapes: new Map([["body", first]]) }] }
        firstPrepared.resolve()
        await continueSteps.promise
        yield { revision: "step-1", resourceRevision: "new-font", durationMs: 100,
          children: [{ id: "a", className: "scene", shapes: new Map([["body", frame(300)]]) }] }
        yield { revision: "step-2", resourceRevision: "new-font", durationMs: 100,
          children: [{ id: "a", className: "scene", shapes: new Map([["body", frame(300)]]) }] }
      })(),
    }, { ...options("replacement"), control: { kind: "timeline", durationMs: 0 } })
    await firstPrepared.promise
    expect(stage.tools.getChildById("a")).toBe(old)
    expect(stage.tools.scene.revision).toBe("old")
    first.move(500, 0)
    stage.tools.progress({ timeMs: 75 })
    continueSteps.resolve()
    const prepared = await pending
    expect(stage.tools.getChildById("a")).toBe(old)
    const accepted = stage.tools.scene.commit(prepared)
    nextFrame(16)
    await accepted
    const replacement = stage.tools.getChildById("a") as StayAnimatedChild<Rectangle>
    expect(replacement.getSlice("body").map(({ x }) => x)).toEqual([200, 200, 300])
    expect(replacement.totalDurationMs).toBe(200)
    expect(replacement.shapeMap.get("body")!.x).toBeCloseTo(275)
    const appended = stage.tools.scene.appendStep({
      revision: "step-3", resourceRevision: "new-font", durationMs: 100,
      children: [{ id: "a", className: "scene", shapes: new Map([["body", frame(400)]]) }],
    }, { signal: new AbortController().signal })
    expect(appended.endTimeMs).toBe(300)
    stage.tools.progress({ timeMs: 250 })
    expect(replacement.shapeMap.get("body")!.x).toBeCloseTo(350)
    stage.destroy()
  })

  it("keeps the accepted native end after replacing with empty steps", async () => {
    const { stage, nextFrame } = stageWithFrames()
    stage.tools.scene.appendStep({
      revision: "old-0", resourceRevision: "old-font", durationMs: 0,
      children: [{ id: "old", className: "scene", shapes: new Map([["body", frame(10)]]) }],
    }, { signal: new AbortController().signal })
    stage.tools.scene.appendStep({
      revision: "old-1", resourceRevision: "old-font", durationMs: 1000,
      children: [{ id: "old", className: "scene", shapes: new Map([["body", frame(100)]]) }],
    }, { signal: new AbortController().signal })

    const prepared = await stage.tools.scene.prepare(stage.tools.scene.beginUpdate(), {
      revision: "empty-replacement", resourceRevision: "new-font",
      steps: (async function* () {
        yield { revision: "empty-0", resourceRevision: "new-font", durationMs: 0, children: [] }
        yield { revision: "empty-1", resourceRevision: "new-font", durationMs: 100, children: [] }
        yield { revision: "empty-2", resourceRevision: "new-font", durationMs: 200, children: [] }
      })(),
    }, { ...options("empty-replacement"), control: { kind: "timeline", durationMs: 0 } })
    const commit = stage.tools.scene.commit(prepared)
    nextFrame()
    await commit

    expect(stage.tools.hasChild("old")).toBe(false)
    const appended = stage.tools.scene.appendStep({
      revision: "empty-3", resourceRevision: "new-font", durationMs: 100,
      children: [{ id: "new", className: "scene", shapes: new Map([["body", frame(400)]]) }],
    }, { signal: new AbortController().signal })
    const child = stage.tools.getChildById("new") as StayAnimatedChild<Rectangle>

    expect(appended.endTimeMs).toBe(400)
    expect(child.totalDurationMs).toBe(400)
    expect(child.getSliceTotalDurationMs("body")).toBe(400)
    stage.tools.progress({ timeMs: 350 })
    expect(child.shapeMap.get("body")!.x).toBe(400)
    stage.destroy()
  })

  it.each(["abort", "invalid"] as const)("keeps the accepted scene when replacement steps %s", async (termination) => {
    const { stage } = stageWithFrames()
    stage.tools.scene.appendStep({
      revision: "old", resourceRevision: "old-font", durationMs: 0,
      children: [{ id: "a", className: "scene", shapes: new Map([["body", frame(10)]]) }],
    }, { signal: new AbortController().signal })
    const old = stage.tools.getChildById("a")
    const controller = new AbortController()
    const closed = vi.fn()
    const pending = stage.tools.scene.prepare(stage.tools.scene.beginUpdate(), {
      revision: "replacement", resourceRevision: "new-font",
      steps: (async function* () {
        try {
          yield { revision: "first", resourceRevision: "new-font", durationMs: 0,
            children: [{ id: "a", className: "scene", shapes: new Map([["body", frame(200)]]) }] }
          if (termination === "abort") controller.abort()
          yield { revision: "second", resourceRevision: "wrong-font", durationMs: 100, children: [] }
        } finally { closed() }
      })(),
    }, options("replacement", controller.signal))
    await expect(pending).rejects.toThrow(termination === "abort" ? "cancelled" : "resources")
    expect(closed).toHaveBeenCalledOnce()
    expect(stage.tools.getChildById("a")).toBe(old)
    expect(stage.tools.scene.revision).toBe("old")
    expect((old as StayAnimatedChild<Rectangle>).shapeMap.get("body")!.x).toBe(10)
    stage.destroy()
  })

  it("copies batches independently while the live scene keeps its playback position", async () => {
    const { stage, nextFrame } = stageWithFrames()
    const live: SceneSubmission = {
      revision: "live", resourceRevision: "resources-live",
      children: [{ id: "a", className: "scene", slices: [{ name: "body", frames: [frame(0), frame(100, 100)] }] }],
    }
    const initial = await stage.tools.scene.prepare(stage.tools.scene.beginUpdate(), live, {
      ...options("live"), control: { kind: "timeline", durationMs: 0 },
    })
    const initialCommit = stage.tools.scene.commit(initial)
    nextFrame()
    await initialCommit
    const liveChild = stage.tools.getChildById("a") as StayAnimatedChild<Rectangle>

    const firstCopied = deferred()
    const continueBatches = deferred()
    const firstFrame = frame(200)
    const target: SceneBatchSubmission = {
      revision: "batched", resourceRevision: "resources-batched",
      batches: (async function* () {
        yield [{ id: "a", className: "scene", slices: [{ name: "body", frames: [firstFrame, frame(300, 100)] }] }]
        firstCopied.resolve()
        await continueBatches.promise
        yield scene("batched", [["b", 400]]).children
      })(),
    }
    const pending = stage.tools.scene.prepare(stage.tools.scene.beginUpdate(), target, {
      ...options("batched"), control: { kind: "timeline", durationMs: 0 },
    })
    await firstCopied.promise
    expect(stage.tools.getChildById("a")).toBe(liveChild)
    expect(stage.tools.hasChild("b")).toBe(false)
    stage.tools.progress({ timeMs: 75 })
    expect(liveChild.shapeMap.get("body")!.x).toBeCloseTo(75)
    firstFrame.move(500, 0)
    continueBatches.resolve()
    const prepared = await pending
    expect(stage.tools.scene.revision).toBe("live")
    const commit = stage.tools.scene.commit(prepared)
    nextFrame(16)
    await commit
    const nextChild = stage.tools.getChildById("a") as StayAnimatedChild<Rectangle>
    expect(nextChild.getSlice("body").map(({ x }) => x)).toEqual([200, 300])
    expect(nextChild.shapeMap.get("body")!.x).toBeCloseTo(275)
    expect(stage.tools.hasChild("b")).toBe(true)
    expect(firstFrame.parent).toBeUndefined()
    stage.destroy()
  })

  it.each(["abort", "cancel", "supersede", "destroy"] as const)(
    "releases an unfinished batch preparation once on %s and closes its iterator",
    async (termination) => {
      const { stage } = stageWithFrames()
      const firstCopied = deferred()
      const continueBatches = deferred()
      const closed = vi.fn()
      const release = vi.fn()
      const controller = new AbortController()
      const epoch = stage.tools.scene.beginUpdate()
      const pending = stage.tools.scene.prepare(epoch, {
        revision: "batched", resourceRevision: "resources-batched",
        batches: (async function* () {
          try {
            yield scene("batched", [["a", 0]]).children
            firstCopied.resolve()
            await continueBatches.promise
            yield scene("batched", [["b", 10]]).children
          } finally { closed() }
        })(),
      }, {
        ...options("batched", controller.signal),
        resourceLease: { revision: "resources-batched", isCurrent: () => true, release },
      })
      await firstCopied.promise
      if (termination === "abort") controller.abort()
      if (termination === "cancel") stage.tools.scene.cancel(epoch)
      if (termination === "supersede") stage.tools.scene.beginUpdate()
      if (termination === "destroy") stage.destroy()
      expect(release).toHaveBeenCalledOnce()
      continueBatches.resolve()
      await expect(pending).rejects.toThrow(/cancelled|stale/)
      expect(closed).toHaveBeenCalledOnce()
      expect(stage.tools.hasChild("a")).toBe(false)
      expect(stage.tools.hasChild("b")).toBe(false)
      stage.destroy()
      expect(release).toHaveBeenCalledOnce()
    },
  )

  it.each(["duplicate", "producer-error"])(
    "keeps the visible scene when a later batch has a %s",
    async (failure) => {
      const { stage, nextFrame } = stageWithFrames()
      const first = await stage.tools.scene.prepare(
        stage.tools.scene.beginUpdate(), scene("live", [["live", 20]]), options("live"),
      )
      const committed = stage.tools.scene.commit(first)
      nextFrame()
      await committed
      const liveChild = stage.tools.getChildById("live")
      const release = vi.fn()
      await expect(stage.tools.scene.prepare(stage.tools.scene.beginUpdate(), {
        revision: "batched", resourceRevision: "resources-batched",
        batches: (async function* () {
          yield scene("batched", [["a", 0]]).children
          if (failure === "producer-error") throw new Error("producer stopped")
          yield scene("batched", [["a", 10]]).children
        })(),
      }, {
        ...options("batched"),
        resourceLease: { revision: "resources-batched", isCurrent: () => true, release },
      })).rejects.toThrow(failure === "duplicate" ? /Duplicate/ : /producer stopped/)
      expect(stage.tools.scene.revision).toBe("live")
      expect(stage.tools.getChildById("live")).toBe(liveChild)
      expect(stage.tools.hasChild("a")).toBe(false)
      expect(release).toHaveBeenCalledOnce()
      stage.destroy()
    },
  )

  it("prepares complete independent slices with their frame order, layers, and durations", async () => {
    const { stage, nextFrame } = stageWithFrames()
    const body = [frame(0), frame(20, 20), frame(60, 40), frame(100, 40)]
    const label = [frame(200, 20), frame(240, 40)]
    label.forEach((shape) => { shape.layer = 1 })
    const target: SceneSubmission = {
      revision: "complete-slices",
      resourceRevision: "resources-complete-slices",
      children: [{
        id: "card", className: "scene",
        slices: [
          { name: "body", frames: body },
          { name: "label", frames: label, prependZeroShape: true },
        ],
      }],
    }
    const prepared = await stage.tools.scene.prepare(
      stage.tools.scene.beginUpdate(), target,
      { ...options(target.revision), control: { kind: "timeline", durationMs: 0 } }
    )
    body[2].move(500, 0)
    const commit = stage.tools.scene.commit(prepared)
    nextFrame()
    await commit

    const child = stage.tools.getChildById("card") as StayAnimatedChild<Rectangle>
    expect(child.getSlice("body").map((shape) => shape.x)).toEqual([0, 20, 60, 100])
    expect(child.getSlice("label")).toHaveLength(3)
    expect(child.getSlice("label").map((shape) => shape.layer)).toEqual([1, 1, 1])
    expect(child.totalDurationMs).toBe(100)
    expect(child.getSliceTotalDurationMs("label")).toBe(60)
    for (const shape of [...body, ...label]) expect(shape.parent).toBeUndefined()
    for (const name of ["body", "label"]) {
      for (const shape of child.getSlice(name)) expect(shape.parent).toBe(child)
    }
    stage.tools.progress({ timeMs: 40 })
    expect(child.shapeMap.get("body")!.x).toBeCloseTo(40)
    expect(child.shapeMap.get("label")!.x).toBeCloseTo(220)
    stage.tools.progress({ timeMs: 100 })
    expect(child.shapeMap.get("body")!.x).toBeCloseTo(100)
    expect(child.shapeMap.get("label")!.x).toBeCloseTo(240)
    stage.destroy()
  })

  it("keeps the live scene until the frame boundary and continues matching shapes from the visible pose", async () => {
    const { stage, nextFrame } = stageWithFrames()
    const existing = stage.tools.createChild({ id: "a", className: "old" })
    existing.appendKeyFrame("body", frame(0), false)
    existing.appendKeyFrame("body", frame(100, 100), false)
    stage.tools.progress({ timeMs: 40 })
    expect((existing.shapeMap.get("body") as Rectangle).x).toBeCloseTo(40)

    const epoch = stage.tools.scene.beginUpdate()
    const prepared = await stage.tools.scene.prepare(epoch, scene("two", [["a", 200], ["b", 300]]), options("two"))
    const commit = stage.tools.scene.commit(prepared)
    expect(stage.tools.scene.commit(prepared)).toBe(commit)
    expect(stage.tools.getChildById("a")).toBe(existing)
    expect(stage.tools.hasChild("b")).toBe(false)

    nextFrame()
    const receipt = await commit
    expect(receipt).toMatchObject({ revision: "two", resourceRevision: "resources-two", acceptedAtFrame: 2 })
    expect(stage.tools.scene.revision).toBe("two")
    const current = stage.tools.getChildById("a")!
    expect(current).not.toBe(existing)
    expect((current.shapeMap.get("body") as Rectangle).x).toBeCloseTo(40)
    expect(stage.tools.hasChild("b")).toBe(true)
    nextFrame(50)
    expect((current.shapeMap.get("body") as Rectangle).x).toBeCloseTo(120)
    nextFrame(100)
    expect((current.shapeMap.get("body") as Rectangle).x).toBeCloseTo(200)
    stage.tools.progress({ timeMs: 50 })
    expect((current.shapeMap.get("body") as Rectangle).x).toBeCloseTo(200)
    expect(await stage.tools.scene.commit(prepared)).toBe(receipt)
    stage.destroy()
  })

  it("preserves the live scene after preparation failure, cancellation, and a stale update", async () => {
    const { stage, nextFrame } = stageWithFrames()
    const old = stage.tools.createChild({ id: "old", className: "old" })
    old.appendKeyFrame("body", frame(5), false)
    stage.tools.progress({ timeMs: 0 })

    const badEpoch = stage.tools.scene.beginUpdate()
    const invalid = scene("bad", [["next", 9]])
    ;(invalid.children[0].slices[0].frames[0] as Rectangle).transition.durationMs = Number.NaN
    await expect(stage.tools.scene.prepare(badEpoch, invalid, options("bad"))).rejects.toThrow(/NaN/)
    expect(stage.tools.getChildById("old")).toBe(old)

    const cancelledEpoch = stage.tools.scene.beginUpdate()
    const cancelled = await stage.tools.scene.prepare(cancelledEpoch, scene("cancelled", [["next", 9]]), options("cancelled"))
    const cancelledCommit = stage.tools.scene.commit(cancelled)
    stage.tools.scene.cancel(cancelledEpoch)
    stage.tools.scene.cancel(cancelledEpoch)
    nextFrame()
    await expect(cancelledCommit).rejects.toThrow(/cancelled/)
    expect(stage.tools.getChildById("old")).toBe(old)

    const staleEpoch = stage.tools.scene.beginUpdate()
    const stale = await stage.tools.scene.prepare(staleEpoch, scene("stale", [["next", 10]]), options("stale"))
    stage.tools.scene.beginUpdate()
    await expect(stage.tools.scene.commit(stale)).rejects.toThrow(/stale/)
    expect(stage.tools.getChildById("old")).toBe(old)
    stage.destroy()
  })

  it("rejects foreign and forged handles and releases only the preparation's resource lease", async () => {
    const first = stageWithFrames()
    const second = stageWithFrames()
    const release = vi.fn()
    const lease = { revision: "resources-one", isCurrent: () => true, release }
    const epoch = first.stage.tools.scene.beginUpdate()
    const prepared = await first.stage.tools.scene.prepare(
      epoch, scene("one", [["a", 10]]), { ...options("one"), resourceLease: lease }
    )

    expect(() => second.stage.tools.scene.cancel(epoch)).toThrow(/another Canvas or is forged/)
    expect(() => second.stage.tools.scene.discard(prepared)).toThrow(/another Canvas or is forged/)
    expect(() => first.stage.tools.scene.discard({ ...prepared })).toThrow(/another Canvas or is forged/)
    first.stage.tools.scene.discard(prepared)
    first.stage.tools.scene.discard(prepared)
    expect(release).toHaveBeenCalledOnce()
    await expect(first.stage.tools.scene.commit(prepared)).rejects.toThrow(/discarded/)
    first.stage.destroy()
    second.stage.destroy()
  })

  it("ends an update after validation failure and preserves a live scene's lease", async () => {
    const { stage, nextFrame } = stageWithFrames()
    const releaseRejected = vi.fn()
    const invalidEpoch = stage.tools.scene.beginUpdate()
    await expect(stage.tools.scene.prepare(
      invalidEpoch,
      { ...scene("invalid", [["a", 1]]), revision: "" },
      { ...options("invalid"), resourceLease: {
        revision: "resources-invalid", isCurrent: () => true, release: releaseRejected,
      } },
    )).rejects.toThrow(/Invalid scene revision/)
    expect(releaseRejected).toHaveBeenCalledOnce()
    await expect(stage.tools.scene.prepare(
      invalidEpoch, scene("retry", [["a", 2]]), options("retry"),
    )).rejects.toThrow(/cannot be prepared/)

    const releaseLive = vi.fn()
    const liveLease = { revision: "resources-live", isCurrent: () => true, release: releaseLive }
    const liveEpoch = stage.tools.scene.beginUpdate()
    const prepared = await stage.tools.scene.prepare(
      liveEpoch, scene("live", [["a", 3]]),
      { ...options("live"), control: { kind: "timeline", durationMs: 0 }, resourceLease: liveLease },
    )
    const commit = stage.tools.scene.commit(prepared)
    nextFrame()
    await commit

    const duplicateEpoch = stage.tools.scene.beginUpdate()
    await expect(stage.tools.scene.prepare(
      duplicateEpoch, scene("duplicate-lease", [["a", 4]]),
      { ...options("duplicate-lease"), resourceLease: liveLease },
    )).rejects.toThrow(/already belongs to a live scene/)
    expect(stage.tools.scene.revision).toBe("live")
    expect(releaseLive).not.toHaveBeenCalled()
    stage.destroy()
    expect(releaseLive).toHaveBeenCalledOnce()
  })

  it("rejects duplicate scene identities and a live non-timeline identity before publishing", async () => {
    const { stage, nextFrame } = stageWithFrames()
    stage.tools.appendChild({ id: "static", className: "static", shape: frame(4) })
    const duplicateEpoch = stage.tools.scene.beginUpdate()
    await expect(stage.tools.scene.prepare(
      duplicateEpoch,
      scene("duplicate", [["a", 1], ["a", 2]]),
      options("duplicate")
    )).rejects.toThrow(/Duplicate/)

    const collisionEpoch = stage.tools.scene.beginUpdate()
    const prepared = await stage.tools.scene.prepare(
      collisionEpoch, scene("collision", [["static", 3]]), options("collision")
    )
    const commit = stage.tools.scene.commit(prepared)
    nextFrame()
    await expect(commit).rejects.toThrow(/non-timeline/)
    expect(stage.tools.getChildById("static")?.shape).toBeDefined()
    expect(stage.tools.scene.revision).toBeUndefined()
    stage.destroy()
  })

  it("requires an invisible starting keyframe for a delayed first slice frame", async () => {
    const { stage, nextFrame } = stageWithFrames()
    const target: SceneSubmission = {
      revision: "delayed",
      resourceRevision: "resources-delayed",
      children: [{
        id: "card", className: "scene",
        slices: [{ name: "media", frames: [frame(20, 50)] }],
      }],
    }
    const invalidEpoch = stage.tools.scene.beginUpdate()
    await expect(stage.tools.scene.prepare(invalidEpoch, target, options("delayed")))
      .rejects.toThrow(/needs a zero Shape/)
    expect(stage.tools.scene.revision).toBeUndefined()

    const validEpoch = stage.tools.scene.beginUpdate()
    const prepared = await stage.tools.scene.prepare(validEpoch, {
      ...target,
      children: [{
        ...target.children[0],
        slices: [{ ...target.children[0].slices[0], prependZeroShape: true }],
      }],
    }, options("delayed"))
    const commit = stage.tools.scene.commit(prepared)
    nextFrame()
    await commit
    stage.tools.progress({ timeMs: 25 })
    expect(stage.tools.scene.revision).toBe("delayed")
    stage.destroy()
  })

  it("rejects resources invalidated after preparation and keeps the previous active lease", async () => {
    const { stage, nextFrame } = stageWithFrames()
    let firstCurrent = true
    const firstRelease = vi.fn()
    const firstEpoch = stage.tools.scene.beginUpdate()
    const first = await stage.tools.scene.prepare(
      firstEpoch,
      scene("first", [["a", 1]]),
      { ...options("first"), resourceLease: {
        revision: "resources-first", isCurrent: () => firstCurrent, release: firstRelease,
      } }
    )
    const firstCommit = stage.tools.scene.commit(first)
    nextFrame()
    await firstCommit

    let secondCurrent = true
    const secondRelease = vi.fn()
    const secondEpoch = stage.tools.scene.beginUpdate()
    const second = await stage.tools.scene.prepare(
      secondEpoch,
      scene("second", [["a", 2]]),
      { ...options("second"), resourceLease: {
        revision: "resources-second", isCurrent: () => secondCurrent, release: secondRelease,
      } }
    )
    const secondCommit = stage.tools.scene.commit(second)
    secondCurrent = false
    nextFrame()
    await expect(secondCommit).rejects.toThrow(/stale/)
    expect(stage.tools.scene.revision).toBe("first")
    expect(firstRelease).not.toHaveBeenCalled()
    expect(secondRelease).toHaveBeenCalledOnce()

    firstCurrent = false
    stage.destroy()
    expect(firstRelease).toHaveBeenCalledOnce()
  })

  it("does not roll back an accepted scene on later cancellation or discard", async () => {
    const { stage, nextFrame } = stageWithFrames()
    const epoch = stage.tools.scene.beginUpdate()
    const prepared = await stage.tools.scene.prepare(epoch, scene("accepted", [["a", 1]]), options("accepted"))
    const commit = stage.tools.scene.commit(prepared)
    nextFrame()
    const receipt = await commit
    stage.tools.scene.cancel(epoch)
    stage.tools.scene.discard(prepared)
    expect(stage.tools.scene.revision).toBe("accepted")
    expect(stage.tools.hasChild("a")).toBe(true)
    expect(await stage.tools.scene.commit(prepared)).toBe(receipt)
    stage.destroy()
  })

  it("rejects pending commits and releases the preparation when Canvas is destroyed", async () => {
    const { stage } = stageWithFrames()
    const release = vi.fn()
    const epoch = stage.tools.scene.beginUpdate()
    const prepared = await stage.tools.scene.prepare(
      epoch, scene("pending", [["a", 1]]),
      { ...options("pending"), resourceLease: {
        revision: "resources-pending", isCurrent: () => true, release,
      } }
    )
    const commit = stage.tools.scene.commit(prepared)
    stage.destroy()
    await expect(commit).rejects.toThrow(/destroyed/)
    expect(release).toHaveBeenCalledOnce()
    expect(() => stage.tools.scene.beginUpdate()).toThrow(/destroyed/)
  })

  it("keeps playback time unchanged while a removed Child exits and releases its old resources afterward", async () => {
    const { stage, nextFrame } = stageWithFrames()
    const firstRelease = vi.fn()
    const firstEpoch = stage.tools.scene.beginUpdate()
    const first = await stage.tools.scene.prepare(
      firstEpoch, scene("first", [["a", 10], ["b", 400]]),
      { ...options("first"), control: { kind: "timeline", durationMs: 0 },
        resourceLease: { revision: "resources-first", isCurrent: () => true, release: firstRelease } }
    )
    const firstCommit = stage.tools.scene.commit(first)
    nextFrame()
    await firstCommit

    const target: SceneSubmission = {
      revision: "second",
      resourceRevision: "resources-second",
      children: [{
        id: "a", className: "scene", slices: [{ name: "body", frames: [frame(200), frame(300, 100)] }],
      }],
    }
    stage.tools.progress({ timeMs: 50 })
    const secondEpoch = stage.tools.scene.beginUpdate()
    const second = await stage.tools.scene.prepare(secondEpoch, target, options("second"))
    const secondCommit = stage.tools.scene.commit(second)
    nextFrame(1000)
    await secondCommit
    expect((stage.tools.getChildById("a")!.shapeMap.get("body") as Rectangle).x).toBeCloseTo(10)
    expect(stage.tools.hasChild("b")).toBe(false)
    const exiting = stage.sceneTransactions.renderingExits()[0]
    expect(exiting.id).toBe("b")
    expect((exiting.shapeMap.get("body") as Rectangle).strokeConfig.color.a).toBeCloseTo(1)
    expect(firstRelease).not.toHaveBeenCalled()

    nextFrame(1050)
    expect((stage.tools.getChildById("a")!.shapeMap.get("body") as Rectangle).x).toBeCloseTo(130)
    expect(stage.tools.hasChild("b")).toBe(false)
    expect((exiting.shapeMap.get("body") as Rectangle).strokeConfig.color.a).toBeCloseTo(0.5)
    nextFrame(1100)
    expect((stage.tools.getChildById("a")!.shapeMap.get("body") as Rectangle).x).toBeCloseTo(250)
    expect(stage.tools.hasChild("b")).toBe(false)
    expect(stage.sceneTransactions.renderingExits()).toHaveLength(0)
    expect(firstRelease).toHaveBeenCalledOnce()
    stage.tools.progress({ timeMs: 100 })
    expect((stage.tools.getChildById("a")!.shapeMap.get("body") as Rectangle).x).toBeCloseTo(300)
    stage.destroy()
  })

  it("starts a newer handoff from the shape visible during an interrupted handoff", async () => {
    const { stage, nextFrame } = stageWithFrames()
    const initial = stage.tools.createChild({ id: "a", className: "scene" })
    initial.appendKeyFrame("body", frame(0), false)
    stage.tools.progress({ timeMs: 0 })

    const firstEpoch = stage.tools.scene.beginUpdate()
    const first = await stage.tools.scene.prepare(firstEpoch, scene("first", [["a", 100]]), options("first"))
    const firstCommit = stage.tools.scene.commit(first)
    nextFrame(1000)
    await firstCommit
    nextFrame(1050)
    expect((stage.tools.getChildById("a")!.shapeMap.get("body") as Rectangle).x).toBeCloseTo(50)

    const secondEpoch = stage.tools.scene.beginUpdate()
    const second = await stage.tools.scene.prepare(secondEpoch, scene("second", [["a", 200]]), options("second"))
    const secondCommit = stage.tools.scene.commit(second)
    nextFrame(1050)
    await secondCommit
    expect((stage.tools.getChildById("a")!.shapeMap.get("body") as Rectangle).x).toBeCloseTo(50)
    nextFrame(1100)
    expect((stage.tools.getChildById("a")!.shapeMap.get("body") as Rectangle).x).toBeCloseTo(125)
    nextFrame(1150)
    expect((stage.tools.getChildById("a")!.shapeMap.get("body") as Rectangle).x).toBeCloseTo(200)
    stage.destroy()
  })

  it.each([
    { acceptedAt: 1075, sourceX: 75 },
    { acceptedAt: 1100, sourceX: 100 },
    { acceptedAt: 1150, sourceX: 100 },
  ])("samples an interrupted scene at the accepting frame $acceptedAt", async ({ acceptedAt, sourceX }) => {
    const { stage, nextFrame } = stageWithFrames()
    try {
      const initial = stage.tools.createChild({ id: "a", className: "scene" })
      initial.appendKeyFrame("body", frame(0), false)
      stage.tools.progress({ timeMs: 0 })

      const firstEpoch = stage.tools.scene.beginUpdate()
      const first = await stage.tools.scene.prepare(firstEpoch, scene("first", [["a", 100]]), options("first"))
      const firstCommit = stage.tools.scene.commit(first)
      nextFrame(1000)
      await firstCommit
      nextFrame(1050)
      expect((stage.tools.getChildById("a")!.shapeMap.get("body") as Rectangle).x).toBeCloseTo(50)

      const secondEpoch = stage.tools.scene.beginUpdate()
      const second = await stage.tools.scene.prepare(secondEpoch, scene("second", [["a", 200]]), options("second"))
      const secondCommit = stage.tools.scene.commit(second)
      nextFrame(acceptedAt)
      await secondCommit
      expect((stage.tools.getChildById("a")!.shapeMap.get("body") as Rectangle).x).toBeCloseTo(sourceX)

      stage.tools.scene.cancel(secondEpoch)
      expect(stage.tools.scene.revision).toBe("second")
      nextFrame(acceptedAt + 50)
      expect((stage.tools.getChildById("a")!.shapeMap.get("body") as Rectangle).x).toBeCloseTo((sourceX + 200) / 2)
      nextFrame(acceptedAt + 100)
      expect((stage.tools.getChildById("a")!.shapeMap.get("body") as Rectangle).x).toBeCloseTo(200)
    } finally {
      stage.destroy()
    }
  })
})

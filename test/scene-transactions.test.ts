// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { Rectangle, type SceneSubmission } from "react-stay-canvas"
import { createStage } from "./helpers/stage"

const stroke = { color: { r: 1, g: 2, b: 3, a: 1 }, lineWidth: 2 }

function frame(x: number, durationMs = 0) {
  return new Rectangle({
    x, y: 20, width: 40, height: 30,
    strokeConfig: stroke,
    transition: { durationMs, delayMs: 0, type: "linear" },
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

describe("scene transactions through the public tools surface", () => {
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

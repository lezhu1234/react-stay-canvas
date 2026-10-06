// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import {
  Rectangle,
  type EasingFunction,
  StayAnimatedChild,
  type SceneStepChild,
  type SceneStepSubmission,
  type SceneSubmission,
} from "react-stay-canvas"
import { createStage } from "./helpers/stage"

const stroke = { color: { r: 1, g: 2, b: 3, a: 1 }, lineWidth: 2 }

function shape(
  x: number,
  options: {
    layer?: number
    easing?: "linear" | "easeInQuad"
    durationMs?: number
    delayMs?: number
    metadata?: unknown
    shapeStoreValueEquals?: (before: unknown, after: unknown) => boolean
  } = {},
) {
  return new Rectangle({
    x,
    y: 20,
    width: 40,
    height: 30,
    layer: options.layer,
    shapeStore: options.metadata === undefined
      ? undefined
      : new Map([["metadata", options.metadata]]),
    shapeStoreValueEquals: options.shapeStoreValueEquals,
    strokeConfig: stroke,
    transition: {
      durationMs: options.durationMs ?? 17,
      delayMs: options.delayMs ?? 11,
      type: options.easing ?? "linear",
    },
  })
}

function child(
  id: string,
  shapes: readonly [string, Rectangle][],
  options: { className?: string; placement?: SceneStepChild["placement"] } = {},
): SceneStepChild {
  return {
    id,
    className: options.className ?? "scene",
    ...(options.placement ? { placement: options.placement } : {}),
    shapes: new Map(shapes),
  }
}

function step(
  revision: string,
  durationMs: number,
  children: readonly SceneStepChild[],
  resourceRevision = "resources-live",
): SceneStepSubmission {
  return { revision, resourceRevision, durationMs, children }
}

function signal() {
  return new AbortController().signal
}

function timeline(stage: ReturnType<typeof createStage>["stage"], id: string) {
  return stage.tools.getChildById(id) as StayAnimatedChild<Rectangle>
}

function stageWithFrames() {
  const frames: FrameRequestCallback[] = []
  const { stage } = createStage({
    raf: (callback) => {
      frames.push(callback)
      return frames.length
    },
  })
  return {
    stage,
    pendingFrames: () => frames.length,
    nextFrame(now = 0) {
      const callback = frames.shift()
      if (!callback) throw new Error("No render frame was scheduled")
      callback(now)
    },
  }
}

describe("complete scene-step append through the public tools surface", () => {
  it("restores earlier Children when a later native projection fails", () => {
    class FailingProjection extends Rectangle {
      override copy() {
        return new FailingProjection({ ...this.copyProps(), x: this.x, y: this.y,
          width: this.width, height: this.height })
      }
      override zeroShape() {
        return new FailingProjection({ ...this.getZeroConfig(), x: this.x, y: this.y,
          width: this.width, height: this.height })
      }
      override intermediateState(before: Rectangle, after: Rectangle, ratio: number, easing: EasingFunction) {
        if (before.x !== after.x) throw new Error("Native projection failed")
        return super.intermediateState(before, after, ratio, easing)
      }
    }
    const { stage } = createStage()
    const failing = (x: number) => new FailingProjection({ x, y: 20, width: 40, height: 30,
      strokeConfig: stroke, transition: { type: "linear" } })
    stage.tools.scene.appendStep(step("initial", 0, [
      child("a", [["body", shape(0)]]), child("b", [["body", failing(0)]]),
    ]), { signal: signal() })
    const a = timeline(stage, "a")
    const b = timeline(stage, "b")
    const aFrames = a.getSlice("body")
    const bFrames = b.getSlice("body")
    const before = a.shapeMap
    stage.tools.progress({ timeMs: 50, bound: { beforeMs: 0, afterMs: 100 } })
    const sampledBefore = a.shapeMap
    expect(() => stage.tools.scene.appendStep(step("fails", 100, [
      child("a", [["body", shape(100)]]), child("b", [["body", failing(100)]]),
    ]), { signal: signal() })).toThrow("Native projection failed")
    expect(a.getSlice("body")).toBe(aFrames)
    expect(b.getSlice("body")).toBe(bFrames)
    expect(aFrames).toHaveLength(2)
    expect(bFrames).toHaveLength(2)
    expect(a.shapeMap).toBe(sampledBefore)
    expect(a.totalDurationMs).toBe(0)
    expect(stage.tools.scene.revision).toBe("initial")
    stage.tools.scene.appendStep(step("succeeds", 100, [
      child("a", [["body", shape(200)]]), child("b", [["body", failing(0)]]),
    ]), { signal: signal() })
    expect(a.shapeMap.get("body")!.x).toBeCloseTo(100)
    expect(a.shapeMap).not.toBe(before)
    stage.destroy()
  })
  it("accepts steps without a display-frame wait and preserves the sampled fractional time", () => {
    const { stage, pendingFrames } = stageWithFrames()
    const scheduledBeforeAppend = pendingFrames()

    const first = stage.tools.scene.appendStep(
      step("step-0", 0, [child("value", [["body", shape(0)]])]),
      { signal: signal() },
    )
    expect(first).toEqual({
      revision: "step-0",
      resourceRevision: "resources-live",
      endTimeMs: 0,
    })
    expect(timeline(stage, "value").shapeMap.get("body")!.x).toBe(0)

    stage.tools.progress({ timeMs: 50 })
    const second = stage.tools.scene.appendStep(
      step("step-1", 100, [child("value", [[
        "body",
        shape(100, { easing: "easeInQuad", durationMs: 1, delayMs: 99 }),
      ]])]),
      { signal: signal() },
    )
    expect(second.endTimeMs).toBe(100)
    expect(timeline(stage, "value").shapeMap.get("body")!.x).toBeCloseTo(25)

    const third = stage.tools.scene.appendStep(
      step("step-2", 100, [child("value", [["body", shape(200)]])]),
      { signal: signal() },
    )
    expect(third.endTimeMs).toBe(200)
    expect(timeline(stage, "value").shapeMap.get("body")!.x).toBeCloseTo(25)
    expect(pendingFrames()).toBe(scheduledBeforeAppend)

    stage.tools.progress({ timeMs: 125.5 })
    expect(timeline(stage, "value").shapeMap.get("body")!.x).toBeCloseTo(125.5)
    stage.destroy()
  })

  it("stores repeated endpoints once and folds their held time into the next change", () => {
    const { stage } = createStage()
    stage.tools.scene.appendStep(
      step("initial", 0, [child("value", [["body", shape(0)]])]),
      { signal: signal() },
    )
    const value = timeline(stage, "value")
    const initialLength = value.getSlice("body").length

    const heldOnce = stage.tools.scene.appendStep(
      step("held-1", 100, [child("value", [["body", shape(0)]])]),
      { signal: signal() },
    )
    const heldTwice = stage.tools.scene.appendStep(
      step("held-2", 100, [child("value", [["body", shape(0)]])]),
      { signal: signal() },
    )
    expect([heldOnce.endTimeMs, heldTwice.endTimeMs]).toEqual([100, 200])
    expect(value.getSlice("body")).toHaveLength(initialLength)

    stage.tools.scene.appendStep(
      step("changed", 100, [child("value", [[
        "body",
        shape(100, { durationMs: 3, delayMs: 7 }),
      ]])]),
      { signal: signal() },
    )
    const finalFrame = value.getSlice("body").at(-1)!
    expect(value.getSlice("body")).toHaveLength(initialLength + 1)
    expect(finalFrame.transition).toMatchObject({
      type: "linear",
      delayMs: 200,
      durationMs: 100,
    })
    expect(value.getSliceTotalDurationMs("body")).toBe(300)

    stage.tools.progress({ timeMs: 199.5 })
    expect(value.shapeMap.get("body")!.x).toBe(0)
    stage.tools.progress({ timeMs: 250.5 })
    expect(value.shapeMap.get("body")!.x).toBeCloseTo(50.5)
    stage.destroy()
  })

  it("reuses content-equal interaction metadata and projects a real metadata change", () => {
    const metadataEquals = (before: unknown, after: unknown) =>
      JSON.stringify(before) === JSON.stringify(after)
    const initialBinding = {
      visualId: "value",
      target: { kind: "value", displayId: "value", laneId: "parameters" },
    }
    const { stage } = createStage()
    stage.tools.scene.appendStep(
      step("metadata-0", 0, [child("value", [[
        "body",
        shape(20, { metadata: initialBinding, shapeStoreValueEquals: metadataEquals }),
      ]])]),
      { signal: signal() },
    )
    const value = timeline(stage, "value")
    const initialLength = value.getSlice("body").length

    stage.tools.scene.appendStep(
      step("metadata-equal", 40, [child("value", [[
        "body",
        shape(20, {
          metadata: {
            visualId: "value",
            target: { kind: "value", displayId: "value", laneId: "parameters" },
          },
          shapeStoreValueEquals: metadataEquals,
        }),
      ]])]),
      { signal: signal() },
    )
    expect(value.getSlice("body")).toHaveLength(initialLength)

    const changedBinding = {
      visualId: "value",
      target: { kind: "value", displayId: "value", laneId: "locals" },
    }
    stage.tools.scene.appendStep(
      step("metadata-changed", 80, [child("value", [[
        "body",
        shape(20, { metadata: changedBinding, shapeStoreValueEquals: metadataEquals }),
      ]])]),
      { signal: signal() },
    )
    expect(value.getSlice("body")).toHaveLength(initialLength + 1)

    stage.tools.progress({ timeMs: 40.5 })
    const projected = value.shapeMap.get("body")!
    expect(projected.shapeStore.get("metadata")).toEqual(changedBinding)
    stage.destroy()
  })

  it("uses native zero shapes when Children enter, leave, and reappear", () => {
    const { stage } = createStage()
    stage.tools.scene.appendStep(
      step("visible-a", 0, [child("a", [["body", shape(20)]])]),
      { signal: signal() },
    )
    stage.tools.scene.appendStep(
      step("visible-b", 100, [child("b", [["body", shape(100)]])]),
      { signal: signal() },
    )

    stage.tools.progress({ timeMs: 50 })
    expect(timeline(stage, "a").shapeMap.get("body")!.strokeConfig.color.a).toBeCloseTo(0.5)
    expect(timeline(stage, "b").shapeMap.get("body")!.strokeConfig.color.a).toBeCloseTo(0.5)
    stage.tools.progress({ timeMs: 100 })
    expect(timeline(stage, "a").shapeMap.has("body")).toBe(false)
    expect(timeline(stage, "b").shapeMap.get("body")!.x).toBe(100)

    stage.tools.scene.appendStep(
      step("a-returns", 100, [child("a", [["body", shape(60)]])]),
      { signal: signal() },
    )
    stage.tools.progress({ timeMs: 150 })
    const returning = timeline(stage, "a").shapeMap.get("body")!
    expect(returning.x).toBeCloseTo(40)
    expect(returning.strokeConfig.color.a).toBeCloseTo(0.5)
    expect(timeline(stage, "b").shapeMap.get("body")!.strokeConfig.color.a).toBeCloseTo(0.5)
    stage.tools.progress({ timeMs: 200 })
    expect(timeline(stage, "a").shapeMap.get("body")!.x).toBe(60)
    expect(timeline(stage, "b").shapeMap.has("body")).toBe(false)
    stage.destroy()
  })

  it("leaves every Child and the accepted endpoint unchanged on cancellation or a late invalid Child", () => {
    const { stage } = createStage()
    stage.tools.scene.appendStep(
      step("accepted", 0, [child("a", [["body", shape(0)]])]),
      { signal: signal() },
    )
    const accepted = timeline(stage, "a")
    const acceptedLength = accepted.getSlice("body").length
    const controller = new AbortController()
    controller.abort()

    expect(() => stage.tools.scene.appendStep(
      step("cancelled", 100, [child("a", [["body", shape(100)]])]),
      { signal: controller.signal },
    )).toThrow(/cancelled/)
    expect(() => stage.tools.scene.appendStep(
      step("invalid", 100, [
        child("a", [["body", shape(100)]]),
        child("late-invalid", [["body", shape(200, { layer: 9 })]]),
      ]),
      { signal: signal() },
    )).toThrow(/layer/)

    expect(stage.tools.scene.revision).toBe("accepted")
    expect(stage.tools.hasChild("late-invalid")).toBe(false)
    expect(accepted.getSlice("body")).toHaveLength(acceptedLength)
    expect(accepted.shapeMap.get("body")!.x).toBe(0)
    const next = stage.tools.scene.appendStep(
      step("next", 100, [child("a", [["body", shape(100)]])]),
      { signal: signal() },
    )
    expect(next.endTimeMs).toBe(100)

    stage.destroy()
    expect(() => stage.tools.scene.appendStep(
      step("after-destroy", 0, []),
      { signal: signal() },
    )).toThrow(/destroyed/)
  })

  it("keeps Child metadata static while allowing later steps to omit placement", () => {
    const { stage } = createStage()
    stage.tools.scene.appendStep(
      step("placed", 0, [child("a", [["body", shape(0)]], {
        placement: { type: "affine", x: 10, y: 20 },
      })]),
      { signal: signal() },
    )
    stage.tools.scene.appendStep(
      step("placement-omitted", 50, [child("a", [["body", shape(50)]])]),
      { signal: signal() },
    )

    expect(() => stage.tools.scene.appendStep(
      step("moved", 50, [child("a", [["body", shape(100)]], {
        placement: { type: "affine", x: 30, y: 20 },
      })]),
      { signal: signal() },
    )).toThrow(/static Child metadata/)
    expect(() => stage.tools.scene.appendStep(
      step("renamed", 50, [child("a", [["body", shape(100)]], {
        className: "renamed",
      })]),
      { signal: signal() },
    )).toThrow(/static Child metadata/)
    expect(stage.tools.scene.revision).toBe("placement-omitted")
    expect(timeline(stage, "a").placement).toMatchObject({
      type: "affine",
      matrix: { e: 10, f: 20 },
    })
    stage.destroy()
  })

  it("supersedes an unfinished replacement while the existing replacement API can reset the timeline", async () => {
    const { stage, nextFrame } = stageWithFrames()
    stage.tools.scene.appendStep(
      step("step-initial", 0, [child("a", [["body", shape(0)]])]),
      { signal: signal() },
    )

    const pending = stage.tools.scene.prepare(stage.tools.scene.beginUpdate(), {
      revision: "pending-replacement",
      resourceRevision: "resources-live",
      children: [{
        id: "a",
        className: "scene",
        slices: [{ name: "body", frames: [shape(500, { durationMs: 0, delayMs: 0 })] }],
      }],
    }, {
      transitionId: "shape",
      control: { kind: "timeline", durationMs: 0 },
      signal: signal(),
    })
    const appended = stage.tools.scene.appendStep(
      step("step-wins", 100, [child("a", [["body", shape(100)]])]),
      { signal: signal() },
    )
    expect(appended.endTimeMs).toBe(100)
    await expect(pending).rejects.toThrow(/stale/)

    const replacement: SceneSubmission = {
      revision: "replacement",
      resourceRevision: "resources-replacement",
      children: [{
        id: "a",
        className: "scene",
        slices: [{ name: "body", frames: [shape(200, { durationMs: 0, delayMs: 0 })] }],
      }],
    }
    const prepared = await stage.tools.scene.prepare(
      stage.tools.scene.beginUpdate(),
      replacement,
      {
        transitionId: "shape",
        control: { kind: "timeline", durationMs: 0 },
        signal: signal(),
      },
    )
    const commit = stage.tools.scene.commit(prepared)
    nextFrame()
    const replacementReceipt = await commit
    expect(replacementReceipt).toMatchObject({
      revision: "replacement",
      resourceRevision: "resources-replacement",
    })
    expect(replacementReceipt.acceptedAtFrame).toEqual(expect.any(Number))

    const afterReplacement = stage.tools.scene.appendStep(
      step(
        "after-replacement",
        50,
        [child("a", [["body", shape(300)]])],
        "resources-replacement",
      ),
      { signal: signal() },
    )
    expect(afterReplacement.endTimeMs).toBe(50)
    stage.tools.progress({ timeMs: 25 })
    expect(timeline(stage, "a").shapeMap.get("body")!.x).toBeCloseTo(250)
    stage.destroy()
  })
})

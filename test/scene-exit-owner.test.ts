// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  Rectangle, StayAnimatedChild, SceneTransitionShape, wrapSceneShape,
  setSceneExitOwner, sceneExitOwner,
  type AnimatedShape, type SceneStepChild, type SceneStepSubmission,
} from "react-stay-canvas"
import { createStage } from "./helpers/stage"

const signal = () => new AbortController().signal
const ref = { childId: "owner", shapeName: "surface" }
function transparent(shape: Rectangle) {
  shape.fillConfig.color = { ...shape.fillConfig.color, a: 0 }
  return shape
}
function rect(x: number, width = 20, easing: "linear" | "easeInQuad" = "linear") {
  return new Rectangle({ x, y: 0, width, height: width,
    fillConfig: { color: { r: 255, g: 0, b: 0, a: 1 } },
    transition: { type: easing, durationMs: 0, delayMs: 0 } })
}
const child = (id: string, shapes: [string, AnimatedShape][]): SceneStepChild =>
  ({ id, className: "scene", shapes: new Map(shapes) })
const step = (children: SceneStepChild[], durationMs = 100): SceneStepSubmission =>
  ({ revision: "scene", resourceRevision: "resources", children, durationMs })
function fixture(children: SceneStepChild[]) {
  const frames: FrameRequestCallback[] = []
  const { stage } = createStage({ raf: (cb) => { frames.push(cb); return frames.length } })
  stage.tools.scene.appendStep(step(children, 0), { signal: signal() })
  return {
    stage,
    next(now = 0) { frames.shift()!(now) },
    shape(id: string, name = "body") {
      return (stage.tools.getChildById(id) as StayAnimatedChild).shapeMap.get(name)!
    },
    async accept(children: SceneStepChild[]) {
      const prepared = await stage.tools.scene.prepareTransition(stage.tools.scene.beginUpdate(), step(children), { signal: signal() })
      const committed = stage.tools.scene.commit(prepared)
      frames.shift()!(0)
      await committed
    },
  }
}
afterEach(() => vi.restoreAllMocks())

describe("scene exit ownership through public scene entrypoints", () => {
  it("uses the current transparent owner geometry and keeps it through pause and redirect", async () => {
    const f = fixture([child("owner", [["surface", transparent(rect(0, 100))]]), child("item", [["body", setSceneExitOwner(rect(20), ref)]])])
    await f.accept([child("owner", [["surface", transparent(rect(200, 50))]]), child("item", [["body", setSceneExitOwner(rect(210, 10), ref)]])])
    f.stage.tools.progress({ timeMs: 50 })
    expect(f.shape("item").getBound().x).toBeCloseTo(115)
    f.stage.tools.scene.settleTransition()
    await f.accept([child("owner", [["surface", transparent(rect(300, 25))]])])
    f.stage.tools.progress({ timeMs: 50 })
    expect(f.shape("item").getBound().x).toBeCloseTo(210)
    f.stage.tools.scene.settleTransition()
    await f.accept([child("owner", [["surface", transparent(rect(400, 25))]])])
    expect(f.shape("item").getBound().x).toBeCloseTo(210)
    f.stage.tools.progress({ timeMs: 50 })
    expect(f.shape("item").getBound().x).toBeCloseTo(307.5)
    f.stage.tools.progress({ timeMs: 100 })
    f.stage.tools.scene.settleTransition()
    expect(f.stage.tools.hasChild("item")).toBe(false)
    expect((f.stage.tools.getChildById("owner") as StayAnimatedChild).shapeMap.size).toBe(0)
    f.stage.destroy()
  })

  it("retargets a nested transparent owner exit to the surviving ancestor before another interruption", async () => {
    const f = fixture([
      child("owner", [["surface", transparent(rect(0, 100))]]),
      child("inner", [["surface", setSceneExitOwner(transparent(rect(10, 60)), ref)]]),
      child("item", [["body", setSceneExitOwner(rect(20), { childId: "inner", shapeName: "surface" })]]),
    ])
    await f.accept([child("owner", [["surface", transparent(rect(200, 50))]])])
    f.stage.tools.progress({ timeMs: 50 })
    expect(f.shape("item").getBound().x).toBeCloseTo(115)
    expect(sceneExitOwner(f.shape("item"))).toEqual(ref)
    f.stage.tools.scene.settleTransition()
    await f.accept([child("owner", [["surface", transparent(rect(300, 25))]])])
    f.stage.tools.progress({ timeMs: 50 })
    expect(f.shape("item").getBound().x).toBeCloseTo(210)
    f.stage.destroy()
  })

  it.each(["append", "sample"])("preserves transparent owner surfaces through %s and subsequent controlled exit", async (path) => {
    const initial = step([child("owner", [["surface", transparent(rect(0, 100))]]), child("item", [["body", setSceneExitOwner(rect(20), ref)]])], 0)
    const target = step([child("owner", [["surface", transparent(rect(200, 50))]])])
    const f = fixture(path === "append" ? [...initial.children] : [])
    if (path === "append") {
      f.stage.tools.scene.appendStep(target, { signal: signal() })
      f.stage.tools.progress({ timeMs: 50 })
      expect(f.shape("item").getBound().x).toBeCloseTo(115)
    } else {
      async function* steps() { yield initial; yield target }
      const prepared = await f.stage.tools.scene.prepare(f.stage.tools.scene.beginUpdate(), {
        revision: "transparent-offline", resourceRevision: "resources", steps: steps(),
      }, { transitionId: "shape", control: { kind: "timeline", durationMs: 0 }, signal: signal() })
      const sample = f.stage.tools.scene.sample(prepared, 50)
      const sampledOwner = sample.find(({ id }) => id === "owner")!.shapes.get("surface")!
      expect(sampledOwner.getBound().x).toBeCloseTo(100)
      expect(sampledOwner.getBound().width).toBeCloseTo(75)
      expect(sampledOwner.shouldFill()).toBe(false)
      const sampledItem = sample.find(({ id }) => id === "item")!.shapes.get("body")!
      expect(sampledItem.getBound().x).toBeCloseTo(115)
      f.stage.tools.scene.discard(prepared)
      await f.accept([...sample])
      f.stage.tools.progress({ timeMs: 100 })
      f.stage.tools.scene.settleTransition()
    }
    await f.accept([child("owner", [["surface", transparent(rect(300, 25))]])])
    f.stage.tools.progress({ timeMs: 50 })
    expect(f.shape("item").getBound().x).toBeCloseTo(210)
    f.stage.destroy()
  })

  it("retains only referenced transparent handoff geometry and redirects from its displayed position", async () => {
    const f = fixture([
      child("owner", [["surface", transparent(rect(0, 100))], ["unrelated", transparent(rect(500, 100))]]),
      child("inner", [["surface", setSceneExitOwner(transparent(rect(10, 60)), ref)]]),
      child("item", [["body", setSceneExitOwner(rect(20), { childId: "inner", shapeName: "surface" })]]),
    ])
    const prepared = await f.stage.tools.scene.prepare(f.stage.tools.scene.beginUpdate(), {
      revision: "transparent-handoff", resourceRevision: "resources", children: [{
        id: "owner", className: "scene", slices: [{ name: "surface", frames: [transparent(rect(200, 50))] }],
      }],
    }, { transitionId: "shape", control: { kind: "timeline", durationMs: 100 }, signal: signal() })
    const committed = f.stage.tools.scene.commit(prepared)
    f.next(0)
    await committed
    f.next(50)
    await f.accept([child("owner", [["surface", transparent(rect(300, 25))]])])
    expect(f.shape("item").getBound().x).toBeCloseTo(115)
    f.stage.tools.progress({ timeMs: 50 })
    expect(f.shape("item").getBound().x).toBeCloseTo(210)
    expect((f.stage.tools.getChildById("owner") as StayAnimatedChild).shapeFramesMap.has("unrelated")).toBe(false)
    f.stage.destroy()
  })

  it.each(["morph", "crossfade"] as const)("moves a removed Child with its owner using %s", async (mode) => {
    const source = setSceneExitOwner(wrapSceneShape(rect(20), mode), ref)
    const f = fixture([child("owner", [["surface", wrapSceneShape(rect(0, 100), mode)]]), child("item", [["body", source]])])
    await f.accept([child("owner", [["surface", wrapSceneShape(rect(200, 50), mode)]])])
    f.stage.tools.progress({ timeMs: 50 })
    const visible = f.shape("item") as SceneTransitionShape
    expect(visible.components[0].shape.getBound().x).toBeCloseTo(115)
    expect(visible.components[0].shape.getBound().width).toBeCloseTo(15)
    expect(visible.components[0].shape.fillConfig.color.a * visible.components[0].opacity).toBeCloseTo(0.5)
    expect(sceneExitOwner(visible)).toEqual(ref)
    f.stage.tools.progress({ timeMs: 100 })
    f.stage.tools.scene.settleTransition()
    expect(f.stage.tools.hasChild("item")).toBe(false)
    f.stage.destroy()
  })

  it("fits a removed slice in the same Child and uses the owner easing", async () => {
    const f = fixture([child("owner", [["surface", rect(0, 100)], ["body", setSceneExitOwner(rect(20), ref)]])])
    await f.accept([child("owner", [["surface", rect(200, 50, "easeInQuad")]])])
    f.stage.tools.progress({ timeMs: 50 })
    expect(f.shape("owner").getBound().x).toBeCloseTo(67.5)
    f.stage.tools.progress({ timeMs: 100 })
    f.stage.tools.scene.settleTransition()
    expect((f.stage.tools.getChildById("owner") as StayAnimatedChild).shapeMap.has("body")).toBe(false)
    f.stage.destroy()
  })

  it("moves every interrupted crossfade component while retained crossfades stay native", async () => {
    const source = setSceneExitOwner(wrapSceneShape(rect(20), "crossfade"), ref)
    const f = fixture([child("owner", [["surface", rect(0, 100)]]), child("item", [["body", source]])])
    await f.accept([child("owner", [["surface", rect(0, 100)]]), child("item", [["body", setSceneExitOwner(wrapSceneShape(rect(40), "crossfade"), ref)]])])
    f.stage.tools.progress({ timeMs: 40 })
    const mixed = f.shape("item") as SceneTransitionShape
    expect(mixed.components.map(({ shape }) => shape.getBound().x)).toEqual([20, 40])
    expect(mixed.components[0].opacity).toBeCloseTo(0.6)
    expect(mixed.components[1].opacity).toBeCloseTo(0.4)
    f.stage.tools.scene.settleTransition()
    await f.accept([child("owner", [["surface", rect(200, 50)]])])
    f.stage.tools.progress({ timeMs: 50 })
    const exiting = f.shape("item") as SceneTransitionShape
    expect(exiting.components[0].shape.getBound().x).toBeCloseTo(115)
    expect(exiting.components[1].shape.getBound().x).toBeCloseTo(130)
    expect(exiting.components[0].opacity).toBeCloseTo(0.6)
    expect(exiting.components[1].opacity).toBeCloseTo(0.4)
    for (const { shape } of exiting.components) expect(shape.fillConfig.color.a).toBeCloseTo(0.5)
    f.stage.destroy()
  })

  it("keeps ownership per step when offline sampling earlier geometry", async () => {
    const ownerB = { childId: "other", shapeName: "surface" }
    const first = step([child("owner", [["surface", rect(0, 100)]]), child("other", [["surface", rect(500, 100)]]), child("item", [["body", setSceneExitOwner(rect(20), ref)]])], 0)
    const second = step([child("owner", [["surface", rect(200, 50)]]), child("other", [["surface", rect(500, 100)]]), child("item", [["body", setSceneExitOwner(rect(520), ownerB)]])])
    const third = step([child("owner", [["surface", rect(200, 50)]]), child("other", [["surface", rect(700, 50)]])])
    const f = fixture([])
    async function* steps() { yield first; yield second; yield third }
    const prepared = await f.stage.tools.scene.prepare(f.stage.tools.scene.beginUpdate(), {
      revision: "offline", resourceRevision: "resources", steps: steps(),
    }, { transitionId: "shape", control: { kind: "timeline", durationMs: 0 }, signal: signal() })
    const initial = f.stage.tools.scene.sample(prepared, 0).find(({ id }) => id === "item")!.shapes.get("body")!
    expect(sceneExitOwner(initial)).toEqual(ref)
    const exit = f.stage.tools.scene.sample(prepared, 150).find(({ id }) => id === "item")!.shapes.get("body")!
    expect(sceneExitOwner(exit)).toEqual(ownerB)
    expect(exit.getBound().x).toBeCloseTo(615)
    f.stage.tools.scene.discard(prepared)
    f.stage.destroy()
  })

  it("follows a surviving ancestor once and resumes from the interrupted displayed pose", async () => {
    const f = fixture([
      child("owner", [["surface", rect(0, 100)]]),
      child("inner", [["surface", setSceneExitOwner(rect(10, 60), ref)]]),
      child("item", [["body", setSceneExitOwner(rect(20), { childId: "inner", shapeName: "surface" })]]),
    ])
    await f.accept([child("owner", [["surface", rect(200, 50)]])])
    f.stage.tools.progress({ timeMs: 50 })
    expect(f.shape("item").getBound().x).toBeCloseTo(115)
    f.stage.tools.scene.settleTransition()
    await f.accept([child("owner", [["surface", rect(300, 25)]])])
    expect(f.shape("item").getBound().x).toBeCloseTo(115)
    f.stage.tools.progress({ timeMs: 50 })
    expect(f.shape("item").getBound().x).toBeGreaterThan(115)
    f.stage.destroy()
  })

  it.each(["append", "sample"])("uses the same exit fit for %s steps", async (path) => {
    const initial = step([child("owner", [["surface", rect(0, 100)]]), child("item", [["body", setSceneExitOwner(wrapSceneShape(rect(20), "crossfade"), ref)]])], 0)
    const target = step([child("owner", [["surface", rect(200, 50)]])])
    const f = fixture(path === "append" ? [...initial.children] : [])
    let actual: AnimatedShape
    if (path === "append") {
      f.stage.tools.scene.appendStep(target, { signal: signal() })
      f.stage.tools.progress({ timeMs: 50 })
      actual = f.shape("item")
    } else {
      async function* steps() { yield initial; yield target }
      const prepared = await f.stage.tools.scene.prepare(f.stage.tools.scene.beginUpdate(), {
        revision: "offline", resourceRevision: "resources", steps: steps(),
      }, { transitionId: "shape", control: { kind: "timeline", durationMs: 0 }, signal: signal() })
      actual = f.stage.tools.scene.sample(prepared, 50).find(({ id }) => id === "item")!.shapes.get("body")!
      f.stage.tools.scene.discard(prepared)
    }
    expect((actual as SceneTransitionShape).components[0].shape.getBound().x).toBeCloseTo(115)
    f.stage.destroy()
  })

  it("fits visible exits during a full scene handoff", async () => {
    const owner = (x: number, width: number) => {
      const shape = rect(x, width)
      shape.fillConfig.color = { r: 0, g: 0, b: 255, a: 1 }
      return shape
    }
    const f = fixture([child("owner", [["surface", owner(0, 100)]]), child("item", [["body", setSceneExitOwner(wrapSceneShape(rect(20), "crossfade"), ref)]])])
    const prepared = await f.stage.tools.scene.prepare(f.stage.tools.scene.beginUpdate(), {
      revision: "replacement", resourceRevision: "resources", children: [{
        id: "owner", className: "scene", slices: [{ name: "surface", frames: [owner(200, 50)] }],
      }],
    }, { transitionId: "shape", control: { kind: "timeline", durationMs: 100 }, signal: signal() })
    const committed = f.stage.tools.scene.commit(prepared)
    f.next(0)
    await committed
    f.next(50)
    // Exiting handoff children are rendered outside the active scene store.
    const pixel = f.stage.root.contexts[0]!.getImageData(117, 2, 1, 1).data
    expect(pixel[0]).toBeGreaterThan(0)
    expect(f.stage.root.contexts[0]!.getImageData(22, 2, 1, 1).data[3]).toBe(0)
    f.stage.destroy()
  })

  it("keeps undeclared content and an entirely exiting owner chain on the existing fade path", async () => {
    const f = fixture([child("owner", [["surface", rect(0, 100)]]), child("item", [["body", setSceneExitOwner(rect(20), ref)]]), child("plain", [["body", rect(300)]])])
    await f.accept([])
    f.stage.tools.progress({ timeMs: 50 })
    expect(f.shape("item").getBound().x).toBe(20)
    expect(f.shape("plain").getBound().x).toBe(300)
    f.stage.destroy()
  })
})

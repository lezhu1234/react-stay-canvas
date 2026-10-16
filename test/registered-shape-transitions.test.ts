// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import {
  AnimatedShape, Rectangle, SceneTransitionShape, StayAnimatedChild, StayText, ViewportBackground,
  createShapeTransitionRegistry, defaultShapeTransitionRegistry, fitRect,
  wrapSceneShape, wrapSceneSubmission,
  type EasingFunction, type SceneStepChild, type SceneTransitionMode, type ShapeTransitionModule,
} from "react-stay-canvas"
import { createStage } from "./helpers/stage"

const red = { r: 200, g: 0, b: 0, a: 1 }
const blue = { r: 0, g: 0, b: 200, a: 1 }

beforeAll(() => {
  vi.stubGlobal("OffscreenCanvas", class {
    getContext() {
      return {
        font: "",
        measureText(text: string) {
          return { width: text.length * 8, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 }
        },
      }
    }
  })
})
afterEach(() => vi.restoreAllMocks())

function rectangle(x: number, durationMs = 0) {
  return new Rectangle({ x, y: 20, width: 40, height: 30, fillConfig: { color: red },
    transition: { type: "linear", durationMs, delayMs: 0 } })
}

function sample(before: SceneTransitionShape, after: SceneTransitionShape, ratio = 0.5) {
  return after.intermediateState(before, after, ratio, "linear")
}

function timeline(before: SceneTransitionShape, after: SceneTransitionShape) {
  const { stage } = createStage({ layers: 1 })
  const child = stage.tools.createChild<SceneTransitionShape>({ id: "value", className: "value" })
  child.appendKeyFrames(new Map([["body", [before, after]]]), false)
  return { stage, child }
}

function text(text: string, x: number, color = red) {
  return new StayText({ text, x, y: 40, fillConfig: { color },
    font: { fontFamily: "monospace", size: 20, fontWeight: 400 },
    transition: { type: "linear", durationMs: x === 0 ? 0 : 100, delayMs: 0 } })
}

function instrumentRegistry() {
  const samples = defaultShapeTransitionRegistry.modules.map((module) => vi.fn(module.sample))
  const registry = createShapeTransitionRegistry(defaultShapeTransitionRegistry.modules.map((module, index) => ({
    ...module, sample: samples[index],
  })))
  return { registry, samples }
}

describe("registered native shape transitions", () => {
  it.each(["morph", "crossfade"] as const)("adopts %s geometry and preserves wrapper metadata on copy and zero", (mode) => {
    const native = rectangle(10)
    const equals = (before: unknown, after: unknown) => before === after
    native.shapeStoreValueEquals = equals
    native.layer = 1
    native.zIndex = 8
    native.shapeStore.set("native", "native-only")
    const copy = vi.spyOn(native, "copy")
    const wrapped = wrapSceneShape(native, mode)
    expect(copy).not.toHaveBeenCalled()
    expect(wrapped.components[0].shape).toBe(native)
    expect(wrapped.shapeStore.size).toBe(0)
    const binding = { id: "value" }
    wrapped.shapeStore.set("binding", binding)
    const copied = wrapped.copy()
    const zero = wrapped.zeroShape()
    for (const shape of [copied, zero]) {
      expect(shape.constructor).toBe(wrapped.constructor)
      expect(shape.shapeStoreValueEquals).toBe(equals)
      expect(shape.shapeStore.get("binding")).toBe(binding)
      expect(shape.shapeStore).not.toBe(wrapped.shapeStore)
      expect(shape.layer).toBe(1)
      expect(shape.zIndex).toBe(8)
      expect(shape.transition).toEqual(wrapped.transition)
      expect(shape.transition).not.toBe(wrapped.transition)
    }
    wrapped.move(100, 100)
    expect(copied.getBound()).toEqual({ x: 10, y: 20, width: 40, height: 30 })
    expect(zero.shouldFill()).toBe(false)
    expect(zero.contains({ x: 115, y: 125 })).toBe(false)
    expect(copied.sameAs(copied.copy())).toBe(true)
  })

  it("wraps scene submissions without changing identities, placement or ownership", () => {
    const native = rectangle(0)
    const placement = { type: "affine", matrix: { a: 1, b: 0, c: 0, d: 1, e: 40, f: 0 } } as const
    const supplied = { revision: "scene", resourceRevision: "resources", children: [{
      id: "value", className: "value", placement,
      slices: [{ name: "body", frames: [native], prependZeroShape: false }],
    }] }
    const wrapped = wrapSceneSubmission(supplied, "morph")
    expect(wrapped).toMatchObject({ revision: "scene", resourceRevision: "resources" })
    expect(wrapped.children[0].placement).toBe(placement)
    expect(wrapped.children[0].slices[0].prependZeroShape).toBe(false)
    expect((wrapped.children[0].slices[0].frames[0] as SceneTransitionShape).components[0].shape).toBe(native)
    expect(supplied.children[0].slices[0].frames[0]).toBe(native)
  })

  it("delegates custom native sampling without requiring a known-shape list", () => {
    class CustomRectangle extends Rectangle {
      override copy() { return new CustomRectangle({ x: this.x, y: this.y, width: this.width, height: this.height, ...this.copyProps() }) }
      override intermediateState(before: Rectangle, after: Rectangle, ratio: number, easing: EasingFunction) {
        const native = super.intermediateState(before, after, ratio, easing)
        return new CustomRectangle({ x: native.x + 7, y: native.y, width: native.width, height: native.height, ...native.copyProps() })
      }
    }
    const start = new CustomRectangle({ x: 0, y: 20, width: 40, height: 30, fillConfig: { color: red }, transition: { durationMs: 0 } })
    const target = new CustomRectangle({ x: 100, y: 20, width: 40, height: 30, fillConfig: { color: blue }, transition: { durationMs: 100, type: "linear" } })
    const call = vi.spyOn(CustomRectangle.prototype, "intermediateState")
    const before = wrapSceneShape(start, "morph")
    const after = wrapSceneShape(target, "morph")
    const { stage, child } = timeline(before, after)
    expect(before.constructor).toBe(after.constructor)
    expect(before.constructor).not.toBe(wrapSceneShape(rectangle(0), "morph").constructor)
    child.setCurrentTime({ time: 50 })
    const current = child.shapeMap.get("body")!
    expect(call.mock.calls[0][0]).toBe(start)
    expect(call.mock.calls[0][1]).toBe(target)
    expect(call.mock.calls[0][2]).toBeCloseTo(0.5)
    expect(call.mock.calls[0][3]).toBe("linear")
    expect(current.components[0].shape).toBeInstanceOf(CustomRectangle)
    expect(current.getBound().x).toBeCloseTo(57)
    expect(current.components[0].shape.fillConfig.color.r).toBeCloseTo(100)
    expect(current.components[0].shape.fillConfig.color.b).toBeCloseTo(100)
    child.setCurrentTime({ time: 0 })
    expect(child.shapeMap.get("body")).toBe(before)
    child.setCurrentTime({ time: 100 })
    expect(child.shapeMap.get("body")).toBe(after)
    stage.destroy()
  })

  it("matches additive modules in registration order and fails an unmatched pair explicitly", () => {
    const override: ShapeTransitionModule = { id: "hold", contractVersion: 1,
      matches: ({ after }) => after.mode === "hold", sample: vi.fn(({ before }) => before.components) }
    const mutableDescriptor = { ...override }
    const registrations = [mutableDescriptor, ...defaultShapeTransitionRegistry.modules]
    const registry = createShapeTransitionRegistry(registrations)
    registrations.length = 0
    const before = wrapSceneShape(rectangle(0), "hold", registry)
    const after = wrapSceneShape(rectangle(100), "hold", registry)
    expect(sample(before, after).getBound().x).toBe(0)
    expect(override.sample).toHaveBeenCalledOnce()
    expect(Object.isFrozen(registry.modules)).toBe(true)
    expect(Object.isFrozen(registry.modules[0])).toBe(true)
    expect(() => createShapeTransitionRegistry([override, override])).toThrow("Duplicate shape transition module id")
    mutableDescriptor.sample = () => []
    expect(sample(before, after).getBound().x).toBe(0)
    const unmatched = wrapSceneShape(rectangle(100), "morph", createShapeTransitionRegistry([]))
    expect(() => sample(before, unmatched)).toThrow("No registered shape transition module")
    expect(() => sample(before, wrapSceneShape(rectangle(0), "unregistered"))).toThrow("No registered shape transition module")
  })

  it("preserves every visible crossfade component through repeated interruption and later morph", () => {
    let visible = wrapSceneShape(rectangle(0), "crossfade")
    for (let index = 1; index <= 40; index++) {
      visible = sample(visible.copy(), wrapSceneShape(rectangle(index * 100), "crossfade"), 0.1)
    }
    expect(visible.components).toHaveLength(41)
    expect(visible.components.every(({ opacity }) => opacity > 0)).toBe(true)
    expect(visible.components.reduce((sum, { opacity }) => sum + opacity, 0)).toBeCloseTo(1)
    expect(visible.contains({ x: 10, y: 30 })).toBe(true)
    expect(visible.getBound()).toEqual({ x: 0, y: 20, width: 4040, height: 30 })
    const target = wrapSceneShape(rectangle(5000), "morph")
    const morphed = sample(visible, target)
    expect(morphed.components).toHaveLength(41)
    expect(morphed.components[0].shape.getBound().x).toBe(2500)
    expect(morphed.components.reduce((sum, { opacity }) => sum + opacity, 0)).toBeCloseTo(1)
    expect(sample(visible, target, 0).sameAs(visible)).toBe(true)
    expect(sample(visible, target, 1).sameAs(target)).toBe(true)
  })

  it("uses only ordinary morph for text color, position and size changes", () => {
    const { registry, samples } = instrumentRegistry()
    const before = wrapSceneShape(text("same", 0), "morph", registry)
    const native = text("same", 100, blue).update({ font: { size: 40 } })
    const after = wrapSceneShape(native, "morph", registry)
    const current = sample(before, after)
    expect(samples[0]).not.toHaveBeenCalled()
    expect(samples[1]).not.toHaveBeenCalled()
    expect(samples[2]).toHaveBeenCalledOnce()
    expect(current.components).toHaveLength(1)
    expect(current.components[0].shape).toMatchObject({ x: 50, font: { size: 30 }, fillConfig: { color: { r: 100, b: 100 } } })
  })

  it.each(["text", "fontFamily", "fontWeight", "italic", "textAlign", "textBaseline"] as const)(
    "crossfades discrete text %s while moving and sampling paint continuously", (property) => {
      const old = text("old", 0)
      const target = text("old", 100, blue).update({ font: { size: 40 } })
      if (property === "text") target.update({ text: "new" })
      if (property === "fontFamily") target.update({ font: { fontFamily: "serif" } })
      if (property === "fontWeight") target.update({ font: { fontWeight: 800 } })
      if (property === "italic") target.update({ font: { italic: true } })
      if (property === "textAlign") target.update({ textAlign: "center" })
      if (property === "textBaseline") target.update({ textBaseline: "middle" })
      const { registry, samples } = instrumentRegistry()
      const before = wrapSceneShape(old, "morph", registry)
      const after = wrapSceneShape(target, "morph", registry)
      const current = sample(before, after, 0.25)
      expect(samples[1]).toHaveBeenCalledOnce()
      expect(samples[2]).not.toHaveBeenCalled()
      expect(current.components.map(({ opacity }) => opacity)).toEqual([0.75, 0.25])
      const glyphs = current.components.map(({ shape }) => shape as StayText)
      for (const glyph of glyphs) {
        expect(glyph.x).toBe(25)
        expect(glyph.font.size).toBe(25)
        expect(glyph.fillConfig.color).toEqual({ r: 150, g: 0, b: 50, a: 1 })
      }
      expect(glyphs[0].text).toBe(old.text)
      expect(glyphs[0].font).toMatchObject({ ...old.font, size: 25 })
      expect(glyphs[0].textAlign).toBe(old.textAlign)
      expect(glyphs[1].text).toBe(target.text)
      expect(glyphs[1].font).toMatchObject({ ...target.font, size: 25 })
      expect(glyphs[1].textAlign).toBe(target.textAlign)
      const canvas = document.createElement("canvas")
      const context = canvas.getContext("2d")!
      const draws: Array<{ text: string; alpha: number; x: number; font: string }> = []
      vi.spyOn(context, "fillText").mockImplementation((value, x) => { draws.push({ text: value, alpha: context.globalAlpha, x, font: context.font }) })
      current.draw({ context, now: 0, width: 300, height: 100, forchDraw: true })
      expect(draws.map(({ text }) => text)).toEqual([old.text, target.text])
      expect(draws.map(({ alpha }) => alpha)).toEqual([0.75, 0.25])
      expect(draws.map(({ x }) => x)).toEqual([25, 25])
      expect(context.globalAlpha).toBe(1)
      expect(sample(before, after, 0).sameAs(before)).toBe(true)
      expect(sample(before, after, 1).sameAs(after)).toBe(true)
    })

  it("retargets a displayed glyph composition through the actual scene transaction", async () => {
    const frames: FrameRequestCallback[] = []
    const { stage } = createStage({ layers: 1, raf: (callback) => { frames.push(callback); return frames.length } })
    const signal = new AbortController().signal
    const child = (native: AnimatedShape): SceneStepChild => ({ id: "value", className: "value", shapes: new Map([["body", wrapSceneShape(native, "morph")]]) })
    const target = (native: AnimatedShape, durationMs = 100) => ({ revision: "value", resourceRevision: "resources", durationMs, children: [child(native)] })
    stage.tools.scene.appendStep(target(text("old", 0), 0), { signal })
    async function accept(native: AnimatedShape) {
      const prepared = await stage.tools.scene.prepareTransition(stage.tools.scene.beginUpdate(), target(native), { signal })
      const committed = stage.tools.scene.commit(prepared)
      frames.shift()!(performance.now())
      await committed
    }
    await accept(text("new", 100))
    stage.tools.progress({ timeMs: 50 })
    const first = (stage.tools.getChildById("value") as StayAnimatedChild<SceneTransitionShape>).shapeMap.get("body")!
    expect(first.components.map(({ shape }) => (shape as StayText).text)).toEqual(["old", "new"])
    await accept(text("final", 200))
    const live = stage.tools.getChildById("value") as StayAnimatedChild<SceneTransitionShape>
    expect(live.shapeMap.get("body")!.sameAs(first)).toBe(true)
    stage.tools.progress({ timeMs: 50 })
    const mid = live.shapeMap.get("body")!
    const visible = mid.components.filter(({ opacity }) => opacity > 0)
    expect(visible.map(({ shape }) => (shape as StayText).text)).toEqual(["old", "final", "new"])
    visible.forEach(({ shape, opacity }, index) => {
      expect((shape as StayText).x).toBeCloseTo(125)
      expect(opacity).toBeCloseTo(index === 1 ? 0.5 : 0.25)
    })
    stage.tools.scene.settleTransition()
    expect(live.shapeMap.get("body")).toBe(mid)
    await accept(text("final", 300))
    stage.tools.progress({ timeMs: 100 })
    stage.tools.scene.settleTransition()
    const settled = (stage.tools.getChildById("value") as StayAnimatedChild<SceneTransitionShape>).shapeMap.get("body")!
    expect(settled.components).toHaveLength(1)
    expect(settled.components[0].shape).toMatchObject({ text: "final", x: 300 })
    stage.destroy()
  })
})

describe("viewport background in the shared sampling and drawing flow", () => {
  it("morphs fill and preserves class/styles through copying, zeroing and native timeline sampling", () => {
    const before = wrapSceneShape(new ViewportBackground({ fillConfig: { color: red }, transition: { durationMs: 0 } }), "morph")
    const after = wrapSceneShape(new ViewportBackground({ fillConfig: { color: blue }, transition: { durationMs: 100, type: "linear" } }), "morph")
    const { stage, child } = timeline(before, after)
    child.setCurrentTime({ time: 50 })
    const current = child.shapeMap.get("body")!
    expect(current.components[0].shape).toBeInstanceOf(ViewportBackground)
    expect(current.components[0].shape.fillConfig.color.r).toBeCloseTo(100)
    expect(current.components[0].shape.fillConfig.color.b).toBeCloseTo(100)
    expect(current.getBound()).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    expect(child.getBound()).toEqual(current.getBound())
    expect(current.contains({ x: 0, y: 0 })).toBe(false)
    expect(current.zeroShape().components[0].shape).toBeInstanceOf(ViewportBackground)
    const copy = current.copy()
    expect(copy.components[0].shape).toBeInstanceOf(ViewportBackground)
    current.components[0].shape.update({ fillConfig: { color: red } })
    expect(copy.components[0].shape.fillConfig.color.r).toBeCloseTo(100)
    expect(copy.components[0].shape.fillConfig.color.b).toBeCloseTo(100)
    stage.destroy()
  })

  it("paints the actual resized surface under viewport/child transforms and restores the incoming transform", async () => {
    const { stage, layers } = createStage({ width: 200, height: 100, layers: 1 })
    const background = stage.tools.appendChild({ id: "background", className: "background", shape: wrapSceneShape(new ViewportBackground({ fillConfig: { color: red }, zIndex: -1 }), "morph"),
      placement: { type: "affine", matrix: { a: 3, b: 0, c: 0, d: 2, e: 80, f: 100 } } })
    stage.tools.viewport.restore({ x: -500, y: 600, scale: 4 })
    stage.resize(320, 180)
    stage.draw({ now: 0 })
    const context = layers[0].getContext("2d")!
    for (const [x, y] of [[0, 0], [319, 179], [120, 80]]) {
      expect([...context.getImageData(x, y, 1, 1).data]).toEqual([200, 0, 0, 255])
    }
    context.setTransform(2, 0, 0, 3, 17, 28)
    const initial = context.getTransform()
    background.shape.draw({ context, now: 0, width: 320, height: 180, forchDraw: true })
    expect(context.getTransform()).toEqual(initial)
    const content = stage.tools.appendChild({ id: "offscreen", className: "content", shape: rectangle(1000) })
    expect(background.getBound().width).toBe(0)
    expect(content.getBound()).toEqual({ x: 1000, y: 20, width: 40, height: 30 })
    expect(fitRect(content.getBound(), { x: 0, y: 0, width: 80, height: 60 }).scale).toBe(2)
    const capture = await stage.tools.regionToTargetCanvas({ area: { x: 900, y: 0, width: 200, height: 100 },
      targetSize: { width: 100, height: 100 }, children: [background, content] })
    const captured = capture.getContext("2d")!
    expect([...captured.getImageData(1, 26, 1, 1).data]).toEqual([200, 0, 0, 255])
    expect([...captured.getImageData(98, 73, 1, 1).data]).toEqual([200, 0, 0, 255])
    expect(captured.getImageData(1, 1, 1, 1).data[3]).toBe(0)
    stage.destroy()
  })

  it.each(["morph", "crossfade"] as SceneTransitionMode[])("captures a %s background at the requested time without changing the live state", async (mode) => {
    const { stage } = createStage({ width: 200, height: 100, layers: 1 })
    const child = stage.tools.createChild<SceneTransitionShape>({ id: "background", className: "background" })
    child.appendKeyFrames(new Map([["surface", [
      wrapSceneShape(new ViewportBackground({ fillConfig: { color: red }, transition: { durationMs: 0 } }), mode),
      wrapSceneShape(new ViewportBackground({ fillConfig: { color: { ...red, a: 0.5 } }, transition: { durationMs: 100, type: "linear" } }), mode),
    ]]]), false)
    child.setCurrentTime({ time: 0 })
    const live = child.shapeMap.get("surface")
    const capture = await stage.tools.regionToTargetCanvas({ area: { x: -300, y: 200, width: 200, height: 100 }, children: [child], progress: 50 })
    const pixel = [...capture.getContext("2d")!.getImageData(199, 99, 1, 1).data]
    if (mode === "morph") expect(pixel).toEqual([200, 0, 0, 191])
    else expect(pixel[3]).toBeGreaterThan(0)
    expect(child.shapeMap.get("surface")).toBe(live)
    stage.destroy()
  })
})

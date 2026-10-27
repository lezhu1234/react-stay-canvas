// @vitest-environment jsdom
import { loadImage } from "canvas"
import { resolve } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Rectangle, StayAnimatedChild, StayImage, type SceneStepSubmission, type SceneSubmission } from "react-stay-canvas"
import { createStage } from "./helpers/stage"
import { createTextMeasureContext } from "./helpers/textMetrics"
import { compileMotionScene, progressMotionProject } from "../example/src/examples/integrated/motion/runtime"
import { readMotionProject, seedMotionProject, type MotionProject } from "../example/src/examples/integrated/motion/model"

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function fixture() {
  let now = 0
  vi.spyOn(performance, "now").mockImplementation(() => now)
  const callbacks: FrameRequestCallback[] = []
  const { stage, layers } = createStage({ width: 840, height: 430, layers: 3,
    raf: cb => { callbacks.push(cb); return callbacks.length } })
  const frame = (clock: number) => {
    now = clock
    const callback = callbacks.shift()
    if (!callback) throw Error("No scheduled frame")
    callback(clock)
  }
  return {
    stage, layers, frame,
    async accept(target: SceneSubmission, clock: number, durationMs = 100) {
      now = clock
      const prepared = await stage.tools.scene.prepare(stage.tools.scene.beginUpdate(), target, {
        transitionId: "shape", control: { kind: "timeline", durationMs },
        signal: new AbortController().signal,
      })
      const committed = stage.tools.scene.commit(prepared)
      frame(clock)
      await committed
    },
    async acceptTransition(target: SceneStepSubmission, clock: number) {
      now = clock
      const prepared = await stage.tools.scene.prepareTransition(stage.tools.scene.beginUpdate(), target, {
        signal: new AbortController().signal,
      })
      const committed = stage.tools.scene.commit(prepared)
      frame(clock)
      await committed
    },
  }
}

describe("current scene projection lifetime", () => {
  it("reintroduces settled Motion Studio media at its new geometry through the real import path", async () => {
    vi.stubGlobal("OffscreenCanvas", class {
      constructor(public width: number, public height: number) {}
      getContext() { return createTextMeasureContext(56) }
    })
    const f = fixture()
    try {
      const image = await loadImage(resolve(process.cwd(), "../example/src/assets/annotation-traffic.jpg")) as unknown as HTMLImageElement
      const original = readMotionProject(seedMotionProject(en => en))
      const title = readMotionProject({ ...original, layers: original.layers.map(layer =>
        layer.id === "hero-card" ? { ...layer, kind: "title" } : layer) })
      const nextCard = readMotionProject({ ...original, layers: original.layers.map(layer =>
        layer.id === "hero-card" ? { ...layer, frames: layer.frames.map((frame, index) =>
          ({ ...frame, x: 400 + index * 20, y: 200, width: 260, height: 140 })) } : layer) })
      const child = () => f.stage.tools.getChildById("motion-layer-hero-card") as StayAnimatedChild<StayImage>
      const importAt = async (project: MotionProject, revision: string, clock: number) => {
        await f.accept(compileMotionScene(f.stage.tools, project, revision, image), clock, 180)
        progressMotionProject(f.stage.tools, project, project.workArea.startMs, "hero-card", true)
      }
      f.stage.tools.progress({ timeMs: 700 })
      await importAt(original, "initial-card", 1000)
      f.frame(1180)
      expect(child().shapeMap.get("media")!.x).toBeCloseTo(82)
      await importAt(title, "title", 2000)
      f.frame(2180)
      expect(child().hasSlice("media")).toBe(false)
      expect(child().currentShape("media") === undefined).toBe(true)
      progressMotionProject(f.stage.tools, title, 700, "hero-card", true)
      expect(child().currentShape("media") === undefined).toBe(true)

      await importAt(nextCard, "returned-card", 3000)
      const entering = child().currentShape("media")!
      expect([entering.x, entering.y, entering.width, entering.height, entering.opacity]).toEqual([410, 210, 240, 120, 0])
      const context = f.layers[1].getContext("2d")!
      const drawImage = vi.spyOn(context, "drawImage")
      f.frame(3090)
      const midpoint = child().shapeMap.get("media")!
      expect([midpoint.x, midpoint.y, midpoint.width, midpoint.height]).toEqual([410, 210, 240, 120])
      expect(midpoint.opacity).toBeCloseTo(0.16)
      expect(drawImage.mock.calls.some(args => args[0] === image && args[5] === 410 && args[6] === 210 && args[7] === 240 && args[8] === 120)).toBe(true)
      f.frame(3180)
      expect(child().shapeMap.get("media")!.opacity).toBeCloseTo(0.32)
    } finally { f.stage.destroy() }
  })

  it.each([
    { elapsed: 50, startX: 10, startAlpha: 0.5 },
    { elapsed: 100, startX: 200, startAlpha: 0 },
    { elapsed: 150, startX: 200, startAlpha: 0 },
  ].flatMap(test => ["handoff", "controlled"].map(path => ({ ...test, path }))))("uses only an active outgoing slice when reentering via $path after $elapsed ms", async ({ elapsed, startX, startAlpha, path }) => {
    const f = fixture()
    const rect = (x: number) => new Rectangle({ x, y: 10, width: 20, height: 20,
      fillConfig: { color: { r: 255, g: 0, b: 0, a: 1 } },
      transition: { type: "linear", durationMs: 0, delayMs: 0 } })
    const scene = (revision: string, detail?: number): SceneSubmission => ({
      revision, resourceRevision: "resources", children: [{ id: "item", className: "scene", slices: [
        { name: "body", frames: [rect(400)] },
        ...(detail === undefined ? [] : [{ name: "detail", frames: [rect(detail)] }]),
      ] }],
    })
    const child = () => f.stage.tools.getChildById("item") as StayAnimatedChild<Rectangle>
    try {
      await f.accept(scene("initial", 10), 0, 0)
      await f.accept(scene("removed"), 1000)
      f.frame(1000 + elapsed)
      expect(child().currentShape("detail") === undefined).toBe(elapsed >= 100)
      if (path === "handoff") await f.accept(scene("return", 200), 1000 + elapsed)
      else await f.acceptTransition({ revision: "return", resourceRevision: "resources", durationMs: 100,
        children: [{ id: "item", className: "scene", shapes: new Map([["body", rect(400)], ["detail", rect(200)]]) }],
      }, 1000 + elapsed)
      const start = child().currentShape("detail")!
      expect(start.x).toBeCloseTo(startX)
      expect(start.fillConfig.color.a).toBeCloseTo(startAlpha)
      if (path === "handoff") f.frame(1050 + elapsed)
      else f.stage.tools.progress({ timeMs: 50 })
      expect(child().shapeMap.get("detail")!.x).toBeCloseTo((startX + 200) / 2)
      expect(child().shapeMap.get("detail")!.fillConfig.color.a).toBeCloseTo((startAlpha + 1) / 2)
      expect(child().shapeMap.get("body")!.x).toBe(400)
      if (path === "handoff") f.frame(1100 + elapsed)
      else f.stage.tools.progress({ timeMs: 100 })
      expect(child().shapeMap.get("detail")!.x).toBe(200)
    } finally { f.stage.destroy() }
  })
})

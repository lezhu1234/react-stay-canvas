// @vitest-environment jsdom
import { loadImage } from "canvas"
import { resolve } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { Rectangle, StayImage, StayText } from "react-stay-canvas"

import { MotionCapsule } from "../example/src/examples/integrated/motion/capsule"

import {
  createMotionListeners,
  type MotionEngine,
} from "../example/src/examples/integrated/motion/interactions"
import {
  frameAtTime,
  moveMotionFrame,
  readMotionProject,
  removeMotionFrame,
  seedMotionProject,
  updateMotionFrame,
  upsertMotionFrame,
} from "../example/src/examples/integrated/motion/model"
import {
  layerBody,
  layerLabel,
  layerMedia,
  hitMotionLayer,
  motionGeometry,
  motionLayers,
  motionLayerId,
  progressMotionProject,
  renderMotionProject,
} from "../example/src/examples/integrated/motion/runtime"
import { createStage, md, mm, mu } from "./helpers/stage"
import { createTextMeasureContext } from "./helpers/textMetrics"

vi.stubGlobal("OffscreenCanvas", class {
  constructor(public width: number, public height: number) {}
  getContext() {
    return createTextMeasureContext(56)
  }
})

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const text = (en: string) => en

async function drag(target: HTMLCanvasElement, from: [number, number], to: [number, number]) {
  target.dispatchEvent(md(...from)); await tick()
  target.dispatchEvent(mm(...to)); await tick()
  target.dispatchEvent(mu(...to)); await tick()
}

async function click(target: HTMLCanvasElement, point: [number, number]) {
  target.dispatchEvent(md(...point)); await tick()
  target.dispatchEvent(mu(...point)); await tick()
}

function createMotionStage() {
  const { stage, top } = createStage({ width: 840, height: 430, layers: 3 })
  const project = seedMotionProject(text)
  const state: MotionEngine = {
    selectedLayerId: undefined,
    select: vi.fn((layerId?: string) => { state.selectedLayerId = layerId }),
    previewGeometry: vi.fn((layerId, geometry) => {
      const preview = upsertMotionFrame(project, layerId, 0, geometry)
      renderMotionProject(stage.tools, preview, 0, layerId)
    }),
    commitGeometry: vi.fn(),
    restore: vi.fn(() => renderMotionProject(stage.tools, project, 0, state.selectedLayerId)),
    say: vi.fn(),
  }
  renderMotionProject(stage.tools, project, 0)
  createMotionListeners(state).forEach((listener) => stage.addEventListener(listener))
  return { project, stage, state, top }
}

describe("integrated motion studio example", () => {
  it("compiles built-in and custom Shapes into independently timed slices", () => {
    const { stage } = createStage({ width: 840, height: 430, layers: 3 })
    const project = seedMotionProject(text)

    renderMotionProject(stage.tools, project, 725, "hero-card")

    const layers = motionLayers(stage.tools)
    expect(layers).toHaveLength(3)
    expect(layers.map((child) => [...child.shapeFramesMap.keys()])).toEqual([
      ["body", "label"],
      ["body", "label"],
      ["body", "label"],
    ])
    expect(layerBody(layers[0])).toBeInstanceOf(Rectangle)
    expect(layerBody(layers[1])).toBeInstanceOf(Rectangle)
    expect(layerBody(layers[2])).toBeInstanceOf(MotionCapsule)
    expect(layers.every((child) => layerLabel(child) instanceof StayText)).toBe(true)
    expect(layers[0].getSlice("label")[1].transition.durationMs)
      .toBeLessThan(layers[0].getSlice("body")[1].transition.durationMs)
    expect(layers[0].getSlice("label")[1].transition.delayMs)
      .toBeGreaterThan(layers[0].getSlice("body")[1].transition.delayMs)
    expect(layers.every((child) => child.totalDurationMs === project.durationMs)).toBe(true)
    expect(layerLabel(layers[0])?.getCenterPoint().x)
      .not.toBeCloseTo(layerBody(layers[0]).getCenterPoint().x)
    expect(stage.tools.getChildBySelector(".motion-selection")?.shapeMap).toHaveLength(9)

    progressMotionProject(stage.tools, project, project.workArea.startMs, "hero-card", true)
    const atWorkAreaStart = layerBody(layers[0]).x
    progressMotionProject(stage.tools, project, -200, "hero-card", true)
    expect(layerBody(layers[0]).x).toBe(atWorkAreaStart)
    progressMotionProject(stage.tools, project, 9000, "hero-card", true)
    expect(layerBody(layers[0]).x).toBeGreaterThan(72)
    progressMotionProject(stage.tools, project, 1450, "hero-card", true)
    expect(layerBody(layers[0]).x).toBe(304)
  })

  it("animates a loaded image slice from zero and removes every slice at the project exit", async () => {
    const { stage } = createStage({ width: 840, height: 430, layers: 3 })
    const project = seedMotionProject(text)
    const image = await loadImage(
      resolve(process.cwd(), "../example/src/assets/annotation-traffic.jpg"),
    ) as unknown as HTMLImageElement

    renderMotionProject(stage.tools, project, 270, "hero-card")
    const layersBeforeImageLoad = motionLayers(stage.tools)
    renderMotionProject(stage.tools, project, 270, "hero-card", false, image)

    const layersAfterImageLoad = motionLayers(stage.tools)
    expect(layersAfterImageLoad.every((child, index) => child === layersBeforeImageLoad[index])).toBe(true)
    const hero = layersAfterImageLoad[0]
    expect([...hero.shapeFramesMap.keys()]).toEqual(["body", "label", "media"])
    expect(layerMedia(hero)).toBeInstanceOf(StayImage)
    expect(layerMedia(hero)?.opacity).toBeGreaterThan(0)
    expect(layerMedia(hero)?.opacity).toBeLessThan(0.32)
    expect(hero.totalDurationMs).toBe(project.durationMs)

    progressMotionProject(stage.tools, project, project.durationMs, "hero-card")
    expect(motionLayers(stage.tools).every((child) => child.shapeMap.size === 0)).toBe(true)
    expect(motionGeometry(stage.tools, "hero-card")).toBeUndefined()

    const endpointProject = moveMotionFrame(project, "hero-card", "card-2", project.durationMs)
    renderMotionProject(stage.tools, endpointProject, endpointProject.durationMs, "hero-card", false, image)
    expect(motionLayers(stage.tools).every((child) => child.totalDurationMs === endpointProject.durationMs)).toBe(true)
    expect(motionLayers(stage.tools).every((child) => child.shapeMap.size === 0)).toBe(true)
  })

  it("drops a stale media slice when an imported layer changes kind", async () => {
    const { stage } = createStage({ width: 840, height: 430, layers: 3 })
    const project = seedMotionProject(text)
    const image = await loadImage(
      resolve(process.cwd(), "../example/src/assets/annotation-traffic.jpg"),
    ) as unknown as HTMLImageElement
    renderMotionProject(stage.tools, project, 270, "hero-card", false, image)
    const originalHero = motionLayers(stage.tools)[0]
    expect(originalHero.hasSlice("media")).toBe(true)

    const imported = {
      ...project,
      layers: project.layers.map((layer) => layer.id === "hero-card"
        ? { ...layer, kind: "title" as const }
        : layer),
    }
    renderMotionProject(stage.tools, imported, 270, "hero-card", false, image)

    const importedHero = motionLayers(stage.tools)[0]
    expect(importedHero).not.toBe(originalHero)
    expect(importedHero.hasSlice("media")).toBe(false)
  })

  it("uses the custom Shape contract for interpolation and exact generic hit testing", () => {
    const { stage } = createStage({ width: 840, height: 430, layers: 3 })
    const project = seedMotionProject(text)
    renderMotionProject(stage.tools, project, 0)

    const accent = motionLayers(stage.tools)[2]
    const capsule = layerBody(accent)
    expect(capsule).toBeInstanceOf(MotionCapsule)
    expect(motionLayerId(hitMotionLayer(stage.tools, capsule.getCenterPoint())!)).toBe("accent-bar")
    expect(hitMotionLayer(stage.tools, { x: capsule.x + 1, y: capsule.y + 1 })).toBeUndefined()

    progressMotionProject(stage.tools, project, 900)
    const interpolated = layerBody(accent)
    expect(interpolated).toBeInstanceOf(MotionCapsule)
    expect(interpolated.x).toBeGreaterThan(capsule.x)
  })

  it("recompiles edited slices without replacing animated Child identities", () => {
    const { stage } = createStage({ width: 840, height: 430, layers: 3 })
    const project = seedMotionProject(text)
    renderMotionProject(stage.tools, project, 1450, "hero-card")
    const originalLayers = motionLayers(stage.tools)
    const edited = updateMotionFrame(project, "hero-card", "card-1", { x: 400 })

    renderMotionProject(stage.tools, edited, 1450, "hero-card")

    const recompiledLayers = motionLayers(stage.tools)
    expect(recompiledLayers).toHaveLength(originalLayers.length)
    expect(recompiledLayers.every((child, index) => child === originalLayers[index])).toBe(true)
    expect(layerBody(recompiledLayers[0]).x).toBe(400)
    expect(layerLabel(recompiledLayers[0])?.getCenterPoint().x).toBeCloseTo(516)
  })

  it("rebuilds the runtime order when an imported project reorders layers", () => {
    const { stage } = createStage({ width: 840, height: 430, layers: 3 })
    const project = seedMotionProject(text)
    renderMotionProject(stage.tools, project, 0)
    const reordered = { ...project, layers: [...project.layers].reverse() }

    renderMotionProject(stage.tools, reordered, 0)

    expect(motionLayers(stage.tools).map(motionLayerId)).toEqual(
      reordered.layers.map(({ id }) => id),
    )
  })

  it("hits the frontmost painted layer when editable bodies overlap", () => {
    const { stage } = createStage({ width: 840, height: 430, layers: 3 })
    const project = updateMotionFrame(seedMotionProject(text), "accent-bar", "accent-0", {
      x: 72, y: 168, width: 184, height: 112,
    })
    renderMotionProject(stage.tools, project, 0)

    const target = stage.tools.getChildrenBySelector(".motion-layer")
      .filter((child) => child.containsPointer({ x: 100, y: 190 }))
    expect(target).toHaveLength(2)
    const hit = hitMotionLayer(stage.tools, { x: 100, y: 190 })!
    expect(motionLayerId(hit)).toBe("hero-card")
  })

  it("selects, moves, and resizes a layer through the real Canvas input pipeline", async () => {
    const { stage, state, top } = createMotionStage()

    await click(top, [100, 190])
    expect(state.selectedLayerId).toBe("hero-card")
    expect(stage.tools.getChildBySelector(".motion-selection")?.shapeMap).toHaveLength(9)

    await drag(top, [100, 190], [150, 220])
    expect(state.commitGeometry).toHaveBeenLastCalledWith("hero-card", {
      x: 122,
      y: 198,
      width: 184,
      height: 112,
    })

    top.dispatchEvent(mm(306, 310)); await tick()
    expect(top.style.cursor).toBe("nwse-resize")
    await drag(top, [306, 310], [336, 330])
    expect(state.commitGeometry).toHaveBeenLastCalledWith("hero-card", {
      x: 122,
      y: 198,
      width: 214,
      height: 132,
    })
  })

  it("routes interrupted transforms through the single restore exit", async () => {
    const { state, top } = createMotionStage()
    await click(top, [100, 190])
    top.dispatchEvent(md(100, 190)); await tick()
    top.dispatchEvent(mm(160, 230)); await tick()
    window.dispatchEvent(new Event("blur")); await tick()

    expect(state.restore).toHaveBeenCalledTimes(1)
    expect(state.commitGeometry).not.toHaveBeenCalled()
    expect(state.say).toHaveBeenCalledWith("Transform cancelled", "已取消变换")
  })

  it("keeps project edits serializable and protects timeline invariants", () => {
    const project = seedMotionProject(text)
    const added = upsertMotionFrame(project, "hero-card", 900, { x: 20, y: 30, width: 200, height: 120 })
    const addedFrame = frameAtTime(added, "hero-card", 900)!
    expect(addedFrame).toMatchObject({ id: "hero-card-900", x: 20, y: 30, width: 200, height: 120 })
    expect(project.layers[0].frames).toHaveLength(3)

    const occupiedMove = moveMotionFrame(added, "hero-card", addedFrame.id, 1450)
    expect(occupiedMove).toBe(added)
    const moved = moveMotionFrame(added, "hero-card", addedFrame.id, 1050)
    expect(frameAtTime(moved, "hero-card", 1050)?.id).toBe(addedFrame.id)
    const removed = removeMotionFrame(moved, "hero-card", addedFrame.id)
    expect(frameAtTime(removed, "hero-card", 1050)).toBeUndefined()
    expect(removeMotionFrame(project, "hero-card", "card-0")).toBe(project)

    expect(readMotionProject(JSON.parse(JSON.stringify(moved)))).toEqual(moved)
    expect(() => readMotionProject({ version: 1, durationMs: 4000, workArea: { startMs: 0, endMs: 1 }, layers: [] })).toThrow()
  })

  it("normalizes imported time values and generates collision-free frame ids", () => {
    const source = seedMotionProject(text)
    source.durationMs = 4000.4
    source.workArea = { startMs: 700.1, endMs: 3300.2 }
    source.layers[0].frames[1].timeMs = 1450.4
    source.layers[0].frames[2].id = "hero-card-900"
    const imported = readMotionProject(JSON.parse(JSON.stringify(source)))

    expect(imported.durationMs).toBe(4000)
    expect(imported.workArea).toEqual({ startMs: 700, endMs: 3300 })
    expect(imported.layers[0].frames[1].timeMs).toBe(1450)
    const added = upsertMotionFrame(imported, "hero-card", 900, { x: 10, y: 10, width: 100, height: 100 })
    const ids = added.layers[0].frames.map(({ id }) => id)
    expect(new Set(ids)).toHaveProperty("size", ids.length)
    expect(readMotionProject(JSON.parse(JSON.stringify(added)))).toEqual(added)
  })
})

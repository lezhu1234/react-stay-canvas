// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { Rectangle, StayText } from "react-stay-canvas"

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
  hitMotionLayer,
  motionLayers,
  motionLayerId,
  progressMotionProject,
  renderMotionProject,
} from "../example/src/examples/integrated/motion/runtime"
import { createStage, md, mm, mu } from "./helpers/stage"

vi.stubGlobal("OffscreenCanvas", class {
  constructor(public width: number, public height: number) {}
  getContext() {
    return { measureText: () => ({ width: 56, fontBoundingBoxAscent: 10, fontBoundingBoxDescent: 2 }) }
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
  it("compiles every document layer into independent body and label slices", () => {
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
    expect(layers.every((child) => layerBody(child) instanceof Rectangle)).toBe(true)
    expect(layers.every((child) => layerLabel(child) instanceof StayText)).toBe(true)
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

  it("hits the frontmost painted layer when editable bodies overlap", () => {
    const { stage } = createStage({ width: 840, height: 430, layers: 3 })
    const project = updateMotionFrame(seedMotionProject(text), "accent-bar", "accent-0", {
      x: 72, y: 168, width: 184, height: 112,
    })
    renderMotionProject(stage.tools, project, 0)

    const target = stage.tools.getChildrenBySelector(".motion-layer")
      .filter((child) => (child.shapeMap.get("body") as Rectangle).contains({ x: 100, y: 190 }))
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

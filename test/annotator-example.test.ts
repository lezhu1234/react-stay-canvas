// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { Rectangle, StayText } from "react-stay-canvas"

import {
  type AnnotatorEngine,
  bindWorkspaceShortcuts,
  createAnnotatorListeners,
  navigateWorkspaceHistory,
  replaceAnnotationsFromCoco,
  toCoco,
} from "../example/src/examples/integrated/AnnotatorExample"
import { createStage, md, mm, mu } from "./helpers/stage"

vi.stubGlobal("OffscreenCanvas", class {
  constructor(public width: number, public height: number) {}
  getContext() {
    return { measureText: () => ({ width: 18, fontBoundingBoxAscent: 10, fontBoundingBoxDescent: 2 }) }
  }
})

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const box = (child: { shapeMap: Map<string, unknown> }) => child.shapeMap.get("0") as Rectangle
const label = (child: { shapeMap: Map<string, unknown> }) => child.shapeMap.get("1") as StayText

async function drag(target: HTMLCanvasElement, from: [number, number], to: [number, number]) {
  target.dispatchEvent(md(...from)); await tick()
  target.dispatchEvent(mm(...to)); await tick()
  target.dispatchEvent(mu(...to)); await tick()
}

async function click(target: HTMLCanvasElement, point: [number, number]) {
  target.dispatchEvent(md(...point)); await tick()
  target.dispatchEvent(mu(...point)); await tick()
}

function key(target: HTMLCanvasElement, type: "keydown" | "keyup", value: string) {
  target.dispatchEvent(new KeyboardEvent(type, { key: value, bubbles: true, cancelable: true }))
}

describe("integrated annotator example", () => {
  it("drives draw, smallest-hit selection, multi-select, move, resize cursors, and history through the real input API", async () => {
    const { stage, top } = createStage({ width: 720, height: 420 })
    const engine: AnnotatorEngine = {
      selected: new Set(), sequence: 0, changed: vi.fn(), say: vi.fn(), save: vi.fn(), import: vi.fn(),
    }
    createAnnotatorListeners(engine).forEach((listener) => stage.addEventListener(listener))

    await drag(top, [40, 40], [180, 180])
    await click(top, [300, 200])
    expect(engine.selected.size).toBe(0)
    top.dispatchEvent(mm(90, 90)); await tick()
    expect(top.style.cursor).toBe("crosshair")
    await drag(top, [70, 70], [120, 120])
    await click(top, [300, 200])
    const children = stage.tools.getChildrenBySelector<Rectangle | StayText>(".annotation")
    const [small, large] = [...children].sort((a, b) => box(a).area - box(b).area)
    expect(children).toHaveLength(2)
    expect(box(small).getBound()).toEqual({ x: 70, y: 70, width: 50, height: 50 })

    await click(top, [90, 90])
    expect([...engine.selected]).toEqual([small.id])

    key(top, "keydown", "Control")
    await click(top, [50, 50])
    key(top, "keyup", "Control")
    expect(engine.selected).toEqual(new Set([small.id, large.id]))

    await drag(top, [50, 50], [70, 80])
    expect(box(large).getBound()).toEqual({ x: 60, y: 70, width: 140, height: 140 })
    expect(box(small).getBound()).toEqual({ x: 90, y: 100, width: 50, height: 50 })
    expect(label(small)).toMatchObject({ x: 98, y: 116 })

    await click(top, [300, 200])
    await click(top, [110, 120])
    top.dispatchEvent(mm(140, 125)); await tick()
    expect(top.style.cursor).toBe("ew-resize")
    top.dispatchEvent(mm(110, 100)); await tick()
    expect(top.style.cursor).toBe("ns-resize")
    top.dispatchEvent(mm(140, 150)); await tick()
    expect(top.style.cursor).toBe("nwse-resize")
    const beforeResize = box(small).copy()
    await drag(top, [140, 150], [165, 175])
    expect(box(small).getBound()).toEqual({ x: 90, y: 100, width: 75, height: 75 })
    expect(label(small)).toMatchObject({ x: 98, y: 116 })

    key(top, "keydown", "Control"); key(top, "keydown", "z")
    key(top, "keyup", "z"); key(top, "keyup", "Control"); await tick()
    expect(engine.say).toHaveBeenCalledWith("Undo", "撤销")
    expect(box(stage.tools.getChildById(small.id)!).getBound()).toEqual(beforeResize.getBound())
    key(top, "keydown", "Control"); key(top, "keydown", "Shift"); key(top, "keydown", "z")
    key(top, "keyup", "z"); key(top, "keyup", "Shift"); key(top, "keyup", "Control"); await tick()
    expect(box(stage.tools.getChildById(small.id)!).width).toBe(75)

    key(top, "keydown", "Control"); key(top, "keydown", "s"); key(top, "keyup", "s"); key(top, "keyup", "Control")
    key(top, "keydown", "Meta"); key(top, "keydown", "i"); key(top, "keyup", "i"); key(top, "keyup", "Meta")
    expect(engine.save).toHaveBeenCalledOnce()
    expect(engine.import).toHaveBeenCalledOnce()
  })

  it("serializes annotation Child geometry as COCO boxes", async () => {
    const { stage, top } = createStage({ width: 720, height: 420 })
    const engine: AnnotatorEngine = {
      selected: new Set(), sequence: 0, changed: vi.fn(), say: vi.fn(), save: vi.fn(), import: vi.fn(),
    }
    createAnnotatorListeners(engine).forEach((listener) => stage.addEventListener(listener))
    await drag(top, [25, 35], [125, 95])

    const coco = toCoco(stage.tools)
    expect(coco).toMatchObject({
      images: [{ id: 1, width: 720, height: 420 }],
      annotations: [{ image_id: 1, category_id: 1, bbox: [25, 35, 100, 60], area: 6000, iscrowd: 0 }],
      categories: [{ id: 1, name: "vehicle" }],
    })

    const target = createStage({ width: 720, height: 420 }).stage
    const targetEngine: AnnotatorEngine = {
      selected: new Set(), sequence: 0, changed: vi.fn(), say: vi.fn(), save: vi.fn(), import: vi.fn(),
    }
    expect(replaceAnnotationsFromCoco(target.tools, targetEngine, coco)).toBe(1)
    expect(box(target.tools.getChildrenBySelector(".annotation")[0]).getBound()).toEqual({
      x: 25,
      y: 35,
      width: 100,
      height: 60,
    })
    expect(() => replaceAnnotationsFromCoco(target.tools, targetEngine, {})).toThrow(
      "COCO annotations must be an array",
    )
    expect(() => replaceAnnotationsFromCoco(target.tools, targetEngine, {
      annotations: [{ bbox: [null, null, "10", true] }],
    })).toThrow("COCO annotation has an invalid bbox")
    expect(target.tools.getChildrenBySelector(".annotation")).toHaveLength(1)

    replaceAnnotationsFromCoco(target.tools, targetEngine, {
      annotations: [{ bbox: [0, 0, 1, 1] }],
    })
    createAnnotatorListeners(targetEngine).forEach((listener) => target.addEventListener(listener))
    await click(target.root.layers[1], [0.5, 0.5])
    await drag(target.root.layers[1], [0.5, 0.5], [12, 12])
    expect(box(target.tools.getChildrenBySelector(".annotation")[0]).getBound()).toEqual({
      x: 0,
      y: 0,
      width: 12,
      height: 12,
    })
  })

  it("keeps drawing and transforms inside the image bounds", async () => {
    const { stage, top } = createStage({ width: 720, height: 420 })
    const engine: AnnotatorEngine = {
      selected: new Set(), sequence: 0, changed: vi.fn(), say: vi.fn(), save: vi.fn(), import: vi.fn(),
    }
    createAnnotatorListeners(engine).forEach((listener) => stage.addEventListener(listener))

    await drag(top, [700, 400], [760, 460])
    const child = stage.tools.getChildrenBySelector(".annotation")[0]
    expect(box(child).getBound()).toEqual({ x: 700, y: 400, width: 20, height: 20 })

    await drag(top, [730, 410], [650, 330])
    expect(stage.tools.getChildrenBySelector(".annotation")).toHaveLength(1)
    await drag(top, [710, 410], [760, 460])
    expect(box(child).getBound()).toEqual({ x: 700, y: 400, width: 20, height: 20 })

    await click(top, [300, 200])
    await drag(top, [715, 410], [720, 420])
    expect(box(stage.tools.getChildrenBySelector(".annotation")[1]).getBound()).toEqual({
      x: 708,
      y: 408,
      width: 12,
      height: 12,
    })
  })

  it("does not truncate redo for a cancelled gesture that never started", async () => {
    const { stage, top } = createStage({ width: 720, height: 420 })
    const engine: AnnotatorEngine = {
      selected: new Set(), sequence: 0, changed: vi.fn(), say: vi.fn(), save: vi.fn(), import: vi.fn(),
    }
    createAnnotatorListeners(engine).forEach((listener) => stage.addEventListener(listener))
    await drag(top, [20, 20], [80, 80])
    await click(top, [300, 200])
    await drag(top, [120, 120], [180, 180])
    stage.tools.undo()
    expect(stage.tools.getChildrenBySelector(".annotation")).toHaveLength(1)

    top.dispatchEvent(md(300, 300))
    window.dispatchEvent(new Event("blur"))
    stage.tools.redo()
    expect(stage.tools.getChildrenBySelector(".annotation")).toHaveLength(2)
  })

  it("rolls back a started gesture when the pointer session is cancelled", async () => {
    const { stage, top } = createStage({ width: 720, height: 420 })
    const engine: AnnotatorEngine = {
      selected: new Set(), sequence: 0, changed: vi.fn(), say: vi.fn(), save: vi.fn(), import: vi.fn(),
    }
    createAnnotatorListeners(engine).forEach((listener) => stage.addEventListener(listener))
    await drag(top, [20, 20], [80, 80])
    const child = stage.tools.getChildrenBySelector(".annotation")[0]
    const original = box(child).getBound()

    top.dispatchEvent(md(40, 40)); await tick()
    top.dispatchEvent(mm(100, 100)); await tick()
    window.dispatchEvent(new Event("blur")); await tick()
    expect(box(child).getBound()).toEqual(original)
    expect(engine.selected).toEqual(new Set([child.id]))
    expect(engine.say).toHaveBeenCalledWith("Change cancelled", "已取消更改")

    await click(top, [300, 200])
    top.dispatchEvent(md(120, 120)); await tick()
    top.dispatchEvent(mm(180, 180)); await tick()
    expect(stage.tools.getChildrenBySelector(".annotation")).toHaveLength(2)
    window.dispatchEvent(new Event("blur")); await tick()
    expect(stage.tools.getChildrenBySelector(".annotation")).toHaveLength(1)
  })

  it("uses rectangle geometry for hits and keeps selection styling out of history", async () => {
    const { stage, top } = createStage({ width: 720, height: 420 })
    const engine: AnnotatorEngine = {
      selected: new Set(), sequence: 0, changed: vi.fn(), say: vi.fn(), save: vi.fn(), import: vi.fn(),
    }
    createAnnotatorListeners(engine).forEach((listener) => stage.addEventListener(listener))
    await drag(top, [20, 20], [80, 80])
    await click(top, [300, 200])
    const first = stage.tools.getChildrenBySelector(".annotation")[0]
    label(first).contains = () => true
    await click(top, [10, 10])
    expect(engine.selected.size).toBe(0)

    await drag(top, [120, 120], [180, 180])
    await click(top, [40, 40])
    expect(engine.selected).toEqual(new Set([first.id]))
    navigateWorkspaceHistory(stage.tools, engine, "undo")
    await drag(top, [220, 220], [280, 280])
    navigateWorkspaceHistory(stage.tools, engine, "undo")
    expect(box(stage.tools.getChildById(first.id)!).strokeConfig.color).toEqual({
      a: 1,
      b: 62,
      g: 113,
      r: 224,
    })
    expect(engine.selected.size).toBe(0)
  })

  it("keeps workspace shortcuts active after focus moves to the toolbar", () => {
    const { stage } = createStage({ width: 720, height: 420 })
    const engine: AnnotatorEngine = {
      selected: new Set(), sequence: 0, changed: vi.fn(), say: vi.fn(), save: vi.fn(), import: vi.fn(),
    }
    const button = document.createElement("button")
    document.body.appendChild(button)
    button.focus()
    const unbind = bindWorkspaceShortcuts(engine, () => stage.tools)

    button.dispatchEvent(new KeyboardEvent("keydown", {
      key: "s",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }))
    expect(engine.save).toHaveBeenCalledOnce()
    unbind()
    button.remove()
  })
})

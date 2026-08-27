// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { Rectangle } from "react-stay-canvas"
import { createStage } from "./helpers/stage"

const rect = (x: number, y: number, w = 20, h = 20) =>
  new Rectangle({ x, y, width: w, height: h })

const filledRect = (x: number, y: number, w = 20, h = 20) =>
  new Rectangle({
    x,
    y,
    width: w,
    height: h,
    fillConfig: { color: { r: 220, g: 40, b: 30, a: 1 } },
  })

const animatedRect = (x: number, durationMs: number, fill?: () => void) =>
  new Rectangle({
    x,
    y: 10,
    width: 20,
    height: 20,
    fillConfig: { color: { r: 220, g: 40, b: 30, a: 1 } },
    stateDrawFuncMap: fill ? { default: { fill } } : undefined,
    transition: { durationMs, delayMs: 0 },
  })

const pixelAlpha = (canvas: HTMLCanvasElement, x: number, y: number) =>
  canvas.getContext("2d")!.getImageData(x, y, 1, 1).data[3]

// Dimension 9 (Tools & Ref): removeChild, changeCursor, export/import, trigger.

describe("removeChild", () => {
  it("removes a child from the canvas", () => {
    const { stage } = createStage()
    const child = stage.tools.appendChild({ className: "r", shape: rect(0, 0) })
    expect(stage.tools.hasChild(child.id)).toBe(true)

    stage.tools.removeChild(child.id)

    expect(stage.tools.hasChild(child.id)).toBe(false)
    expect(stage.tools.getChildrenWithoutRoot()).toHaveLength(0)
  })
})

describe("changeCursor", () => {
  it("sets the cursor style on the top layer", () => {
    const { stage, top } = createStage()
    stage.tools.changeCursor("pointer")
    expect(top.style.cursor).toBe("pointer")
  })
})

describe("export / import children", () => {
  it("re-creates children in another stage", () => {
    const src = createStage().stage
    const sourceChild = src.tools.appendChild({ className: "r", shape: rect(10, 10, 20, 20) })
    const exported = src.tools.exportChildren({
      children: src.tools.getChildrenWithoutRoot(),
    })

    expect(exported.children[0].sourceId).toBe(sourceChild.id)
    expect(exported.children[0].className).toBe("r")
    expect("copy" in sourceChild).toBe(false)
    expect("copy" in exported.children[0]).toBe(false)
    expect("canvas" in exported.children[0]).toBe(false)

    const dst = createStage().stage
    dst.tools.importChildren(exported)

    const children = dst.tools.getChildrenWithoutRoot()
    expect(children).toHaveLength(1)
    // imported children store their shape(s) in shapeMap
    const shape: any = [...children[0].shapeMap.values()][0]
    expect(shape.x).toBeCloseTo(10)
    expect(shape.y).toBeCloseTo(10)
    expect(shape.width).toBeCloseTo(20)
  })

  it("does not mutate an exported payload reused across target areas", () => {
    const src = createStage().stage
    src.tools.appendChild({ className: "r", shape: rect(10, 10, 20, 20) })
    const exported = src.tools.exportChildren({
      children: src.tools.getChildrenWithoutRoot(),
      area: { x: 0, y: 0, width: 100, height: 100 },
    })
    const exportedShape = [...exported.children[0].shapes.values()][0]

    expect(exportedShape.parent).toBeUndefined()

    const firstTarget = createStage().stage
    firstTarget.tools.importChildren(exported, { x: 20, y: 30, width: 100, height: 100 })

    const secondTarget = createStage().stage
    secondTarget.tools.importChildren(exported, { x: 40, y: 50, width: 100, height: 100 })

    expect(exportedShape.x).toBe(10)
    expect(exportedShape.y).toBe(10)
    expect(firstTarget.tools.getChildrenWithoutRoot()[0].shape.x).toBe(30)
    expect(firstTarget.tools.getChildrenWithoutRoot()[0].shape.y).toBe(40)
    expect(secondTarget.tools.getChildrenWithoutRoot()[0].shape.x).toBe(50)
    expect(secondTarget.tools.getChildrenWithoutRoot()[0].shape.y).toBe(60)
  })

  it("captures an animated child's current projection without its timeline", () => {
    const src = createStage().stage
    const animated = src.tools.createChild({ className: "animated" })
    animated.appendDefaultFrame(
      new Rectangle({
        x: 12,
        y: 18,
        width: 20,
        height: 20,
        fillConfig: { color: { r: 1, g: 2, b: 3, a: 1 } },
        transition: { durationMs: 300, delayMs: 0 },
      })
    )
    src.tools.progress({ timeMs: 300 })

    const scene = src.tools.exportChildren({ children: [animated] })

    expect(scene.children[0].sourceId).toBe(animated.id)
    expect(scene.children[0].shapes.size).toBe(1)
    expect("shapeFramesMap" in scene.children[0]).toBe(false)

    const dst = createStage().stage
    dst.tools.importChildren(scene)
    const imported = dst.tools.getChildrenWithoutRoot()[0]
    expect(imported.participatesInHistory).toBe(true)
    expect((imported as any).shapeFramesMap).toBeUndefined()
    expect(imported.shape.x).toBe(12)
  })
})

describe("regionToTargetCanvas", () => {
  it("exports Content independently of the live viewport", async () => {
    const { stage } = createStage({ width: 120, height: 60 })
    const shape = filledRect(10, 10, 20, 20)
    const child = stage.tools.appendChild({ className: "r", shape })
    stage.tools.viewport.restore({ x: -80, y: 20, scale: 2 })

    const canvas = await stage.tools.regionToTargetCanvas({
      area: { x: 0, y: 0, width: 120, height: 60 },
      children: [child],
    })

    expect(pixelAlpha(canvas, 15, 15)).toBe(255)
    expect(shape).toMatchObject({ x: 10, y: 10, width: 20, height: 20 })
    expect(stage.tools.viewport.get()).toEqual({ x: -80, y: 20, scale: 2 })
  })

  it("seeks children when progress is zero", async () => {
    const { stage } = createStage()
    const child = stage.tools.appendChild({ className: "r", shape: rect(0, 0) })
    const setCurrentTime = vi.spyOn(child, "setCurrentTime")

    await stage.tools.regionToTargetCanvas({
      area: { x: 0, y: 0, width: 100, height: 100 },
      children: [child],
      progress: 0,
    })

    expect(setCurrentTime).toHaveBeenCalledOnce()
    expect(setCurrentTime).toHaveBeenCalledWith({ time: 0 })
  })

  it("maps the source area into the target size with a centered aspect fit", async () => {
    const { stage } = createStage()
    const child = stage.tools.appendChild({
      className: "r",
      shape: filledRect(30, 40, 20, 10),
    })

    const canvas = await stage.tools.regionToTargetCanvas({
      area: { x: 20, y: 30, width: 100, height: 50 },
      targetSize: { width: 200, height: 200 },
      children: [child],
    })

    expect(canvas.width).toBe(200)
    expect(canvas.height).toBe(200)
    expect(pixelAlpha(canvas, 25, 75)).toBe(255)
    expect(pixelAlpha(canvas, 5, 5)).toBe(0)
    expect(pixelAlpha(canvas, 25, 105)).toBe(0)
  })

  it("clips shapes to the requested source area without changing their geometry", async () => {
    const { stage } = createStage()
    const shape = filledRect(0, 20, 40, 20)
    const child = stage.tools.appendChild({ className: "r", shape })

    const canvas = await stage.tools.regionToTargetCanvas({
      area: { x: 20, y: 0, width: 100, height: 100 },
      targetSize: { width: 200, height: 200 },
      children: [child],
    })

    expect(pixelAlpha(canvas, 10, 50)).toBe(255)
    expect(pixelAlpha(canvas, 45, 50)).toBe(0)
    expect(shape).toMatchObject({ x: 0, y: 20, width: 40, height: 20 })
    expect(child.shape).toBe(shape)
  })

  it("captures an animated time without changing the live projection", async () => {
    const { stage } = createStage({ width: 120, height: 60 })
    const child = stage.tools.createChild({ className: "animated" })
    child.appendKeyFrame("body", animatedRect(10, 0), false)
    child.appendKeyFrame("body", animatedRect(70, 100), false)
    stage.tools.progress({ timeMs: 0 })
    const liveShape = child.shape

    const canvas = await stage.tools.regionToTargetCanvas({
      area: { x: 0, y: 0, width: 120, height: 60 },
      children: [child],
      progress: 100,
    })

    expect(pixelAlpha(canvas, 75, 15)).toBe(255)
    expect(pixelAlpha(canvas, 15, 15)).toBe(0)
    expect(child.shape).toBe(liveShape)
    expect(child.shape.x).toBe(10)

    stage.tools.progress({ timeMs: 0 })
    expect(child.shape.x).toBe(10)
  })

  it("restores the live animation projection when capture drawing fails", async () => {
    const { stage } = createStage({ width: 120, height: 60 })
    const child = stage.tools.createChild({ className: "animated" })
    child.appendKeyFrame("body", animatedRect(10, 0), false)
    child.appendKeyFrame("body", animatedRect(70, 100, () => {
      throw new Error("capture draw failed")
    }), false)
    stage.tools.progress({ timeMs: 0 })
    const liveShape = child.shape

    await expect(stage.tools.regionToTargetCanvas({
      area: { x: 0, y: 0, width: 120, height: 60 },
      children: [child],
      progress: 100,
    })).rejects.toThrow("capture draw failed")

    expect(child.shape).toBe(liveShape)
    expect(child.shape.x).toBe(10)
  })
})

describe("trigger (programmatic custom event)", () => {
  it("fires a custom listener with the payload", () => {
    const { stage } = createStage()
    let received: any = null
    stage.addEventListener({
      name: "onCustom",
      event: "myEvent",
      callback: ({ payload }) => {
        received = payload
      },
    })

    // Mirrors what StayCanvasRefType.trigger builds under the hood.
    const ev = new Event("myEvent")
    stage.tools.triggerAction(
      ev,
      { myEvent: { info: {} } },
      { value: 42 }
    )

    expect(received).toEqual({ value: 42 })
  })
})

// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { Rectangle } from "react-stay-canvas"
import { createStage } from "./helpers/stage"

const rect = (x: number, y: number, w = 20, h = 20) =>
  new Rectangle({ x, y, width: w, height: h })

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
    src.tools.appendChild({ className: "r", shape: rect(10, 10, 20, 20) })
    const exported = src.tools.exportChildren({
      children: src.tools.getChildrenWithoutRoot(),
    })

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
    const exportedShape = [...exported.children[0].shapeMap.values()][0]

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
})

describe("regionToTargetCanvas", () => {
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

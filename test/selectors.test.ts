// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { Rectangle } from "react-stay-canvas"
import { createStage } from "./helpers/stage"

const rect = (x: number, y: number) =>
  new Rectangle({ x, y, width: 10, height: 10 })

// Dimension 2 (Selector): .class / #id / logical & | !

describe("selectors", () => {
  it("selects by className and id", () => {
    const { stage } = createStage(); const { appendChild, getChildrenBySelector, getChildBySelector } = stage.tools
    const a = appendChild({ className: "box", shape: rect(0, 0) })
    appendChild({ className: "box", shape: rect(20, 0) })
    appendChild({ className: "label", shape: rect(0, 20) })

    expect(getChildrenBySelector(".box")).toHaveLength(2)
    expect(getChildrenBySelector(".label")).toHaveLength(1)
    expect(getChildBySelector("#" + a.id)?.id).toBe(a.id)
  })

  it("supports & (and), | (or), ! (not)", () => {
    const { stage } = createStage(); const { appendChild, getChildrenBySelector } = stage.tools
    const a = appendChild({ className: "box", shape: rect(0, 0) })
    const b = appendChild({ className: "box", shape: rect(20, 0) })
    appendChild({ className: "label", shape: rect(0, 20) })

    // box AND not #a  -> only b
    expect(getChildrenBySelector(".box&!#" + a.id).map((c) => c.id)).toEqual([b.id])
    // box OR label -> both boxes + the label = 3
    expect(getChildrenBySelector(".box|.label")).toHaveLength(3)
    // not box -> excludes both boxes (label + root remain, so a/b are absent)
    const notBox = getChildrenBySelector("!.box").map((c) => c.id)
    expect(notBox).not.toContain(a.id)
    expect(notBox).not.toContain(b.id)
  })

  it("getContainPointChildren filters by point and selector", () => {
    const { stage } = createStage(); const { appendChild, getContainPointChildren } = stage.tools
    appendChild({ className: "box", shape: rect(0, 0) }) // covers (0..10, 0..10)
    appendChild({ className: "box", shape: rect(100, 100) })

    const hit = getContainPointChildren({ point: { x: 5, y: 5 }, selector: ".box" })
    expect(hit).toHaveLength(1)
    const miss = getContainPointChildren({ point: { x: 500, y: 500 }, selector: ".box" })
    expect(miss).toHaveLength(0)
  })
})

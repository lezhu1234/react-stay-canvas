// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { Rectangle } from "react-stay-canvas"
import { createStage, md, mm, mu } from "./helpers/stage"

// triggerAction awaits the listener callback, deferring composeStore merges to a
// microtask. Real DOM events land on separate event-loop turns; back-to-back
// synchronous dispatch does not, so flush between dispatches.
const tick = () => new Promise((r) => setTimeout(r, 0))

// Dimensions 3 & 4 (custom events / listeners): the predefined drag chain
// (dragstart -> drag -> dragend) self-registers, and composeStore carries data
// between the events of one listener.

describe("listeners & event chain", () => {
  it("a mousedown listener fires and can use tools", () => {
    const { stage, top } = createStage()
    let count = 0
    stage.addEventListener({
      name: "down",
      event: "mousedown",
      callback: ({ e, tools }) => {
        count++
        tools.appendChild({
          className: "dot",
          shape: new Rectangle({ x: e.x, y: e.y, width: 4, height: 4 }),
        })
      },
    })

    top.dispatchEvent(md(30, 30))
    top.dispatchEvent(md(60, 60))

    expect(count).toBe(2)
    expect(stage.tools.getChildrenBySelector(".dot")).toHaveLength(2)
  })

  it("drag chain draws + resizes a rectangle via composeStore", async () => {
    const { stage, top } = createStage()
    stage.addEventListener({
      name: "draw",
      event: ["dragstart", "drag", "dragend"],
      callback: ({ e, composeStore, tools }: any) => ({
        dragstart: () => ({
          start: { x: e.x, y: e.y },
          child: tools.appendChild({
            className: "r",
            shape: new Rectangle({ x: e.x, y: e.y, width: 0, height: 0 }),
          }),
        }),
        drag: () => {
          const { start, child } = composeStore
          child.shape.update({ width: e.x - start.x, height: e.y - start.y })
        },
      }),
    })

    top.dispatchEvent(md(30, 30)) // dragstart -> create 0x0 rect
    await tick()
    top.dispatchEvent(mm(50, 50)) // drag (dist ~28 >= 10) -> resize to 20x20
    await tick()
    top.dispatchEvent(mu(50, 50)) // dragend
    await tick()

    const rects = stage.tools.getChildrenBySelector(".r")
    expect(rects).toHaveLength(1)
    const shape: any = rects[0].shape
    expect(shape.width).toBe(20)
    expect(shape.height).toBe(20)
  })
})

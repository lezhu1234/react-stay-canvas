// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { Rectangle } from "react-stay-canvas"
import { createStage, md, mm } from "./helpers/stage"

describe("EventRuntime contracts", () => {
  it("defers a newly linked event until a later raw input", () => {
    const { stage, top } = createStage()
    let followCalls = 0

    stage.registerEvent({
      name: "arm-follow",
      trigger: "mousedown",
      successCallback: () => ({ name: "follow", trigger: "mousedown" }),
    })
    stage.addEventListener({
      name: "follow-listener",
      event: "follow",
      callback: () => {
        followCalls++
      },
    })

    top.dispatchEvent(md(10, 10))
    expect(followCalls).toBe(0)

    top.dispatchEvent(md(10, 10))
    expect(followCalls).toBe(1)
  })

  it("applies deletion before a later definition in the same input", () => {
    const { stage, top } = createStage()
    let victimCalls = 0

    stage.registerEvent({
      name: "remove-victim",
      trigger: "mousedown",
      successCallback: ({ deleteEvent }) => {
        deleteEvent("victim")
      },
    })
    stage.registerEvent({ name: "victim", trigger: "mousedown" })
    stage.addEventListener({
      name: "victim-listener",
      event: "victim",
      callback: () => {
        victimCalls++
      },
    })

    top.dispatchEvent(md(10, 10))

    expect(victimCalls).toBe(0)
  })

  it("uses a same-name replacement when its turn has not run yet", () => {
    const { stage, top } = createStage()
    let replacementCalls = 0

    stage.registerEvent({
      name: "replace-later",
      trigger: "mousedown",
      successCallback: () => ({
        name: "later",
        trigger: "mousedown",
        conditionCallback: () => true,
      }),
    })
    stage.registerEvent({
      name: "later",
      trigger: "mousedown",
      conditionCallback: () => false,
    })
    stage.addEventListener({
      name: "replacement-listener",
      event: "later",
      callback: () => {
        replacementCalls++
      },
    })

    top.dispatchEvent(md(10, 10))

    expect(replacementCalls).toBe(1)
  })

  it("seeds every definition independently and reads state live", () => {
    const { stage, top } = createStage()
    let observedPointX = 0
    let observedState = ""

    stage.registerEvent({
      name: "mutate-seed",
      trigger: "mousedown",
      successCallback: ({ e }) => {
        e.point.x = 999
        stage.tools.switchState("next")
      },
    })
    stage.registerEvent({
      name: "observe-seed",
      trigger: "mousedown",
      conditionCallback: ({ e }) => {
        observedPointX = e.point.x
        observedState = e.state
        return false
      },
    })

    top.dispatchEvent(md(12, 18))

    expect(observedPointX).toBe(12)
    expect(observedState).toBe("next")
  })

  it("keeps an immediate deletion when success throws synchronously", () => {
    const { stage } = createStage()
    let victimCalls = 0

    stage.registerEvent({
      name: "delete-then-throw",
      trigger: "mousedown",
      successCallback: ({ deleteEvent }) => {
        deleteEvent("throw-victim")
        throw new Error("event success failed")
      },
    })
    stage.registerEvent({ name: "throw-victim", trigger: "mousedown" })
    stage.addEventListener({
      name: "throw-victim-listener",
      event: "throw-victim",
      callback: () => {
        victimCalls++
      },
    })

    expect(() => stage.eventDispatcher.fireEvent(md(10, 10), "mousedown")).toThrow(
      "event success failed"
    )
    stage.eventRuntime.deleteEvent("delete-then-throw")
    stage.eventDispatcher.fireEvent(md(10, 10), "mousedown")

    expect(victimCalls).toBe(0)
  })

  it("clearEvents removes definitions and terminates retained gesture owners", () => {
    const { stage, top } = createStage()
    let customCalls = 0
    let dragCalls = 0

    stage.tools.appendChild({
      className: "clear-owner-node",
      shape: new Rectangle({ x: 0, y: 0, width: 40, height: 40 }),
    })

    stage.registerEvent({ name: "custom", trigger: "mousedown" })
    stage.addEventListener({
      name: "custom-listener",
      event: "custom",
      callback: () => {
        customCalls++
      },
    })
    stage.addEventListener({
      name: "clear-owner-listener",
      event: "drag",
      selector: ".clear-owner-node",
      callback: () => {
        dragCalls++
      },
    })

    top.dispatchEvent(md(10, 10))
    expect(customCalls).toBe(1)

    stage.clearEvents()
    stage.registerEvent({ name: "drag", trigger: "mousemove" })
    top.dispatchEvent(md(10, 10))
    top.dispatchEvent(mm(20, 20))

    expect(customCalls).toBe(1)
    expect(dragCalls).toBe(0)
  })
})

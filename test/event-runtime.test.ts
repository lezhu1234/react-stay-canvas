// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { Rectangle } from "react-stay-canvas"
import { createStage, md, mm, mu } from "./helpers/stage"

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

  it("keeps the registered action name after success mutates its seed", () => {
    const { stage, top } = createStage()
    let observedName = ""
    let predicateName = ""

    stage.tools.appendChild({
      className: "stable-name-node",
      shape: new Rectangle({ x: 0, y: 0, width: 30, height: 30 }),
    })

    stage.registerEvent({
      name: "stable-name",
      trigger: "mousedown",
      withTargetConditionCallback: ({ e }) => {
        predicateName = e.name
        return true
      },
      successCallback: ({ e }) => {
        e.name = "mutated-name"
      },
    })
    stage.addEventListener({
      name: "stable-name-listener",
      event: "stable-name",
      selector: ".stable-name-node",
      callback: ({ e }) => {
        observedName = e.name
      },
    })

    top.dispatchEvent(md(10, 10))

    expect(predicateName).toBe("stable-name")
    expect(observedName).toBe("stable-name")
  })

  it("lets routing own the listener target", () => {
    const { stage } = createStage()
    const injectedTarget = stage.tools.appendChild({
      className: "injected-target",
      shape: new Rectangle({ x: 0, y: 0, width: 30, height: 30 }),
    })
    let observedTarget: unknown = "not-called"

    stage.registerEvent({
      name: "targetless-key-action",
      trigger: "keydown",
      successCallback: ({ e }) => {
        e.target = injectedTarget
      },
    })
    stage.addEventListener({
      name: "targetless-key-listener",
      event: "targetless-key-action",
      callback: ({ e }) => {
        observedTarget = e.target
      },
    })

    stage.eventRuntime.handleInput({
      originEvent: new KeyboardEvent("keydown", { key: "k" }),
      trigger: "keydown",
      pressedKeys: new Set(["k"]),
    })

    expect(observedTarget).toBeUndefined()
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

    const fire = () =>
      stage.eventRuntime.handleInput({
        originEvent: md(10, 10),
        trigger: "mousedown",
        pressedKeys: new Set(["mouse0"]),
      })

    expect(fire).toThrow("event success failed")
    stage.eventRuntime.deleteEvent("delete-then-throw")
    fire()

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

  it("clears gesture owners when a mouseup event definition throws", () => {
    const { stage, top } = createStage()
    stage.tools.appendChild({
      className: "throw-end-node",
      shape: new Rectangle({ x: 0, y: 0, width: 40, height: 40 }),
    })
    let drags = 0

    stage.addEventListener({
      name: "throw-end-listener",
      event: "drag",
      selector: ".throw-end-node",
      callback: () => {
        drags++
      },
    })
    top.dispatchEvent(md(10, 10))
    stage.registerEvent({
      name: "throw-on-up",
      trigger: "mouseup",
      successCallback: () => {
        throw new Error("mouseup definition failed")
      },
    })

    expect(() =>
      stage.eventRuntime.handleInput({
        originEvent: mu(80, 10),
        trigger: "mouseup",
        pressedKeys: new Set(),
      })
    ).toThrow("mouseup definition failed")

    stage.registerEvent({ name: "drag", trigger: "mousemove" })
    top.dispatchEvent(mm(80, 10))
    expect(drags).toBe(0)
  })
})

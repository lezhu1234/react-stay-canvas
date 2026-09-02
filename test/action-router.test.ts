// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { Rectangle } from "react-stay-canvas"
import { createStage, md, mm, mu } from "./helpers/stage"

const rectangle = (x: number, y: number, width: number, height: number) =>
  new Rectangle({ x, y, width, height })

describe("ActionRouter contracts", () => {
  it("gives every listener an independent action-event envelope", () => {
    const { stage, top } = createStage()
    stage.tools.appendChild({
      className: "surface",
      shape: rectangle(0, 0, 400, 400),
    })

    let firstEvent: any
    let secondEvent: any
    let firstTarget: any

    stage.addEventListener({
      name: "mutating-listener",
      event: "mousedown",
      selector: ".surface",
      callback: ({ e }: any) => {
        firstEvent = e
        firstTarget = e.target
        e.point.x = 250
        e.pressedKeys.add("listener-a-only")
        e.target = undefined
      },
    })
    stage.addEventListener({
      name: "observing-listener",
      event: "mousedown",
      selector: ".surface",
      callback: ({ e }: any) => {
        secondEvent = e
      },
    })

    top.dispatchEvent(md(20, 30))

    expect(secondEvent).toBeDefined()
    expect(secondEvent).not.toBe(firstEvent)
    expect(secondEvent.point).not.toBe(firstEvent.point)
    expect(secondEvent.pressedKeys).not.toBe(firstEvent.pressedKeys)
    expect(secondEvent.point).toEqual({ x: 20, y: 30 })
    expect([...secondEvent.pressedKeys]).toEqual(["mouse0"])
    expect(secondEvent.target).toBe(firstTarget)
  })

  it("invokes an ordinary mouse listener with the hit candidate accepted by its predicate", () => {
    const { stage, top } = createStage()
    const large = stage.tools.appendChild({
      className: "overlap",
      shape: rectangle(0, 0, 100, 100),
    })
    stage.tools.appendChild({
      className: "overlap",
      shape: rectangle(0, 0, 20, 20),
    })

    let acceptedTarget: any
    let callbackTarget: any

    stage.registerEvent({
      name: "predicate-pick",
      trigger: "mousedown",
      withTargetConditionCallback: ({ target }) => {
        if (target === large) {
          acceptedTarget = target
          return true
        }
        return false
      },
    })
    stage.addEventListener({
      name: "predicate-listener",
      event: "predicate-pick",
      selector: ".overlap",
      sortBy: (a, b) => {
        const aBound = a.getBound()
        const bBound = b.getBound()
        return aBound.width * aBound.height - bBound.width * bBound.height
      },
      callback: ({ e }: any) => {
        callbackTarget = e.target
      },
    })

    top.dispatchEvent(md(10, 10))

    expect(acceptedTarget).toBe(large)
    expect(callbackTarget).toBe(acceptedTarget)
  })

  it("prefers the smallest overlapping Child when a Listener omits sortBy", () => {
    const { stage, top } = createStage()
    stage.tools.appendChild({
      className: "overlap",
      shape: rectangle(0, 0, 100, 100),
    })
    const smallest = stage.tools.appendChild({
      className: "overlap",
      shape: rectangle(0, 0, 20, 20),
    })
    let target: any

    stage.addEventListener({
      name: "default-overlap-order",
      event: "mousedown",
      selector: ".overlap",
      callback: ({ e }: any) => {
        target = e.target
      },
    })

    top.dispatchEvent(md(10, 10))

    expect(target).toBe(smallest)
  })

  it("uses the combined bounds of a multi-Shape Child for default ordering", () => {
    const { stage, top } = createStage()
    stage.tools.appendChild({
      className: "overlap",
      shape: [rectangle(0, 0, 10, 10), rectangle(90, 90, 10, 10)],
    })
    const compact = stage.tools.appendChild({
      className: "overlap",
      shape: [rectangle(0, 0, 20, 20), rectangle(10, 10, 20, 20)],
    })
    let target: any

    stage.addEventListener({
      name: "multi-shape-default-order",
      event: "mousedown",
      selector: ".overlap",
      callback: ({ e }: any) => {
        target = e.target
      },
    })

    top.dispatchEvent(md(5, 5))

    expect(target).toBe(compact)
  })

  it("keeps insertion order for equal bounds and places root after ordinary Children", () => {
    const { stage, top } = createStage()
    const first = stage.tools.appendChild({
      className: "first-overlap",
      shape: rectangle(0, 0, 600, 600),
    })
    stage.tools.appendChild({
      className: "second-overlap",
      shape: rectangle(0, 0, 600, 600),
    })
    let target: any

    stage.addEventListener({
      name: "stable-default-order",
      event: "mousedown",
      selector: ".first-overlap|.second-overlap|.stay-canvas",
      callback: ({ e }: any) => {
        target = e.target
      },
    })

    top.dispatchEvent(md(10, 10))

    expect(target).toBe(first)
  })

  it("recognizes platform-standard undo and redo modifiers", () => {
    const { stage, top } = createStage()
    const actions: string[] = []
    const dispatchKey = (type: "keydown" | "keyup", key: string) => {
      top.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }))
    }
    const dispatchShortcut = (modifier: "Control" | "Meta", shift: boolean) => {
      dispatchKey("keydown", modifier)
      if (shift) dispatchKey("keydown", "Shift")
      dispatchKey("keydown", "z")
      dispatchKey("keyup", "z")
      if (shift) dispatchKey("keyup", "Shift")
      dispatchKey("keyup", modifier)
    }

    stage.addEventListener({
      name: "history-shortcuts",
      event: ["undo", "redo"],
      callback: ({ e }: any) => actions.push(e.name),
    })

    dispatchShortcut("Control", false)
    dispatchShortcut("Control", true)
    dispatchShortcut("Meta", false)
    dispatchShortcut("Meta", true)

    expect(actions).toEqual(["undo", "redo", "undo", "redo"])
  })

  it("retains each listener's drag-start target through continuation and end", () => {
    const { stage, top } = createStage()
    const startA = stage.tools.appendChild({
      className: "a",
      shape: rectangle(0, 0, 40, 40),
    })
    const startB = stage.tools.appendChild({
      className: "b",
      shape: rectangle(0, 0, 40, 40),
    })
    stage.tools.appendChild({
      className: "a",
      shape: rectangle(80, 0, 40, 40),
    })
    stage.tools.appendChild({
      className: "b",
      shape: rectangle(80, 0, 40, 40),
    })

    const targetsA: string[] = []
    const targetsB: string[] = []
    stage.addEventListener({
      name: "drag-a",
      event: ["dragstart", "drag", "dragend"],
      selector: ".a",
      callback: ({ e }: any) => {
        targetsA.push(e.target.id)
      },
    })
    stage.addEventListener({
      name: "drag-b",
      event: ["dragstart", "drag", "dragend"],
      selector: ".b",
      callback: ({ e }: any) => {
        targetsB.push(e.target.id)
      },
    })

    top.dispatchEvent(md(10, 10))
    top.dispatchEvent(mm(90, 10))
    top.dispatchEvent(mu(90, 10))

    expect(targetsA).toEqual([startA.id, startA.id, startA.id])
    expect(targetsB).toEqual([startB.id, startB.id, startB.id])
  })

  it("records a no-owner drag start and never acquires a child mid-gesture", () => {
    const { stage, top } = createStage()
    stage.tools.appendChild({
      className: "drop-zone",
      shape: rectangle(0, 0, 40, 40),
    })

    const phases: string[] = []
    stage.addEventListener({
      name: "missed-drag",
      event: ["dragstart", "drag", "dragend"],
      selector: ".drop-zone",
      callback: ({ e }: any) => {
        phases.push(e.name)
      },
    })

    top.dispatchEvent(md(200, 200))
    top.dispatchEvent(mm(10, 10))
    top.dispatchEvent(mu(10, 10))

    expect(phases).toEqual([])
  })

  it("captures a start target for a listener that subscribes only to later drag phases", () => {
    const { stage, top } = createStage()
    const start = stage.tools.appendChild({
      className: "continuation-node",
      shape: rectangle(0, 0, 40, 40),
    })
    stage.tools.appendChild({
      className: "continuation-node",
      shape: rectangle(80, 0, 40, 40),
    })
    const targets: string[] = []

    stage.addEventListener({
      name: "continuation-only",
      event: ["drag", "dragend"],
      selector: ".continuation-node",
      callback: ({ e }: any) => {
        targets.push(e.target.id)
      },
    })

    top.dispatchEvent(md(10, 10))
    top.dispatchEvent(mm(90, 10))
    top.dispatchEvent(mu(90, 10))

    expect(targets).toEqual([start.id, start.id])
  })

  it("routes a one-shot gesture start after its definition deletes itself", () => {
    const { stage, top } = createStage()
    const start = stage.tools.appendChild({
      className: "one-shot-start-node",
      shape: rectangle(0, 0, 40, 40),
    })
    const targets: string[] = []

    stage.registerEvent({
      name: "dragstart",
      trigger: "mousedown",
      successCallback: ({ deleteEvent }) => {
        deleteEvent("dragstart")
      },
    })
    stage.addEventListener({
      name: "one-shot-start-listener",
      event: "dragstart",
      selector: ".one-shot-start-node",
      callback: ({ e }: any) => targets.push(e.target.id),
    })

    top.dispatchEvent(md(10, 10))

    expect(targets).toEqual([start.id])
  })

  it("retains the start target for a terminal registered by a later phase", () => {
    const { stage, top } = createStage()
    const start = stage.tools.appendChild({
      className: "staged-terminal-node",
      shape: rectangle(0, 0, 40, 40),
    })
    stage.tools.appendChild({
      className: "staged-terminal-node",
      shape: rectangle(80, 0, 40, 40),
    })
    const targets: string[] = []

    stage.registerEvent({
      name: "dragstart",
      trigger: "mousedown",
      successCallback: () => ({
        name: "drag",
        trigger: "mousemove",
        successCallback: () => ({
          name: "dragend",
          trigger: "mouseup",
        }),
      }),
    })
    stage.addEventListener({
      name: "staged-terminal-listener",
      event: "dragend",
      selector: ".staged-terminal-node",
      callback: ({ e }: any) => targets.push(e.target.id),
    })

    top.dispatchEvent(md(10, 10))
    top.dispatchEvent(mm(90, 10))
    top.dispatchEvent(mu(90, 10))

    expect(targets).toEqual([start.id])
  })

  it("keeps no-owner when an inactive listener becomes active during dragstart", () => {
    const { stage, top } = createStage()
    stage.tools.appendChild({
      className: "state-node",
      shape: rectangle(0, 0, 120, 40),
    })
    let drags = 0

    stage.addEventListener({
      name: "state-gated-drag",
      state: "active",
      event: "drag",
      selector: ".state-node",
      callback: () => {
        drags++
      },
    })
    stage.addEventListener({
      name: "activate-on-start",
      event: "dragstart",
      selector: ".state-node",
      callback: ({ tools }) => {
        tools.switchState("active")
      },
    })

    top.dispatchEvent(md(10, 10))
    top.dispatchEvent(mm(90, 10))
    top.dispatchEvent(mu(90, 10))

    expect(drags).toBe(0)
  })

  it("does not transfer an active gesture owner to a same-name replacement", () => {
    const { stage, top } = createStage()
    stage.tools.appendChild({
      className: "replace-node",
      shape: rectangle(0, 0, 120, 40),
    })
    let replacementDrags = 0

    stage.addEventListener({
      name: "replace-drag",
      event: "drag",
      selector: ".replace-node",
      callback: () => undefined,
    })
    top.dispatchEvent(md(10, 10))

    stage.addEventListener({
      name: "replace-drag",
      event: "drag",
      selector: ".replace-node",
      callback: () => {
        replacementDrags++
      },
    })

    top.dispatchEvent(mm(90, 10))
    top.dispatchEvent(mu(90, 10))

    expect(replacementDrags).toBe(0)
  })

  it("evaluates listener state live in registration order", () => {
    const { stage, top } = createStage()
    const calls: string[] = []

    stage.addEventListener({
      name: "state-switcher",
      event: "mousedown",
      callback: ({ tools }) => {
        calls.push("switcher")
        tools.switchState("activated")
      },
    })
    stage.addEventListener({
      name: "new-state-listener",
      state: "activated",
      event: "mousedown",
      callback: () => {
        calls.push("activated")
      },
    })

    top.dispatchEvent(md(10, 10))

    expect(calls).toEqual(["switcher", "activated"])
  })

  it("re-evaluates listener state before every action in one dispatch", () => {
    const { stage, top } = createStage()
    const calls: string[] = []

    stage.registerEvent({ name: "first-action", trigger: "mousedown" })
    stage.registerEvent({ name: "second-action", trigger: "mousedown" })
    stage.addEventListener({
      name: "multi-action-listener",
      event: ["first-action", "second-action"],
      callback: ({ e, tools }: any) => {
        calls.push(e.name)
        if (e.name === "first-action") tools.switchState("active")
      },
    })

    top.dispatchEvent(md(10, 10))

    expect(calls).toEqual(["first-action"])
  })

  it("places a same-name replacement at the end of registration order", () => {
    const { stage, top } = createStage()
    const calls: string[] = []

    stage.addEventListener({
      name: "replace-order",
      state: "active",
      event: "mousedown",
      callback: () => undefined,
    })
    stage.addEventListener({
      name: "state-switcher",
      event: "mousedown",
      callback: ({ tools }) => {
        calls.push("switcher")
        tools.switchState("active")
      },
    })
    stage.addEventListener({
      name: "replace-order",
      state: "active",
      event: "mousedown",
      callback: () => {
        calls.push("replacement")
      },
    })

    top.dispatchEvent(md(10, 10))

    expect(calls).toEqual(["switcher", "replacement"])
  })

  it("supports a payload-bearing manual trigger without a scene target", () => {
    const { stage } = createStage()
    const originEvent = new Event("custom-action")
    const payload = { recordId: "record-42" }
    const seenCompose: Record<string, unknown>[] = []
    let received: any

    stage.addEventListener({
      name: "manual-listener",
      event: "custom-action",
      callback: (props: any) => {
        received = props
        seenCompose.push({ ...props.composeStore })
        return { "custom-action": () => ({ count: (props.composeStore.count ?? 0) + 1 }) }
      },
    })

    stage.tools.triggerAction(
      originEvent,
      { "custom-action": { info: {} } },
      payload
    )

    expect(received.originEvent).toBe(originEvent)
    expect(received.payload).toBe(payload)
    expect(received.e).not.toBe(originEvent)
    expect(received.e.name).toBe("custom-action")
    expect(received.e.state).toBe("default-state")
    expect(received.e.isMouseEvent).toBe(false)
    expect([...received.e.pressedKeys]).toEqual([])
    expect(received.e.target == null).toBe(true)

    stage.tools.triggerAction(
      originEvent,
      { "custom-action": { info: {} } },
      payload
    )
    expect(seenCompose).toEqual([{}, { count: 1 }])
  })

  it("isolates mutable fields from explicit manual action data", () => {
    const { stage } = createStage()
    const originEvent = new Event("manual-action")
    const actionInfo = {
      point: { x: 4, y: 8 },
      pressedKeys: new Set(["Shift"]),
    }
    let observed: any

    stage.addEventListener({
      name: "manual-mutator",
      event: "manual-action",
      callback: ({ e }: any) => {
        e.point.x = 100
        e.pressedKeys.add("mutator-only")
        delete e.point
        delete e.pressedKeys
      },
    })
    stage.addEventListener({
      name: "manual-observer",
      event: "manual-action",
      callback: ({ e }: any) => {
        observed = e
      },
    })

    stage.tools.triggerAction(
      originEvent,
      { "manual-action": { info: actionInfo } },
      {}
    )

    expect(observed.point).toEqual({ x: 4, y: 8 })
    expect([...observed.pressedKeys]).toEqual(["Shift"])
    expect(actionInfo.point).toEqual({ x: 4, y: 8 })
    expect([...actionInfo.pressedKeys]).toEqual(["Shift"])
  })

  it("keeps the native event separate from explicit manual action data", () => {
    const { stage } = createStage()
    const keyboardEvent = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
    })
    let received: any

    stage.addEventListener({
      name: "manual-keyboard",
      event: "manual-keyboard",
      callback: (props: any) => {
        received = props
      },
    })

    stage.tools.triggerAction(
      keyboardEvent,
      {
        "manual-keyboard": {
          info: { key: "action-key", pressedKeys: new Set(["Meta"]) },
        },
      },
      {}
    )

    expect(received.originEvent).toBe(keyboardEvent)
    expect(received.e).not.toBeInstanceOf(KeyboardEvent)
    expect(received.e.key).toBe("action-key")
    expect(received.e.ctrlKey).toBeUndefined()
    expect([...received.e.pressedKeys]).toEqual(["Meta"])
    expect(received.e.name).toBe("manual-keyboard")
  })

  it("rejects a native Event used as manual action info", () => {
    const { stage } = createStage()
    const originEvent = new Event("manual-action")

    expect(() =>
      stage.tools.triggerAction(
        originEvent,
        { "manual-action": { info: originEvent } } as any,
        {}
      )
    ).toThrow("Manual action info must be plain action data")
  })

  it("rejects a native Event from another realm as manual action info", () => {
    const { stage } = createStage()
    const iframe = document.createElement("iframe")
    document.body.append(iframe)

    try {
      const foreignEvent = new iframe.contentWindow!.Event("manual-action")
      expect(foreignEvent).not.toBeInstanceOf(Event)
      expect(() =>
        stage.tools.triggerAction(
          foreignEvent,
          { "manual-action": { info: foreignEvent } } as any,
          {}
        )
      ).toThrow("Manual action info must be plain action data")
    } finally {
      iframe.remove()
    }
  })

  it("keeps manually triggered gesture names targetless", () => {
    const { stage } = createStage()
    const names = ["dragstart", "drag", "dragend", "startmove", "move", "moveend"]
    const received: string[] = []

    stage.addEventListener({
      name: "manual-gesture-names",
      event: names,
      callback: ({ e }: any) => {
        received.push(e.name)
      },
    })

    names.forEach((name) => {
      const event = new Event(name)
      stage.tools.triggerAction(event, { [name]: { info: {} } }, {})
    })

    expect(received).toEqual(names)
  })

  it("does not treat a keyboard override named drag as a gesture phase", () => {
    const { stage, top } = createStage()
    let received: any

    stage.registerEvent({ name: "drag", trigger: "keydown" })
    stage.addEventListener({
      name: "keyboard-drag",
      event: "drag",
      callback: ({ e }: any) => {
        received = e
      },
    })

    top.dispatchEvent(new KeyboardEvent("keydown", { key: "d", bubbles: true }))

    expect(received.name).toBe("drag")
    expect(received.key).toBe("d")
    expect(received.target == null).toBe(true)
  })

  it("does not let a manual dragend release an active mouse gesture", () => {
    const { stage, top } = createStage()
    const start = stage.tools.appendChild({
      className: "manual-end-node",
      shape: rectangle(0, 0, 40, 40),
    })
    const received: Array<string | undefined> = []

    stage.addEventListener({
      name: "manual-end-listener",
      event: ["drag", "dragend"],
      selector: ".manual-end-node",
      callback: ({ e }: any) => {
        received.push(e.target?.id)
      },
    })

    top.dispatchEvent(md(10, 10))
    const manualEnd = new Event("dragend")
    stage.tools.triggerAction(
      manualEnd,
      { dragend: { info: {} } },
      {}
    )
    top.dispatchEvent(mm(80, 10))
    top.dispatchEvent(mu(80, 10))

    expect(received).toEqual([undefined, start.id, start.id])
  })

  it("does not capture a gesture owner for a keyboard-only drag override", () => {
    const { stage, top } = createStage()
    let sortCalls = 0

    stage.tools.appendChild({
      className: "keyboard-only-node",
      shape: rectangle(0, 0, 40, 40),
    })
    stage.tools.appendChild({
      className: "keyboard-only-node",
      shape: rectangle(0, 0, 30, 30),
    })

    stage.registerEvent({ name: "dragstart", trigger: "mousedown" })
    stage.registerEvent({ name: "drag", trigger: "keydown" })
    stage.addEventListener({
      name: "keyboard-only-drag",
      event: "drag",
      selector: ".keyboard-only-node",
      sortBy: () => {
        sortCalls++
        return 0
      },
      callback: () => undefined,
    })

    top.dispatchEvent(md(10, 10))

    expect(sortCalls).toBe(0)
  })

  it("merges composeStore synchronously and keeps it isolated by listener", () => {
    const { stage, top } = createStage()
    const seenA: Record<string, unknown>[] = []
    const seenB: Record<string, unknown>[] = []

    stage.addEventListener({
      name: "compose-a",
      event: "mousedown",
      callback: ({ composeStore }: any) => {
        seenA.push({ ...composeStore })
        return {
          mousedown: () => ({ owner: "a", count: (composeStore.count ?? 0) + 1 }),
        }
      },
    })
    stage.addEventListener({
      name: "compose-b",
      event: "mousedown",
      callback: ({ composeStore }: any) => {
        seenB.push({ ...composeStore })
        return {
          mousedown: () => ({ owner: "b", count: (composeStore.count ?? 0) + 1 }),
        }
      },
    })

    top.dispatchEvent(md(10, 10))
    expect(seenA).toEqual([{}])
    expect(seenB).toEqual([{}])

    top.dispatchEvent(md(10, 10))
    expect(seenA).toEqual([{}, { owner: "a", count: 1 }])
    expect(seenB).toEqual([{}, { owner: "b", count: 1 }])
  })
})

// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { KEYBOARRD_EVENTS, MOUSE_EVENTS, Rectangle } from "react-stay-canvas"
import { createStage, md, mm, mu, pc } from "./helpers/stage"

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const holdControl = (target: HTMLCanvasElement) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Control", bubbles: true }))

describe("pointer session lifecycle", () => {
  it("preserves standalone mouseup without duplicating a normal session end", async () => {
    const { stage, top } = createStage()
    let mouseUps = 0

    stage.addEventListener({
      name: "standalone-up",
      event: "mouseup",
      callback: () => { mouseUps++ },
    })

    top.dispatchEvent(mu(20, 20))
    top.dispatchEvent(md(20, 20))
    top.dispatchEvent(mu(20, 20))
    await tick()

    expect(mouseUps).toBe(2)
  })

  it("does not emit normal gesture terminals before movement qualifies", async () => {
    const { stage, top } = createStage()
    let dragEnds = 0
    let moveEnds = 0

    stage.addEventListener({
      name: "no-move-drag",
      event: ["dragstart", "dragend"],
      callback: () => ({
        dragstart: () => undefined,
        dragend: () => { dragEnds++ },
      }),
    })
    stage.addEventListener({
      name: "no-move-pan",
      event: ["startmove", "moveend"],
      callback: () => ({
        startmove: () => undefined,
        moveend: () => { moveEnds++ },
      }),
    })

    top.dispatchEvent(md(20, 20))
    top.dispatchEvent(mu(20, 20))
    holdControl(top)
    top.dispatchEvent(md(30, 30))
    top.dispatchEvent(mu(30, 30))
    await tick()

    expect(dragEnds).toBe(0)
    expect(moveEnds).toBe(0)
  })

  it("ends a pan exactly once when the primary pointer is released outside", async () => {
    const { stage, top, capturedPointers } = createStage()
    let moveCount = 0
    let endCount = 0
    let cancelled: boolean | undefined

    stage.addEventListener({
      name: "pan",
      event: ["startmove", "move", "moveend"],
      callback: ({ e }) => ({
        startmove: () => undefined,
        move: () => { moveCount++ },
        moveend: () => {
          endCount++
          cancelled = e.cancelled
        },
      }),
    })

    holdControl(top)
    top.dispatchEvent(md(40, 40))
    await tick()
    expect(capturedPointers.has(1)).toBe(true)

    top.dispatchEvent(mm(620, 420))
    await tick()
    expect(moveCount).toBe(1)

    window.dispatchEvent(mu(620, 420))
    await tick()
    expect(endCount).toBe(1)
    expect(cancelled).toBe(false)
    expect(capturedPointers.has(1)).toBe(false)

    top.dispatchEvent(mm(80, 80))
    await tick()
    expect(moveCount).toBe(1)
    expect(endCount).toBe(1)
  })

  it("keeps the Child selected at drag start as the gesture owner", async () => {
    const { stage, top } = createStage()
    const first = stage.tools.appendChild({
      id: "first",
      className: "node",
      shape: new Rectangle({ x: 10, y: 10, width: 40, height: 40 }),
    })
    stage.tools.appendChild({
      id: "second",
      className: "node",
      shape: new Rectangle({ x: 100, y: 10, width: 40, height: 40 }),
    })
    const targets: string[] = []

    stage.addEventListener({
      name: "drag-node",
      selector: ".node",
      event: ["dragstart", "drag", "dragend"],
      callback: ({ e }) => ({
        dragstart: () => { targets.push(e.target.id) },
        drag: () => { targets.push(e.target.id) },
        dragend: () => { targets.push(e.target.id) },
      }),
    })

    top.dispatchEvent(md(20, 20))
    await tick()
    top.dispatchEvent(mm(110, 20))
    await tick()
    window.dispatchEvent(mu(600, 20))
    await tick()

    expect(targets).toEqual([first.id, first.id, first.id])
  })

  it("retains the start target for a listener that only consumes later drag phases", async () => {
    const { stage, top } = createStage()
    const first = stage.tools.appendChild({
      id: "first-late-listener",
      className: "node",
      shape: new Rectangle({ x: 10, y: 10, width: 40, height: 40 }),
    })
    stage.tools.appendChild({
      id: "second-late-listener",
      className: "node",
      shape: new Rectangle({ x: 100, y: 10, width: 40, height: 40 }),
    })
    const targets: string[] = []

    stage.addEventListener({
      name: "late-drag-listener",
      selector: ".node",
      event: ["drag", "dragend"],
      callback: ({ e }) => ({
        drag: () => { targets.push(e.target.id) },
        dragend: () => { targets.push(e.target.id) },
      }),
    })

    top.dispatchEvent(md(20, 20))
    await tick()
    top.dispatchEvent(mm(110, 20))
    await tick()
    window.dispatchEvent(mu(600, 20))
    await tick()

    expect(targets).toEqual([first.id, first.id])
  })

  it("does not acquire a gesture owner after the start point missed the selector", async () => {
    const { stage, top } = createStage()
    stage.tools.appendChild({
      id: "late-node",
      className: "node",
      shape: new Rectangle({ x: 100, y: 10, width: 40, height: 40 }),
    })
    const targets: string[] = []

    stage.addEventListener({
      name: "no-late-owner",
      selector: ".node",
      event: ["drag", "dragend"],
      callback: ({ e }) => ({
        drag: () => { targets.push(e.target.id) },
        dragend: () => { targets.push(e.target.id) },
      }),
    })

    top.dispatchEvent(md(20, 100))
    top.dispatchEvent(mm(110, 20))
    window.dispatchEvent(mu(110, 20))
    await tick()

    expect(targets).toEqual([])
  })

  it("records no-owner before state filtering when a listener activates mid-gesture", async () => {
    const { stage, top } = createStage()
    stage.tools.appendChild({
      id: "state-start-node",
      className: "node",
      shape: new Rectangle({ x: 10, y: 10, width: 40, height: 40 }),
    })
    stage.tools.appendChild({
      id: "state-late-node",
      className: "node",
      shape: new Rectangle({ x: 100, y: 10, width: 40, height: 40 }),
    })
    let drags = 0
    let targetConditionCalls = 0

    stage.registerEvent({
      name: "dragstart",
      trigger: MOUSE_EVENTS.MOUSE_DOWN,
      withTargetConditionCallback: () => {
        targetConditionCalls++
        return true
      },
      successCallback: () => [
        {
          name: "drag",
          trigger: MOUSE_EVENTS.MOUSE_MOVE,
          conditionCallback: ({ e }) => e.pressedKeys.has("mouse0"),
        },
        { name: "dragend", trigger: MOUSE_EVENTS.MOUSE_UP },
      ],
    })
    stage.addEventListener({
      name: "state-late-drag",
      state: "active",
      selector: ".node",
      event: "drag",
      callback: () => ({ drag: () => { drags++ } }),
    })

    top.dispatchEvent(md(20, 20))
    stage.tools.switchState("active")
    top.dispatchEvent(mm(110, 20))
    top.dispatchEvent(mu(110, 20))
    await tick()

    expect(targetConditionCalls).toBe(0)
    expect(drags).toBe(0)
  })

  it("still evaluates a continuation target condition against the retained owner", async () => {
    const { stage, top } = createStage()
    stage.tools.appendChild({
      id: "conditioned-node",
      className: "node",
      shape: new Rectangle({ x: 10, y: 10, width: 80, height: 80 }),
    })
    let allowDrag = false
    let dragCount = 0

    stage.registerEvent({
      name: "dragstart",
      trigger: MOUSE_EVENTS.MOUSE_DOWN,
      successCallback: () => [
        {
          name: "drag",
          trigger: MOUSE_EVENTS.MOUSE_MOVE,
          conditionCallback: ({ e }) => e.pressedKeys.has("mouse0"),
          withTargetConditionCallback: () => allowDrag,
        },
        {
          name: "dragend",
          trigger: MOUSE_EVENTS.MOUSE_UP,
        },
      ],
    })
    stage.addEventListener({
      name: "conditioned-drag",
      selector: ".node",
      event: ["dragstart", "drag", "dragend"],
      callback: () => ({
        dragstart: () => undefined,
        drag: () => { dragCount++ },
        dragend: () => undefined,
      }),
    })

    top.dispatchEvent(md(20, 20))
    top.dispatchEvent(mm(40, 40))
    await tick()
    expect(dragCount).toBe(0)

    allowDrag = true
    top.dispatchEvent(mm(60, 60))
    window.dispatchEvent(mu(60, 60))
    await tick()
    expect(dragCount).toBe(1)
  })

  it("turns pointercancel into one cancelled terminal callback", async () => {
    const { stage, top, capturedPointers } = createStage()
    const endings: Array<{ cancelled?: boolean; reason?: string }> = []

    stage.addEventListener({
      name: "pan",
      event: ["startmove", "move", "moveend"],
      callback: ({ e }) => ({
        startmove: () => undefined,
        move: () => undefined,
        moveend: () => endings.push({ cancelled: e.cancelled, reason: e.cancelReason }),
      }),
    })

    holdControl(top)
    top.dispatchEvent(md(40, 40))
    await tick()
    top.dispatchEvent(mm(80, 80))
    await tick()
    top.dispatchEvent(pc(80, 80))
    await tick()
    top.dispatchEvent(new PointerEvent("lostpointercapture", {
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      bubbles: true,
    }))
    await tick()

    expect(endings).toEqual([{ cancelled: true, reason: "pointercancel" }])
    expect(capturedPointers.has(1)).toBe(false)
  })

  it("cancels an active gesture when the window loses focus", async () => {
    const { stage, top } = createStage()
    const reasons: Array<string | undefined> = []

    stage.addEventListener({
      name: "pan",
      event: ["startmove", "move", "moveend"],
      callback: ({ e }) => ({
        startmove: () => undefined,
        move: () => undefined,
        moveend: () => reasons.push(e.cancelReason),
      }),
    })

    holdControl(top)
    top.dispatchEvent(md(30, 30))
    await tick()
    window.dispatchEvent(new Event("blur"))
    await tick()

    expect(reasons).toEqual(["blur"])
  })

  it("does not delete keyboard-created dynamic events when a pointer session ends", async () => {
    const { stage, top } = createStage()
    let laterKeyUps = 0

    stage.registerEvent({
      name: "arm-later-keyup",
      trigger: KEYBOARRD_EVENTS.KEY_DOWN,
      conditionCallback: ({ e }) => e.key === "k",
      successCallback: () => ({
        name: "later-keyup",
        trigger: KEYBOARRD_EVENTS.KEY_UP,
      }),
    })
    stage.addEventListener({
      name: "observe-later-keyup",
      event: "later-keyup",
      callback: () => { laterKeyUps++ },
    })

    top.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }))
    top.dispatchEvent(md(20, 20))
    window.dispatchEvent(mu(20, 20))
    top.dispatchEvent(new KeyboardEvent("keyup", { key: "k", bubbles: true }))
    await tick()

    expect(laterKeyUps).toBe(1)
  })

  it("does not treat a non-gesture event returned by pointerdown as session-owned", async () => {
    const { stage, top } = createStage()
    let laterKeyUps = 0

    stage.registerEvent({
      name: "arm-keyup-from-pointer",
      trigger: MOUSE_EVENTS.MOUSE_DOWN,
      successCallback: () => ({
        name: "keyup-from-pointer",
        trigger: KEYBOARRD_EVENTS.KEY_UP,
      }),
    })
    stage.addEventListener({
      name: "observe-keyup-from-pointer",
      event: "keyup-from-pointer",
      callback: () => { laterKeyUps++ },
    })

    top.dispatchEvent(md(20, 20))
    window.dispatchEvent(mu(20, 20))
    top.dispatchEvent(new KeyboardEvent("keyup", { key: "k", bubbles: true }))
    await tick()

    expect(laterKeyUps).toBe(1)
  })

  it("keeps a dynamic event returned by a pointerup callback", async () => {
    const { stage, top } = createStage()
    let laterMoves = 0

    stage.registerEvent({
      name: "arm-later-move",
      trigger: MOUSE_EVENTS.MOUSE_UP,
      successCallback: () => ({
        name: "later-move",
        trigger: MOUSE_EVENTS.MOUSE_MOVE,
      }),
    })
    stage.addEventListener({
      name: "observe-later-move",
      event: "later-move",
      callback: () => { laterMoves++ },
    })

    top.dispatchEvent(md(20, 20))
    window.dispatchEvent(mu(20, 20))
    top.dispatchEvent(mm(30, 30))
    await tick()

    expect(laterMoves).toBe(1)
  })

  it("keeps non-gesture pointer chains outside session cleanup", async () => {
    const { stage, top } = createStage()
    let laterMoves = 0
    let laterUps = 0

    stage.registerEvent({
      name: "arm-non-gesture-chain",
      trigger: MOUSE_EVENTS.MOUSE_DOWN,
      successCallback: () => [
        { name: "later-hover", trigger: MOUSE_EVENTS.MOUSE_MOVE },
        { name: "later-up", trigger: MOUSE_EVENTS.MOUSE_UP },
      ],
    })
    stage.addEventListener({
      name: "observe-non-gesture-chain",
      event: ["later-hover", "later-up"],
      callback: () => ({
        "later-hover": () => { laterMoves++ },
        "later-up": () => { laterUps++ },
      }),
    })

    top.dispatchEvent(md(20, 20))
    top.dispatchEvent(pc(20, 20))
    await tick()
    expect(laterUps).toBe(0)

    top.dispatchEvent(mm(30, 30))
    top.dispatchEvent(mu(30, 30))
    await tick()

    expect(laterMoves).toBe(1)
    expect(laterUps).toBe(1)
  })

  it("clears click pairing when a pointer session is cancelled", async () => {
    const { stage, top } = createStage()
    let clicks = 0

    stage.addEventListener({
      name: "no-click-after-cancel",
      event: "click",
      callback: () => { clicks++ },
    })

    top.dispatchEvent(md(20, 20))
    top.dispatchEvent(pc(20, 20))
    top.dispatchEvent(mu(20, 20))
    await tick()

    expect(clicks).toBe(0)
    expect(stage.store.has("lastMouseDownPosition")).toBe(false)
    expect(stage.store.has("laseMouseDownTime")).toBe(false)
  })

  it("clears every pressed mouse button when a chord is cancelled", async () => {
    const { stage, top } = createStage()

    top.dispatchEvent(md(20, 20))
    top.dispatchEvent(new PointerEvent("pointermove", {
      clientX: 30,
      clientY: 30,
      button: 2,
      buttons: 3,
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    }))
    expect(stage.eventDispatcher.currentPressedKeys.mouse0).toBe(true)
    expect(stage.eventDispatcher.currentPressedKeys.mouse2).toBe(true)

    top.dispatchEvent(pc(30, 30))
    await tick()

    expect(stage.eventDispatcher.currentPressedKeys.mouse0).toBeUndefined()
    expect(stage.eventDispatcher.currentPressedKeys.mouse2).toBeUndefined()
  })

  it("records no gesture owner when the start target condition rejects the hit", async () => {
    const { stage, top } = createStage()
    stage.tools.appendChild({
      id: "rejected-start-node",
      className: "node",
      shape: new Rectangle({ x: 10, y: 10, width: 80, height: 80 }),
    })
    let starts = 0
    let drags = 0

    stage.registerEvent({
      name: "dragstart",
      trigger: MOUSE_EVENTS.MOUSE_DOWN,
      withTargetConditionCallback: () => false,
      successCallback: () => [
        {
          name: "drag",
          trigger: MOUSE_EVENTS.MOUSE_MOVE,
          conditionCallback: ({ e }) => e.pressedKeys.has("mouse0"),
        },
        { name: "dragend", trigger: MOUSE_EVENTS.MOUSE_UP },
      ],
    })
    stage.addEventListener({
      name: "reject-start-target",
      selector: ".node",
      event: ["dragstart", "drag"],
      callback: () => ({
        dragstart: () => { starts++ },
        drag: () => { drags++ },
      }),
    })

    top.dispatchEvent(md(20, 20))
    top.dispatchEvent(mm(50, 50))
    top.dispatchEvent(mu(50, 50))
    await tick()

    expect(starts).toBe(0)
    expect(drags).toBe(0)
  })

  it("cleans the pointer session even when a terminal listener throws", () => {
    const { stage, top, capturedPointers } = createStage()

    stage.addEventListener({
      name: "throwing-pan-end",
      event: ["startmove", "move", "moveend"],
      callback: () => ({
        startmove: () => undefined,
        move: () => undefined,
        moveend: () => { throw new Error("terminal failed") },
      }),
    })

    holdControl(top)
    top.dispatchEvent(md(20, 20))
    top.dispatchEvent(mm(60, 60))

    expect(() => (stage.eventDispatcher as any).finishPointerSession(mu(60, 60), false))
      .toThrow("terminal failed")
    expect(capturedPointers.has(1)).toBe(false)
    expect((stage.eventDispatcher as any).activePointer).toBeUndefined()
    expect((stage.eventDispatcher as any).pointerSessionEventNames.size).toBe(0)
    expect(stage.gestureTargets.size).toBe(0)
  })

  it("ends a mouse session when its initiating button is released during a chord", async () => {
    const { stage, top } = createStage()
    let moveCount = 0
    let endCount = 0

    stage.addEventListener({
      name: "chord-pan",
      event: ["startmove", "move", "moveend"],
      callback: ({ originEvent }) => ({
        startmove: () => { originEvent.preventDefault() },
        move: () => { moveCount++ },
        moveend: () => { endCount++ },
      }),
    })

    holdControl(top)
    top.dispatchEvent(md(20, 20))
    top.dispatchEvent(new PointerEvent("pointermove", {
      clientX: 40,
      clientY: 40,
      button: 2,
      buttons: 3,
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    }))
    await tick()

    expect(stage.eventDispatcher.currentPressedKeys.mouse0).toBe(true)
    expect(stage.eventDispatcher.currentPressedKeys.mouse2).toBe(true)
    expect(moveCount).toBe(1)

    top.dispatchEvent(new PointerEvent("pointermove", {
      clientX: 60,
      clientY: 60,
      button: 0,
      buttons: 2,
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    }))
    await tick()

    expect(stage.eventDispatcher.currentPressedKeys.mouse0).toBe(false)
    expect(stage.eventDispatcher.currentPressedKeys.mouse2).toBe(true)
    expect(endCount).toBe(1)

    top.dispatchEvent(new PointerEvent("pointermove", {
      clientX: 80,
      clientY: 80,
      button: -1,
      buttons: 2,
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    }))
    window.dispatchEvent(new PointerEvent("pointerup", {
      clientX: 80,
      clientY: 80,
      button: 2,
      buttons: 0,
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    }))
    await tick()

    expect(moveCount).toBe(1)
    expect(endCount).toBe(1)
    expect(stage.eventDispatcher.currentPressedKeys.mouse2).toBe(false)
  })

  it("cancels an active gesture when the document becomes hidden", async () => {
    const { stage, top } = createStage()
    const reasons: Array<string | undefined> = []
    const originalVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState")

    stage.addEventListener({
      name: "pan",
      event: ["startmove", "move", "moveend"],
      callback: ({ e }) => ({
        startmove: () => undefined,
        move: () => undefined,
        moveend: () => reasons.push(e.cancelReason),
      }),
    })

    holdControl(top)
    top.dispatchEvent(md(30, 30))
    await tick()
    top.dispatchEvent(mm(70, 70))
    await tick()

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    })
    document.dispatchEvent(new Event("visibilitychange"))
    await tick()

    expect(reasons).toEqual(["visibilitychange"])

    if (originalVisibility) {
      Object.defineProperty(document, "visibilityState", originalVisibility)
    } else {
      delete (document as Document & { visibilityState?: string }).visibilityState
    }
  })

  it("isolates simultaneous Canvas instances", async () => {
    const first = createStage()
    const second = createStage()
    let firstEnds = 0
    let secondEnds = 0

    first.stage.addEventListener({
      name: "first-pan",
      event: ["startmove", "move", "moveend"],
      callback: () => ({
        startmove: () => undefined,
        move: () => undefined,
        moveend: () => { firstEnds++ },
      }),
    })
    second.stage.addEventListener({
      name: "second-pan",
      event: ["startmove", "move", "moveend"],
      callback: () => ({
        startmove: () => undefined,
        move: () => undefined,
        moveend: () => { secondEnds++ },
      }),
    })

    holdControl(first.top)
    first.top.dispatchEvent(md(20, 20))
    await tick()
    first.top.dispatchEvent(mm(70, 70))
    await tick()
    window.dispatchEvent(mu(600, 400))
    await tick()

    expect(firstEnds).toBe(1)
    expect(secondEnds).toBe(0)

    first.stage.destroy()
    second.stage.destroy()
  })

  it("releases capture and listeners silently on destroy", async () => {
    const { stage, top, capturedPointers } = createStage()
    let endCount = 0

    stage.addEventListener({
      name: "pan",
      event: ["startmove", "move", "moveend"],
      callback: () => ({
        startmove: () => undefined,
        move: () => undefined,
        moveend: () => { endCount++ },
      }),
    })

    holdControl(top)
    top.dispatchEvent(md(20, 20))
    await tick()
    top.dispatchEvent(mm(70, 70))
    await tick()
    stage.destroy()

    expect(capturedPointers.has(1)).toBe(false)
    window.dispatchEvent(mu(600, 400))
    await tick()
    expect(endCount).toBe(0)
  })
})

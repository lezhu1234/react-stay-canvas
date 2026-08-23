// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { EventProps, ListenerProps } from "react-stay-canvas"
import { MOUSE_EVENTS, Rectangle } from "react-stay-canvas"
import { PointerSession } from "../src/stay/events/input/pointerSession"
import { PressedInputState } from "../src/stay/events/input/pressedInputState"
import { createStage } from "./helpers/stage"
import { installPointerEvents, pointer } from "./helpers/pointer"

let restorePointerEvents: () => void

beforeEach(() => {
  restorePointerEvents = installPointerEvents()
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  })
})

afterEach(() => {
  restorePointerEvents()
})

describe("pointer session lifecycle", () => {
  it("ends an outside release exactly once and does not keep dragging on return", () => {
    const { stage, top } = createStage()
    const capture = vi.fn()
    const releaseCapture = vi.fn()
    ;(top as any).setPointerCapture = capture
    ;(top as any).hasPointerCapture = () => true
    ;(top as any).releasePointerCapture = releaseCapture
    const phases: string[] = []
    const terminal: Array<{
      x?: number
      pressed: string[]
      cancelled?: boolean
      pointerId?: number
      pointerType?: string
    }> = []

    stage.addEventListener({
      name: "drag-root",
      event: ["dragstart", "drag", "dragend"],
      callback: ({ e }) => {
        phases.push(e.name)
        if (e.name === "dragend") {
          terminal.push({
            x: e.x,
            pressed: [...e.pressedKeys],
            cancelled: e.cancelled,
            pointerId: e.pointerId,
            pointerType: e.pointerType,
          })
        }
      },
    })

    top.dispatchEvent(pointer("pointerdown", 20, 20, { button: 0, buttons: 1 }))
    top.dispatchEvent(pointer("pointermove", 50, 20, { buttons: 1 }))
    window.dispatchEvent(pointer("pointerup", 620, 20, { button: 0, buttons: 0 }))
    top.dispatchEvent(pointer("pointermove", 80, 20, { buttons: 0 }))

    expect(phases).toEqual(["dragstart", "drag", "dragend"])
    expect(terminal).toEqual([{
      x: 620,
      pressed: [],
      cancelled: false,
      pointerId: 1,
      pointerType: "mouse",
    }])
    expect(capture).toHaveBeenCalledWith(1)
    expect(releaseCapture).toHaveBeenCalledWith(1)
  })

  it("dispatches an inside release at the Canvas target phase", () => {
    const { stage, top } = createStage()
    let observed: {
      currentTarget: EventTarget | null
      phase: number
      type: string
    } | undefined

    stage.addEventListener({
      name: "inside-release",
      event: "mouseup",
      callback: ({ originEvent }) => {
        observed = {
          currentTarget: originEvent.currentTarget,
          phase: originEvent.eventPhase,
          type: originEvent.type,
        }
      },
    })

    top.dispatchEvent(pointer("pointerdown", 20, 20, { button: 0, buttons: 1 }))
    top.dispatchEvent(pointer("pointerup", 20, 20, { button: 0, buttons: 0 }))

    expect(observed).toEqual({
      currentTarget: top,
      phase: Event.AT_TARGET,
      type: "pointerup",
    })
  })

  it("keeps a click as a click without emitting a zero-movement gesture end", () => {
    const { stage, top } = createStage()
    const phases: string[] = []

    stage.addEventListener({
      name: "click-observer",
      event: ["click", "dragend", "moveend"],
      callback: ({ e }) => phases.push(e.name),
    })

    top.dispatchEvent(pointer("pointerdown", 20, 20, { button: 0, buttons: 1 }))
    top.dispatchEvent(pointer("pointerup", 20, 20, { button: 0, buttons: 0 }))

    expect(phases).toEqual(["click"])
  })

  it("retains the start Child for an outside terminal phase", () => {
    const { stage, top } = createStage()
    const child = stage.tools.appendChild({
      className: "owner",
      shape: new Rectangle({ x: 0, y: 0, width: 40, height: 40 }),
    })
    const targets: string[] = []

    stage.addEventListener({
      name: "owned-drag",
      selector: ".owner",
      event: ["drag", "dragend"],
      callback: ({ e }) => {
        if (e.target) targets.push(e.target.id)
      },
    })

    top.dispatchEvent(pointer("pointerdown", 10, 10, { button: 0, buttons: 1 }))
    top.dispatchEvent(pointer("pointermove", 30, 10, { buttons: 1 }))
    window.dispatchEvent(pointer("pointerup", 700, 10, { button: 0, buttons: 0 }))

    expect(targets).toEqual([child.id, child.id])
  })

  it("turns pointercancel into one cancelled terminal and leaves a later raw up standalone", () => {
    const { stage, top } = createStage()
    const observed: Array<{ name: string; reason?: string }> = []

    stage.addEventListener({
      name: "terminal-observer",
      event: ["dragend", "click", "mouseup"],
      callback: ({ e }) => observed.push({ name: e.name, reason: e.cancelReason }),
    })

    top.dispatchEvent(pointer("pointerdown", 10, 10, { button: 0, buttons: 1 }))
    top.dispatchEvent(pointer("pointercancel", 12, 10, { button: 0, buttons: 0 }))
    top.dispatchEvent(pointer("pointercancel", 12, 10, { button: 0, buttons: 0 }))

    expect(observed).toEqual([{ name: "dragend", reason: "pointercancel" }])

    top.dispatchEvent(pointer("pointerup", 12, 10, { button: 0, buttons: 0 }))

    expect(observed).toEqual([
      { name: "dragend", reason: "pointercancel" },
      { name: "mouseup", reason: undefined },
    ])
  })

  it("cancels on blur and clears pressed pointer and keyboard state", () => {
    const { stage, top } = createStage()
    const terminalPressed: string[][] = []
    const laterPressed: string[][] = []

    stage.addEventListener({
      name: "blur-terminal",
      event: "dragend",
      callback: ({ e }) => terminalPressed.push([...e.pressedKeys]),
    })
    stage.addEventListener({
      name: "later-key",
      event: "keydown",
      callback: ({ e }) => laterPressed.push([...e.pressedKeys]),
    })

    top.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }))
    top.dispatchEvent(pointer("pointerdown", 10, 10, { button: 0, buttons: 1 }))
    window.dispatchEvent(new Event("blur"))
    laterPressed.length = 0
    top.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }))

    expect(terminalPressed).toEqual([[]])
    expect(laterPressed).toEqual([["x"]])
  })

  it("ignores a fallback session started synchronously during cancellation", () => {
    restorePointerEvents()
    restorePointerEvents = () => {}
    const { stage, top } = createStage()
    const received: string[] = []
    let restarted = false

    stage.addEventListener({
      name: "blur-reentry",
      event: ["drag", "dragend"],
      callback: ({ e }) => {
        received.push(e.name)
        if (e.name !== "dragend" || restarted) return
        restarted = true
        top.dispatchEvent(new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 10,
          clientY: 10,
        }))
      },
    })

    top.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      clientX: 10,
      clientY: 10,
    }))
    top.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      buttons: 1,
      clientX: 30,
      clientY: 10,
    }))
    window.dispatchEvent(new Event("blur"))
    top.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      buttons: 1,
      clientX: 35,
      clientY: 10,
    }))

    expect(received).toEqual(["drag", "dragend"])

    top.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      clientX: 10,
      clientY: 10,
    }))
    top.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      buttons: 1,
      clientX: 35,
      clientY: 10,
    }))
    window.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      button: 0,
      clientX: 35,
      clientY: 10,
    }))

    expect(received).toEqual(["drag", "dragend", "drag", "dragend"])
  })

  it("reconciles an outside keyup without dispatching a Canvas key action", () => {
    const { stage, top } = createStage()
    const observed: Array<{ name: string; pressed: string[] }> = []

    stage.addEventListener({
      name: "keyboard-reconciliation",
      event: ["keydown", "keyup"],
      callback: ({ e }) => {
        observed.push({ name: e.name, pressed: [...e.pressedKeys] })
      },
    })

    top.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }))
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "x" }))
    top.dispatchEvent(new KeyboardEvent("keydown", { key: "y", bubbles: true }))

    expect(observed).toEqual([
      { name: "keydown", pressed: ["x"] },
      { name: "keydown", pressed: ["y"] },
    ])
  })

  it("uses PointerEvent.buttons to finish the initiating button in a mouse chord", () => {
    const { stage, top } = createStage()
    const terminalPressed: string[][] = []
    const rawMoves: string[] = []
    const rawUps: string[] = []

    stage.addEventListener({
      name: "chord-terminal",
      event: ["mousemove", "mouseup", "dragend"],
      callback: ({ e }) => {
        if (e.name === "mousemove") rawMoves.push(e.name)
        if (e.name === "mouseup") rawUps.push(e.name)
        if (e.name === "dragend") terminalPressed.push([...e.pressedKeys])
      },
    })

    top.dispatchEvent(pointer("pointerdown", 10, 10, { button: 0, buttons: 1 }))
    top.dispatchEvent(pointer("pointermove", 30, 10, { buttons: 3 }))
    top.dispatchEvent(pointer("pointermove", 35, 10, { buttons: 2 }))
    top.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      button: 0,
      buttons: 2,
      clientX: 35,
      clientY: 10,
    }))

    expect(terminalPressed).toEqual([["mouse2"]])
    expect(rawMoves).toEqual(["mousemove"])
    expect(rawUps).toEqual(["mouseup"])
  })

  it("does not turn a later chord-button pointerup into a click", () => {
    const { stage, top } = createStage()
    const observed: string[] = []

    stage.addEventListener({
      name: "chord-click",
      event: ["click", "mouseup"],
      callback: ({ e }) => observed.push(e.name),
    })

    top.dispatchEvent(pointer("pointerdown", 10, 10, { button: 0, buttons: 1 }))
    top.dispatchEvent(pointer("pointerup", 10, 10, { button: 2, buttons: 0 }))

    expect(observed).toEqual(["mouseup"])
  })

  it("keeps every mouse-chord button action public without restarting the gesture", () => {
    const { stage, top } = createStage()
    const raw: Array<{ name: string; type: string; button: number }> = []
    const gesture: string[] = []

    stage.addEventListener({
      name: "raw-chord",
      event: ["mousedown", "mouseup"],
      callback: ({ e, originEvent }) => {
        raw.push({
          name: e.name,
          type: originEvent.type,
          button: (originEvent as MouseEvent).button,
        })
      },
    })
    stage.addEventListener({
      name: "gesture-chord",
      event: ["dragstart", "dragend"],
      callback: ({ e }) => gesture.push(e.name),
    })

    top.dispatchEvent(pointer("pointerdown", 10, 10, { button: 0, buttons: 1 }))
    top.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      clientX: 10,
      clientY: 10,
    }))
    top.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 2,
      clientX: 10,
      clientY: 10,
    }))
    top.dispatchEvent(pointer("pointermove", 30, 10, { buttons: 3 }))
    top.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      button: 2,
      clientX: 30,
      clientY: 10,
    }))
    top.dispatchEvent(pointer("pointerup", 30, 10, { button: 0, buttons: 0 }))
    top.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      button: 0,
      clientX: 30,
      clientY: 10,
    }))

    expect(raw).toEqual([
      { name: "mousedown", type: "pointerdown", button: 0 },
      { name: "mousedown", type: "mousedown", button: 2 },
      { name: "mouseup", type: "mouseup", button: 2 },
      { name: "mouseup", type: "pointerup", button: 0 },
    ])
    expect(gesture).toEqual(["dragstart", "dragend"])
  })

  it("reconciles the last chord button after the session ended outside", () => {
    const { stage, top } = createStage()
    const enteredWith: string[][] = []

    stage.addEventListener({
      name: "chord-reentry-state",
      event: "mouseenter",
      callback: ({ e }) => enteredWith.push([...e.pressedKeys]),
    })

    top.dispatchEvent(pointer("pointerdown", 10, 10, { button: 0, buttons: 1 }))
    top.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 2,
      buttons: 3,
      clientX: 20,
      clientY: 10,
    }))
    window.dispatchEvent(new MouseEvent("mouseup", {
      button: 0,
      buttons: 2,
      clientX: 600,
      clientY: 10,
    }))
    window.dispatchEvent(pointer("pointerup", 600, 10, {
      button: 2,
      buttons: 0,
    }))
    window.dispatchEvent(new MouseEvent("mouseup", {
      button: 2,
      buttons: 0,
      clientX: 600,
      clientY: 10,
    }))
    top.dispatchEvent(new MouseEvent("mouseenter", {
      clientX: 10,
      clientY: 10,
    }))

    expect(enteredWith).toEqual([[]])
  })

  it("does not let a compatibility mouseup end an active pen session", () => {
    const { stage, top } = createStage()
    const phases: string[] = []

    stage.addEventListener({
      name: "pen-drag",
      event: ["drag", "dragend"],
      callback: ({ e }) => phases.push(e.name),
    })

    top.dispatchEvent(pointer("pointerdown", 10, 10, {
      button: 0,
      buttons: 1,
      pointerId: 7,
      pointerType: "pen",
    }))
    top.dispatchEvent(pointer("pointermove", 30, 10, {
      buttons: 1,
      pointerId: 7,
      pointerType: "pen",
    }))
    window.dispatchEvent(new MouseEvent("mouseup", { button: 0 }))
    top.dispatchEvent(pointer("pointermove", 40, 10, {
      buttons: 1,
      pointerId: 7,
      pointerType: "pen",
    }))
    window.dispatchEvent(pointer("pointerup", 40, 10, {
      button: 0,
      buttons: 0,
      pointerId: 7,
      pointerType: "pen",
    }))

    expect(phases).toEqual(["drag", "drag", "dragend"])
  })

  it("does not let a different pointer mutate the active session buttons", () => {
    const target = document.createElement("canvas")
    const pressedState = new PressedInputState()
    const session = new PointerSession(target, pressedState, vi.fn())

    session.pointerDown(pointer("pointerdown", 10, 10, {
      button: 0,
      buttons: 1,
      pointerId: 7,
    }))
    session.pointerUp(pointer("pointerup", 20, 10, {
      button: 0,
      buttons: 0,
      pointerId: 8,
    }))

    expect([...pressedState.snapshot()]).toEqual(["mouse0"])

    session.pointerUp(pointer("pointerup", 20, 10, {
      button: 0,
      buttons: 0,
      pointerId: 7,
    }))
    expect([...pressedState.snapshot()]).toEqual([])
  })

  it("uses unexpected lostpointercapture and document hiding as cancellation paths", () => {
    const { stage, top } = createStage()
    const reasons: Array<string | undefined> = []

    stage.addEventListener({
      name: "cancel-reasons",
      event: "dragend",
      callback: ({ e }) => reasons.push(e.cancelReason),
    })

    top.dispatchEvent(pointer("pointerdown", 10, 10, { button: 0, buttons: 1 }))
    top.dispatchEvent(pointer("lostpointercapture", 10, 10, { buttons: 1 }))

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    })
    top.dispatchEvent(pointer("pointerdown", 10, 10, { button: 0, buttons: 1, pointerId: 2 }))
    document.dispatchEvent(new Event("visibilitychange"))

    expect(reasons).toEqual(["lostpointercapture", "visibilitychange"])
  })

  it("treats capture loss after button release as a non-cancelled terminal", () => {
    const { stage, top } = createStage()
    const terminal: Array<{
      cancelled?: boolean
      origin: string
      reason?: string
    }> = []

    stage.addEventListener({
      name: "capture-release",
      event: "dragend",
      callback: ({ e, originEvent }) => terminal.push({
        cancelled: e.cancelled,
        origin: originEvent.type,
        reason: e.cancelReason,
      }),
    })

    top.dispatchEvent(pointer("pointerdown", 10, 10, { button: 0, buttons: 1 }))
    top.dispatchEvent(pointer("pointermove", 40, 30, { buttons: 1 }))
    top.dispatchEvent(pointer("lostpointercapture", 40, 30, { buttons: 0 }))

    expect(terminal).toEqual([{
      cancelled: false,
      origin: "lostpointercapture",
      reason: undefined,
    }])
  })

  it("falls back to window mouseup when Pointer Events are unavailable", () => {
    restorePointerEvents()
    restorePointerEvents = () => {}
    const { stage, top } = createStage()
    let ends = 0

    stage.addEventListener({
      name: "fallback-drag",
      event: "dragend",
      callback: () => ends++,
    })

    top.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      clientX: 10,
      clientY: 10,
    }))
    top.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      clientX: 30,
      clientY: 10,
    }))
    window.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      button: 0,
      clientX: 600,
      clientY: 10,
    }))

    expect(ends).toBe(1)
  })

  it("keeps a fallback mouse session until its initiating button ends", () => {
    restorePointerEvents()
    restorePointerEvents = () => {}
    const { stage, top } = createStage()
    const terminalPressed: string[][] = []

    stage.addEventListener({
      name: "fallback-chord",
      event: "dragend",
      callback: ({ e }) => terminalPressed.push([...e.pressedKeys]),
    })

    top.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 10, clientY: 10 }))
    top.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 30, clientY: 10 }))
    top.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 2, clientX: 30, clientY: 10 }))
    top.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 2, clientX: 30, clientY: 10 }))
    expect(terminalPressed).toEqual([])

    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, clientX: 30, clientY: 10 }))
    expect(terminalPressed).toEqual([[]])
  })

  it("reconciles a fallback chord after the session ended outside", () => {
    restorePointerEvents()
    restorePointerEvents = () => {}
    const { stage, top } = createStage()
    const enteredWith: string[][] = []

    stage.addEventListener({
      name: "fallback-chord-reentry",
      event: "mouseenter",
      callback: ({ e }) => enteredWith.push([...e.pressedKeys]),
    })

    top.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      clientX: 10,
      clientY: 10,
    }))
    top.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 2,
      clientX: 20,
      clientY: 10,
    }))
    window.dispatchEvent(new MouseEvent("mouseup", {
      button: 0,
      clientX: 600,
      clientY: 10,
    }))
    window.dispatchEvent(new MouseEvent("mouseup", {
      button: 2,
      clientX: 600,
      clientY: 10,
    }))
    top.dispatchEvent(new MouseEvent("mouseenter", {
      clientX: 10,
      clientY: 10,
    }))

    expect(enteredWith).toEqual([[]])
  })

  it("preserves a standalone release that did not follow cancellation", () => {
    const { stage, top } = createStage()
    let mouseups = 0

    stage.addEventListener({
      name: "standalone-up",
      event: "mouseup",
      callback: () => mouseups++,
    })

    top.dispatchEvent(pointer("pointerup", 20, 20, {
      button: 0,
      buttons: 0,
      pointerId: 9,
    }))

    expect(mouseups).toBe(1)
  })

  it("cleans the active session and releases capture when terminal dispatch throws", () => {
    const target = document.createElement("canvas")
    const releaseCapture = vi.fn()
    ;(target as any).setPointerCapture = vi.fn()
    ;(target as any).hasPointerCapture = () => true
    ;(target as any).releasePointerCapture = releaseCapture
    const pressedState = new PressedInputState()
    const session = new PointerSession(target, pressedState, (input) => {
      const phase = input.sessionTransition?.phase
      if (phase === "end" || phase === "cancel") throw new Error("terminal failed")
    })

    session.pointerDown(pointer("pointerdown", 10, 10, { button: 0, buttons: 1 }))
    expect(() => session.cancel(new Event("blur"), "pointercancel")).toThrow("terminal failed")
    expect([...pressedState.snapshot()]).toEqual([])
    expect(releaseCapture).toHaveBeenCalledWith(1)

    session.pointerDown(pointer("pointerdown", 20, 20, {
      button: 0,
      buttons: 1,
      pointerId: 2,
    }))
    expect([...pressedState.snapshot()]).toEqual(["mouse0"])
  })

  it("uses the real cancellation event and the last pointer sample", () => {
    const { stage, top } = createStage()
    const cause = new Event("blur")
    let terminal: {
      type: string
      sameCause: boolean
      point?: { x: number; y: number }
      reason?: string
    } | undefined

    stage.addEventListener({
      name: "blur-cause",
      event: "dragend",
      callback: ({ e, originEvent }) => {
        terminal = {
          type: originEvent.type,
          sameCause: originEvent === cause,
          point: e.point,
          reason: e.cancelReason,
        }
      },
    })

    top.dispatchEvent(pointer("pointerdown", 10, 10, { button: 0, buttons: 1 }))
    top.dispatchEvent(pointer("pointermove", 35, 22, { buttons: 1 }))
    window.dispatchEvent(cause)

    expect(terminal).toEqual({
      type: "blur",
      sameCause: true,
      point: { x: 35, y: 22 },
      reason: "blur",
    })
  })

  it("ignores a Pointer Session started synchronously during terminal dispatch", () => {
    const { stage, top } = createStage()
    stage.tools.appendChild({
      className: "reentrant-owner",
      shape: new Rectangle({ x: 0, y: 0, width: 80, height: 80 }),
    })
    const received: string[] = []
    let restarted = false

    stage.addEventListener({
      name: "reentrant-gesture",
      selector: ".reentrant-owner",
      event: ["drag", "dragend", "click"],
      callback: ({ e }) => {
        received.push(e.name)
        if (e.name !== "dragend" || restarted) return
        restarted = true
        top.dispatchEvent(pointer("pointerdown", 10, 10, {
          button: 0,
          buttons: 1,
          pointerId: 2,
        }))
      },
    })

    top.dispatchEvent(pointer("pointerdown", 10, 10, { button: 0, buttons: 1 }))
    top.dispatchEvent(pointer("pointermove", 30, 10, { buttons: 1 }))
    top.dispatchEvent(pointer("pointerup", 30, 10, { button: 0, buttons: 0 }))

    top.dispatchEvent(pointer("pointermove", 35, 10, {
      buttons: 1,
      pointerId: 2,
    }))
    top.dispatchEvent(pointer("pointerup", 35, 10, {
      button: 0,
      buttons: 0,
      pointerId: 2,
    }))

    expect(received).toEqual(["drag", "dragend"])

    top.dispatchEvent(pointer("pointerdown", 10, 10, {
      button: 0,
      buttons: 1,
      pointerId: 3,
    }))
    top.dispatchEvent(pointer("pointermove", 35, 10, {
      buttons: 1,
      pointerId: 3,
    }))
    top.dispatchEvent(pointer("pointerup", 35, 10, {
      button: 0,
      buttons: 0,
      pointerId: 3,
    }))

    expect(received).toEqual(["drag", "dragend", "drag", "dragend"])
  })

  it("finishes every terminal listener when a callback attempts a nested start", () => {
    const { stage, top } = createStage()
    const received: string[] = []
    let restarted = false

    stage.addEventListener({
      name: "first-terminal-listener",
      event: "dragend",
      callback: () => {
        received.push("first")
        if (restarted) return
        restarted = true
        top.dispatchEvent(pointer("pointerdown", 10, 10, {
          button: 0,
          buttons: 1,
          pointerId: 2,
        }))
      },
    })
    stage.addEventListener({
      name: "second-terminal-listener",
      event: "dragend",
      callback: () => received.push("second"),
    })

    top.dispatchEvent(pointer("pointerdown", 10, 10, { button: 0, buttons: 1 }))
    top.dispatchEvent(pointer("pointermove", 30, 10, { buttons: 1 }))
    top.dispatchEvent(pointer("pointerup", 30, 10, { button: 0, buttons: 0 }))

    expect(received).toEqual(["first", "second"])
  })

  it("keeps non-gesture dynamic events after a pointer session completes", () => {
    const { stage, top } = createStage()
    let laterCalls = 0
    const laterMove: EventProps<string> = {
      name: "later-move",
      trigger: MOUSE_EVENTS.MOUSE_MOVE,
    }
    const registerLater: EventProps<string> = {
      name: "register-later",
      trigger: MOUSE_EVENTS.MOUSE_DOWN,
      successCallback: () => laterMove,
    }
    stage.registerEvent(registerLater)
    stage.addEventListener({
      name: "later-listener",
      event: "later-move",
      callback: () => laterCalls++,
    })

    top.dispatchEvent(pointer("pointerdown", 10, 10, { button: 0, buttons: 1 }))
    window.dispatchEvent(pointer("pointerup", 600, 10, { button: 0, buttons: 0 }))
    top.dispatchEvent(pointer("pointermove", 20, 10, { buttons: 0 }))

    expect(laterCalls).toBe(1)
  })

  it("isolates simultaneous Canvas instances and removes global listeners on destroy", () => {
    const first = createStage()
    const second = createStage()
    const removeWindowListener = vi.spyOn(window, "removeEventListener")
    let firstEnds = 0
    let secondEnds = 0

    const listener = (increment: () => void): ListenerProps => ({
      name: "drag-terminal",
      event: "dragend",
      callback: increment,
    })
    first.stage.addEventListener(listener(() => firstEnds++))
    second.stage.addEventListener(listener(() => secondEnds++))

    first.top.dispatchEvent(pointer("pointerdown", 10, 10, { button: 0, buttons: 1 }))
    first.top.dispatchEvent(pointer("pointermove", 30, 10, { buttons: 1 }))
    window.dispatchEvent(pointer("pointerup", 600, 10, { button: 0, buttons: 0 }))

    expect(firstEnds).toBe(1)
    expect(secondEnds).toBe(0)

    first.stage.destroy()
    second.stage.destroy()
    expect(removeWindowListener).toHaveBeenCalledWith("pointerup", expect.any(Function), true)
    expect(removeWindowListener).toHaveBeenCalledWith("blur", expect.any(Function), undefined)
  })
})

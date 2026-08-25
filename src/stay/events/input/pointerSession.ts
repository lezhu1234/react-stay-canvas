import type { PointerSessionCancelReason } from "../../../types/events"
import { MOUSE_EVENTS } from "../../../userConstants"
import type {
  EventInputSink,
  PointerSample,
  PointerSessionRef,
  PointerSessionTransition,
} from "../contracts"
import {
  isMouseButtonPressed,
  PressedInputState,
} from "./pressedInputState"

type PointerSourceEvent = MouseEvent | PointerEvent

type ActivePointerSession = {
  ref: PointerSessionRef
  startSample: PointerSample
  lastSample: PointerSample
}

type PendingCompatibilityMouseUp = {
  button: number
  session: ActivePointerSession
}

function pointerIdOf(event: PointerSourceEvent): number | undefined {
  return "pointerId" in event ? event.pointerId : undefined
}

function pointerTypeOf(event: PointerSourceEvent): string {
  return "pointerType" in event ? event.pointerType : "mouse"
}

function sampleOf(event: MouseEvent): PointerSample {
  return { clientX: event.clientX, clientY: event.clientY }
}

function isPrimaryPointer(event: PointerSourceEvent): boolean {
  return !("isPrimary" in event) || event.isPrimary
}

export class PointerSession {
  private active?: ActivePointerSession
  private terminalDispatchInProgress = false
  private pendingCompatibilityMouseUp?: PendingCompatibilityMouseUp
  private nextSessionId = 1

  constructor(
    private readonly target: HTMLCanvasElement,
    private readonly pressedState: PressedInputState,
    private readonly inputSink: EventInputSink
  ) {}

  pointerDown(event: PointerEvent) {
    if (
      !isPrimaryPointer(event) ||
      this.active ||
      this.terminalDispatchInProgress
    ) return
    this.start(event)
  }

  pointerMove(event: PointerEvent) {
    if (!isPrimaryPointer(event)) return
    const session = this.active

    if (!session) {
      this.syncMouseButtons(event)
      this.emitRaw(event, MOUSE_EVENTS.MOUSE_MOVE)
      return
    }
    if (!this.belongsTo(session, event)) return

    this.syncMouseButtons(event)
    if (this.initiatingButtonWasReleased(session, event)) {
      this.expectCompatibilityMouseUp(session)
      this.finish(event, {
        phase: "end",
        outcome: "implicit-release",
        rawTrigger: MOUSE_EVENTS.MOUSE_MOVE,
      })
      return
    }

    this.emitRaw(event, MOUSE_EVENTS.MOUSE_MOVE, session, {
      phase: "continue",
    })
  }

  pointerUp(event: PointerEvent) {
    if (!isPrimaryPointer(event)) return
    const session = this.active
    if (!session) {
      this.syncMouseButtons(event)
      this.emitRaw(event, MOUSE_EVENTS.MOUSE_UP)
      return
    }
    if (!this.belongsTo(session, event)) return

    this.syncMouseButtons(event)
    this.finish(event, {
      phase: "end",
      outcome: this.isInitiatingButtonRelease(session, event)
        ? "released"
        : "implicit-release",
      rawTrigger: MOUSE_EVENTS.MOUSE_UP,
    })
  }

  outsidePointerUp(event: PointerEvent) {
    const session = this.active
    if (!isPrimaryPointer(event)) return
    if (!session) {
      this.syncMouseButtons(event)
      return
    }
    if (!this.belongsTo(session, event)) return
    this.pointerUp(event)
  }

  pointerCancel(event: PointerEvent, reason: PointerSessionCancelReason) {
    const session = this.active
    if (!session || !this.belongsTo(session, event)) return
    this.cancel(event, reason)
  }

  lostPointerCapture(event: PointerEvent) {
    const session = this.active
    if (!session || !this.belongsTo(session, event)) return
    this.syncMouseButtons(event)
    if (!isMouseButtonPressed(event.buttons, session.ref.initiatingButton)) {
      this.finish(event, {
        phase: "end",
        outcome: "implicit-release",
        rawTrigger: MOUSE_EVENTS.MOUSE_UP,
      })
      return
    }
    this.cancel(event, "lostpointercapture")
  }

  cancel(cause: Event, reason: PointerSessionCancelReason) {
    if (!this.active) return
    this.finish(cause, {
      phase: "cancel",
      outcome: "cancelled",
      cancelReason: reason,
    })
  }

  compatibilityMouseDown(event: MouseEvent) {
    const session = this.active
    if (!session || !this.isPointerMouseSession(session)) return
    if (event.button === session.ref.initiatingButton) return

    this.pressedState.press(`mouse${event.button}`)
    this.emitRaw(event, MOUSE_EVENTS.MOUSE_DOWN, session)
  }

  compatibilityMouseUp(event: MouseEvent) {
    const session = this.active
    if (!session) {
      this.pressedState.release(`mouse${event.button}`)
      const pending = this.takeExpectedCompatibilityMouseUp(event.button)
      if (pending) this.emitRaw(event, MOUSE_EVENTS.MOUSE_UP, pending.session)
      return
    }
    if (!this.isPointerMouseSession(session)) return

    this.pressedState.release(`mouse${event.button}`)
    if (event.button === session.ref.initiatingButton) {
      this.finish(event, {
        phase: "end",
        outcome: "released",
        rawTrigger: MOUSE_EVENTS.MOUSE_UP,
      })
      return
    }
    this.emitRaw(event, MOUSE_EVENTS.MOUSE_UP, session)
  }

  outsideCompatibilityMouseUp(event: MouseEvent) {
    this.compatibilityMouseUp(event)
  }

  mouseDown(event: MouseEvent) {
    if (this.terminalDispatchInProgress) return

    const session = this.active
    if (!session) {
      this.start(event)
      return
    }

    this.pressedState.press(`mouse${event.button}`)
    this.emitRaw(event, MOUSE_EVENTS.MOUSE_DOWN, session)
  }

  mouseMove(event: MouseEvent) {
    const session = this.active
    if (!session) {
      this.emitRaw(event, MOUSE_EVENTS.MOUSE_MOVE)
      return
    }

    this.emitRaw(event, MOUSE_EVENTS.MOUSE_MOVE, session, {
      phase: "continue",
    })
  }

  mouseUp(event: MouseEvent) {
    const session = this.active
    this.pressedState.release(`mouse${event.button}`)

    if (!session) {
      this.emitRaw(event, MOUSE_EVENTS.MOUSE_UP)
      return
    }
    if (event.button !== session.ref.initiatingButton) {
      this.emitRaw(event, MOUSE_EVENTS.MOUSE_UP, session)
      return
    }

    this.finish(event, {
      phase: "end",
      outcome: "released",
      rawTrigger: MOUSE_EVENTS.MOUSE_UP,
    })
  }

  outsideMouseUp(event: MouseEvent) {
    if (!this.active) {
      this.pressedState.release(`mouse${event.button}`)
      return
    }
    this.mouseUp(event)
  }

  destroy() {
    const session = this.active
    this.active = undefined
    this.pendingCompatibilityMouseUp = undefined
    if (session) this.releaseCapture(session)
  }

  private start(event: PointerSourceEvent) {
    this.pendingCompatibilityMouseUp = undefined
    const ref: PointerSessionRef = {
      id: this.nextSessionId++,
      startedAt: Date.now(),
      pointerId: pointerIdOf(event),
      pointerType: pointerTypeOf(event),
      initiatingButton: event.button,
    }
    const session: ActivePointerSession = {
      ref,
      startSample: sampleOf(event),
      lastSample: sampleOf(event),
    }
    this.active = session
    this.pressedState.press(`mouse${event.button}`)
    this.capture(session)
    this.emitRaw(event, MOUSE_EVENTS.MOUSE_DOWN, session, { phase: "start" })
  }

  private finish(
    originEvent: Event,
    terminal: {
      phase: "end" | "cancel"
      outcome: "released" | "implicit-release" | "cancelled"
      rawTrigger?: string
      cancelReason?: PointerSessionCancelReason
    }
  ) {
    const session = this.active
    if (!session) return

    this.active = undefined
    if (terminal.phase === "cancel") this.pressedState.clearMouseButtons()
    else this.pressedState.release(`mouse${session.ref.initiatingButton}`)

    const transition: PointerSessionTransition = {
      phase: terminal.phase,
      outcome: terminal.outcome,
      cancelReason: terminal.cancelReason,
    }

    this.terminalDispatchInProgress = true
    try {
      const current = originEvent instanceof MouseEvent && originEvent.type !== "lostpointercapture"
        ? sampleOf(originEvent)
        : session.lastSample
      this.inputSink({
        originEvent,
        pressedKeys: this.pressedState.snapshot(),
        pointerSample: current,
        pointerSamples: {
          start: session.startSample,
          previous: session.lastSample,
          current,
        },
        pointerSession: session.ref,
        rawAction: terminal.rawTrigger
          ? { trigger: terminal.rawTrigger }
          : undefined,
        sessionTransition: transition,
      })
    } finally {
      this.terminalDispatchInProgress = false
      this.releaseCapture(session)
    }
  }

  private emitRaw(
    originEvent: Event,
    trigger: string,
    session?: ActivePointerSession,
    transition?: { phase: "start" | "continue" }
  ) {
    const current = originEvent instanceof MouseEvent ? sampleOf(originEvent) : undefined
    const previous = session?.lastSample ?? current
    if (session && current && transition) session.lastSample = current
    this.inputSink({
      originEvent,
      pressedKeys: this.pressedState.snapshot(),
      pointerSample: current,
      pointerSamples: current && previous
        ? {
            start: session?.startSample ?? current,
            previous,
            current,
          }
        : undefined,
      pointerSession: session?.ref,
      rawAction: { trigger },
      sessionTransition: transition && session
        ? { phase: transition.phase }
        : undefined,
    })
  }

  private belongsTo(session: ActivePointerSession, event: PointerEvent) {
    return session.ref.pointerId === event.pointerId
  }

  private isPointerMouseSession(session: ActivePointerSession) {
    return session.ref.pointerId !== undefined && session.ref.pointerType === "mouse"
  }

  private initiatingButtonWasReleased(
    session: ActivePointerSession,
    event: PointerEvent
  ) {
    if (session.ref.pointerType !== "mouse") return false
    return !isMouseButtonPressed(event.buttons, session.ref.initiatingButton)
  }

  private isInitiatingButtonRelease(
    session: ActivePointerSession,
    event: PointerEvent
  ) {
    return session.ref.pointerType !== "mouse" ||
      event.button === session.ref.initiatingButton
  }

  private syncMouseButtons(event: PointerEvent) {
    if (event.pointerType === "mouse") {
      this.pressedState.syncMouseButtons(event.buttons)
    }
  }

  private expectCompatibilityMouseUp(session: ActivePointerSession) {
    const pending: PendingCompatibilityMouseUp = {
      button: session.ref.initiatingButton,
      session,
    }
    this.pendingCompatibilityMouseUp = pending
    queueMicrotask(() => {
      if (this.pendingCompatibilityMouseUp === pending) {
        this.pendingCompatibilityMouseUp = undefined
      }
    })
  }

  private takeExpectedCompatibilityMouseUp(button: number) {
    const pending = this.pendingCompatibilityMouseUp
    if (!pending || pending.button !== button) return undefined
    this.pendingCompatibilityMouseUp = undefined
    return pending
  }

  private capture(session: ActivePointerSession) {
    const pointerId = session.ref.pointerId
    if (pointerId === undefined) return
    try {
      this.target.setPointerCapture(pointerId)
    } catch {
      // Window terminal listeners remain the fallback when capture is unavailable.
    }
  }

  private releaseCapture(session: ActivePointerSession) {
    const pointerId = session.ref.pointerId
    if (pointerId === undefined || !this.target.hasPointerCapture?.(pointerId)) return
    try {
      this.target.releasePointerCapture(pointerId)
    } catch {
      // The browser may already have released capture for this pointer.
    }
  }
}

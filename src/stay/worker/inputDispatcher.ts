import type { PointerSessionCancelReason } from "../../types/events"
import type { CanvasWorkerOrigin } from "../../types/worker"
import type { EventInput, EventInputPort } from "../events/contracts"
import type { InputDispatcher } from "../events/input/eventDispatcher"

/** Owns the worker half of the existing DOM pointer session. */
export class WorkerInputDispatcher implements InputDispatcher {
  #activeInput?: EventInput<CanvasWorkerOrigin>
  #cancelledSessionId?: number

  constructor(
    private readonly runtime: EventInputPort<CanvasWorkerOrigin>,
    private readonly cancelDOMSession: (reason: PointerSessionCancelReason) => void
  ) {}

  initEvents() {}

  handleInput(input: EventInput<CanvasWorkerOrigin>) {
    const sessionId = input.pointerSession?.id
    if (sessionId !== undefined && sessionId === this.#cancelledSessionId) return
    const phase = input.sessionTransition?.phase
    if (phase === "start" || phase === "continue") this.#activeInput = input
    if (phase === "end" || phase === "cancel") this.#activeInput = undefined
    this.runtime.handleInput(input)
  }

  cancelPointerSession(reason: PointerSessionCancelReason) {
    const active = this.#activeInput
    this.#activeInput = undefined
    try {
      if (!active) return
      this.#cancelledSessionId = active.pointerSession?.id
      this.runtime.handleInput({
        ...active,
        originEvent: { type: reason, bubbles: false, cancelable: false, defaultPrevented: false },
        source: { kind: "other" },
        pressedKeys: new Set(),
        rawAction: undefined,
        sessionTransition: { phase: "cancel", outcome: "cancelled", cancelReason: reason },
      })
    } finally {
      this.cancelDOMSession(reason)
    }
  }

  destroy() {
    this.#activeInput = undefined
  }
}

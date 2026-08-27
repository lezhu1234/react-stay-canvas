import Canvas from "../../../canvas"
import type { PointerSessionCancelReason } from "../../../types/events"
import type { EventInputPort } from "../contracts"
import { DomInputAdapter } from "./domInputAdapter"
import { PressedInputState } from "./pressedInputState"

export class EventDispatcher {
  private readonly inputAdapter: DomInputAdapter
  private readonly pressedState = new PressedInputState()

  constructor(
    root: Canvas,
    passive: boolean,
    runtime: EventInputPort
  ) {
    const topLayer = root.layers[root.layers.length - 1]
    this.inputAdapter = new DomInputAdapter(
      topLayer,
      passive,
      this.pressedState,
      (input) => runtime.handleInput(input)
    )
  }

  initEvents() {
    this.inputAdapter.bind()
  }

  destroy() {
    this.inputAdapter.destroy()
    this.pressedState.clear()
  }

  cancelPointerSession(reason: PointerSessionCancelReason) {
    this.inputAdapter.cancelPointerSession(reason)
  }
}

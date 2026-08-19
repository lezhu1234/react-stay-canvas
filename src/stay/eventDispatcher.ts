import Canvas from "../canvas"
import { DomInputAdapter } from "./domInputAdapter"
import { EventRuntime } from "./eventRuntime"
import { PressedInputState } from "./pressedInputState"

export class EventDispatcher<EventName extends string> {
  private readonly inputAdapter: DomInputAdapter
  private readonly pressedState = new PressedInputState()

  constructor(
    root: Canvas,
    passive: boolean,
    runtime: EventRuntime<EventName>
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
}

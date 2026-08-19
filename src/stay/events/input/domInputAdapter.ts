import { KEYBOARRD_EVENTS, MOUSE_EVENTS } from "../../../userConstants"
import type { EventInputSink } from "../contracts"
import { PressedInputState } from "./pressedInputState"

type PressedStateUpdate = (event: Event, state: PressedInputState) => void

type DomEventBinding = {
  type: string
  trigger: string
  updatePressedState?: PressedStateUpdate
  afterDispatch?: (event: Event) => void
  options?: AddEventListenerOptions
}

const pressKeyboardKey: PressedStateUpdate = (event, state) => {
  state.press((event as KeyboardEvent).key)
}

const releaseKeyboardKey: PressedStateUpdate = (event, state) => {
  state.release((event as KeyboardEvent).key)
}

const pressMouseButton: PressedStateUpdate = (event, state) => {
  state.press(`mouse${(event as MouseEvent).button}`)
}

const releaseMouseButton: PressedStateUpdate = (event, state) => {
  state.release(`mouse${(event as MouseEvent).button}`)
}

const allowDrop = (event: Event) => {
  event.preventDefault()
}

const createBindings = (passive: boolean): DomEventBinding[] => [
  {
    type: "keyup",
    trigger: KEYBOARRD_EVENTS.KEY_UP,
    updatePressedState: releaseKeyboardKey,
  },
  {
    type: "keydown",
    trigger: KEYBOARRD_EVENTS.KEY_DOWN,
    updatePressedState: pressKeyboardKey,
  },
  {
    type: "mouseup",
    trigger: MOUSE_EVENTS.MOUSE_UP,
    updatePressedState: releaseMouseButton,
  },
  {
    type: "mousedown",
    trigger: MOUSE_EVENTS.MOUSE_DOWN,
    updatePressedState: pressMouseButton,
  },
  { type: "mousemove", trigger: MOUSE_EVENTS.MOUSE_MOVE },
  { type: "mouseover", trigger: MOUSE_EVENTS.MOUSE_OVER },
  { type: "click", trigger: MOUSE_EVENTS.CLICK },
  { type: "dblclick", trigger: MOUSE_EVENTS.DB_CLICK },
  { type: "contextmenu", trigger: MOUSE_EVENTS.CONTEXT_MENU },
  {
    type: "dragover",
    trigger: MOUSE_EVENTS.DRAG_OVER,
    afterDispatch: allowDrop,
  },
  { type: "dragstart", trigger: MOUSE_EVENTS.DRAG_START },
  { type: "dragend", trigger: MOUSE_EVENTS.DRAG_END },
  { type: "drop", trigger: MOUSE_EVENTS.DROP },
  {
    type: "wheel",
    trigger: MOUSE_EVENTS.WHEEL,
    options: { passive },
  },
  { type: "mouseenter", trigger: MOUSE_EVENTS.MOUSE_ENTER },
  { type: "mouseleave", trigger: MOUSE_EVENTS.MOUSE_LEAVE },
]

export class DomInputAdapter {
  private bound = false
  private readonly bindings: DomEventBinding[]
  private readonly cleanupCallbacks: Array<() => void> = []

  constructor(
    private readonly target: HTMLCanvasElement,
    passive: boolean,
    private readonly pressedState: PressedInputState,
    private readonly inputSink: EventInputSink
  ) {
    this.bindings = createBindings(passive)
  }

  bind() {
    if (this.bound) return

    try {
      this.bindings.forEach((binding) => this.bindEvent(binding))
      this.bound = true
    } catch (error) {
      this.destroy()
      throw error
    }
  }

  destroy() {
    this.cleanupCallbacks.splice(0).forEach((cleanup) => cleanup())
    this.bound = false
  }

  private bindEvent(binding: DomEventBinding) {
    const listener: EventListener = (originEvent) => {
      binding.updatePressedState?.(originEvent, this.pressedState)
      this.inputSink({
        originEvent,
        trigger: binding.trigger,
        pressedKeys: this.pressedState.snapshot(),
      })
      binding.afterDispatch?.(originEvent)
    }

    this.target.addEventListener(binding.type, listener, binding.options)
    this.cleanupCallbacks.push(() => {
      this.target.removeEventListener(binding.type, listener, binding.options)
    })
  }
}

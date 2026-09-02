import { KEYBOARRD_EVENTS, MOUSE_EVENTS } from "../../../userConstants"
import type { PointerSessionCancelReason } from "../../../types/events"
import type { EventInputSink } from "../contracts"
import { PointerSession } from "./pointerSession"
import { PressedInputState } from "./pressedInputState"

type DomEventBinding = {
  target: EventTarget
  type: string
  listener: EventListener
  options?: boolean | AddEventListenerOptions
}

type StatelessBinding = {
  type: string
  trigger: string
  afterDispatch?: (event: Event) => void
  options?: AddEventListenerOptions
}

const allowDrop = (event: Event) => event.preventDefault()

const createStatelessBindings = (passive: boolean): StatelessBinding[] => [
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
  private readonly cleanupCallbacks: Array<() => void> = []
  private readonly pointerSession: PointerSession

  constructor(
    private readonly target: HTMLCanvasElement,
    private readonly passive: boolean,
    private readonly pressedState: PressedInputState,
    private readonly inputSink: EventInputSink
  ) {
    this.pointerSession = new PointerSession(target, pressedState, inputSink)
  }

  bind() {
    if (this.bound) return

    try {
      this.bindKeyboard()
      this.bindPointerLifecycle()
      this.bindStatelessInputs()
      this.bound = true
    } catch (error) {
      this.destroy()
      throw error
    }
  }

  destroy() {
    this.pointerSession.destroy()
    this.cleanupCallbacks.splice(0).forEach((cleanup) => cleanup())
    this.bound = false
  }

  cancelPointerSession(reason: PointerSessionCancelReason) {
    this.pointerSession.cancel(new Event(reason), reason)
  }

  private bindKeyboard() {
    const keydown = (event: KeyboardEvent) => {
      this.pressedState.press(event.key)
      this.emit(event, KEYBOARRD_EVENTS.KEY_DOWN)
    }
    const keyup = (event: KeyboardEvent) => {
      this.pressedState.release(event.key)
      this.emit(event, KEYBOARRD_EVENTS.KEY_UP)
    }

    this.addBinding(this.target, "keydown", keydown)
    this.addBinding(this.target, "keyup", keyup)
    this.addBinding(window, "keyup", (event: KeyboardEvent) => {
      if (this.pressedState.has(event.key)) this.pressedState.release(event.key)
    })
  }

  private bindPointerLifecycle() {
    if (typeof window.PointerEvent === "function") {
      this.bindPointerEvents()
    } else {
      this.bindMouseFallback()
    }

    this.addBinding(window, "blur", (event: Event) => {
      this.pressedState.clear()
      this.pointerSession.cancel(event, "blur")
    })
    this.addBinding(document, "visibilitychange", (event: Event) => {
      if (document.visibilityState !== "hidden") return
      this.pressedState.clear()
      this.pointerSession.cancel(event, "visibilitychange")
    })
  }

  private bindPointerEvents() {
    this.addBinding(this.target, "pointerdown", (event: PointerEvent) => {
      this.pointerSession.pointerDown(event)
    })
    this.addBinding(this.target, "pointermove", (event: PointerEvent) => {
      this.pointerSession.pointerMove(event)
    })
    this.addBinding(this.target, "pointerup", (event: PointerEvent) => {
      this.pointerSession.pointerUp(event)
    })
    this.addBinding(this.target, "pointercancel", (event: PointerEvent) => {
      this.pointerSession.pointerCancel(event, "pointercancel")
    })
    this.addBinding(this.target, "lostpointercapture", (event: PointerEvent) => {
      this.pointerSession.lostPointerCapture(event)
    })
    this.addBinding(
      window,
      "pointerup",
      (event: PointerEvent) => {
        if (this.isDeliveredToCanvas(event)) return
        this.pointerSession.outsidePointerUp(event)
      },
      true
    )
    this.addBinding(
      window,
      "pointercancel",
      (event: PointerEvent) => {
        if (this.isDeliveredToCanvas(event)) return
        this.pointerSession.pointerCancel(event, "pointercancel")
      },
      true
    )

    // Mouse button chords do not emit pointerdown/pointerup for every button.
    // Compatibility MouseEvents keep per-button state exact when available;
    // PointerEvent.buttons remains authoritative on every pointermove.
    this.addBinding(this.target, "mousedown", (event: MouseEvent) => {
      this.pointerSession.compatibilityMouseDown(event)
    })
    this.addBinding(this.target, "mouseup", (event: MouseEvent) => {
      this.pointerSession.compatibilityMouseUp(event)
    })
    this.addBinding(
      window,
      "mouseup",
      (event: MouseEvent) => {
        if (this.isDeliveredToCanvas(event)) return
        this.pointerSession.outsideCompatibilityMouseUp(event)
      },
      true
    )
  }

  private bindMouseFallback() {
    this.addBinding(this.target, "mousedown", (event: MouseEvent) => {
      this.pointerSession.mouseDown(event)
    })
    this.addBinding(this.target, "mousemove", (event: MouseEvent) => {
      this.pointerSession.mouseMove(event)
    })
    this.addBinding(this.target, "mouseup", (event: MouseEvent) => {
      this.pointerSession.mouseUp(event)
    })
    this.addBinding(
      window,
      "mouseup",
      (event: MouseEvent) => {
        if (this.isDeliveredToCanvas(event)) return
        this.pointerSession.outsideMouseUp(event)
      },
      true
    )
  }

  private bindStatelessInputs() {
    createStatelessBindings(this.passive).forEach((binding) => {
      this.addBinding(
        this.target,
        binding.type,
        (event: Event) => {
          this.emit(event, binding.trigger)
          binding.afterDispatch?.(event)
        },
        binding.options
      )
    })
  }

  private emit(originEvent: Event, trigger: string) {
    this.inputSink({
      originEvent,
      pressedKeys: this.pressedState.snapshot(),
      pointerSample: originEvent instanceof MouseEvent
        ? { clientX: originEvent.clientX, clientY: originEvent.clientY }
        : undefined,
      rawAction: { trigger },
    })
  }

  private isDeliveredToCanvas(event: Event) {
    const path = event.composedPath?.()
    if (path?.length) return path.includes(this.target)
    const target = event.target
    return target === this.target || (target instanceof Node && this.target.contains(target))
  }

  private addBinding<T extends Event>(
    target: EventTarget,
    type: string,
    listener: (event: T) => void,
    options?: boolean | AddEventListenerOptions
  ) {
    const eventListener = listener as EventListener
    const binding: DomEventBinding = { target, type, listener: eventListener, options }
    binding.target.addEventListener(binding.type, binding.listener, binding.options)
    this.cleanupCallbacks.push(() => {
      binding.target.removeEventListener(binding.type, binding.listener, binding.options)
    })
  }
}

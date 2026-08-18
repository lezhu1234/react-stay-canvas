import Canvas from "../canvas"
import {
  click,
  contextmenu,
  dblclick,
  dragend,
  dragover,
  dragstart,
  drop,
  keydown,
  keyup,
  mouseenter,
  mouseleave,
  mouseover,
  wheel,
} from "../rawEvents"
import { EventProps, StayEventMap, StayEventProps } from "../types"
import { DEFAULTSTATE, MOUSE_EVENTS, ROOTNAME } from "../userConstants"
import {
  ActionEvent,
  ListenerNamePayloadPair,
  ListenerProps,
  PointerSessionCancelReason,
  PredefinedWheelEventName,
  TriggerEvents,
} from "../userTypes"

type Store = Map<string, any>
type TriggerActionFn<EventName extends string> = (
  originEvent: Event,
  triggerEvents: TriggerEvents<EventName>,
  payload: Record<string, any>
) => void

type PointerSession = {
  pointerId: number
  pointerType: string
  button: number
  lastEvent: PointerEvent
  ended: boolean
}

type FireEventOptions = {
  cancelled?: boolean
  cancelReason?: PointerSessionCancelReason
  onlyLinkedEvents?: boolean
  pointerId?: number
  pointerType?: string
}

const MOUSE_BUTTON_MASKS = [1, 4, 2, 8, 16]
const POINTER_SESSION_EVENT_NAMES = new Set(["drag", "dragend", "move", "moveend"])

// Owns event registration, the listener registry, pressed-key tracking, the DOM
// wiring, and fireEvent (build ActionEvent → run each event's condition/success
// callbacks → hand off to tools.triggerAction). Extracted from Stay so "event
// dispatch" is one concern. Reads Stay's live state/store via injected
// accessors; the final dispatch — walking listeners and calling their callbacks
// — stays in tools.triggerAction, which is injected here.
export class EventDispatcher<EventName extends string> {
  events: StayEventMap<EventName> = {} as StayEventMap<EventName>
  listeners = new Map<string, Required<ListenerProps<ListenerNamePayloadPair, EventName>>>()
  currentPressedKeys: { [key: string]: boolean } = {}
  private activePointer?: PointerSession
  private cleanupCallbacks: Array<() => void> = []
  private handledPointerEnds = new WeakSet<Event>()
  private pointerSessionEventNames = new Set<EventName>()
  private topLayer?: HTMLCanvasElement

  constructor(
    private readonly root: Canvas,
    private readonly passive: boolean,
    private readonly store: Store,
    private readonly stateStore: Store,
    private readonly getState: () => string,
    private readonly triggerAction: TriggerActionFn<EventName>,
    private readonly onPointerSessionEnd: () => void
  ) {}

  addEventListener({
    name,
    event,
    callback,
    state = DEFAULTSTATE,
    selector = `.${ROOTNAME}`,
    sortBy = (child) => {
      const { width, height } = child.getBound()
      return width * height
    },
  }: ListenerProps<ListenerNamePayloadPair, EventName>) {
    const eventList = Array.isArray(event) ? event : [event]
    this.listeners.set(name, { name, state, selector, event: eventList, sortBy, callback })
  }

  registerEvent({
    name,
    trigger,
    conditionCallback,
    successCallback,
    withTargetConditionCallback,
  }: EventProps<EventName>, pointerSessionEvent = false) {
    this.events[name] = {
      name,
      trigger,
      conditionCallback: conditionCallback || (() => true),
      successCallback: successCallback || (() => void 0),
      withTargetConditionCallback,
    }
    if (pointerSessionEvent) {
      this.pointerSessionEventNames.add(name)
    } else {
      // A non-session event may intentionally replace a same-named dynamic
      // event. Do not let later pointer cleanup delete the replacement.
      this.pointerSessionEventNames.delete(name)
    }
  }

  deleteEvent(name: EventName) {
    delete this.events[name]
    this.pointerSessionEventNames.delete(name)
  }

  clearEvents() {
    this.events = {} as StayEventMap<EventName>
    this.pointerSessionEventNames.clear()
  }

  clearEventListeners() {
    this.listeners.clear()
  }

  pressKey(key: string) {
    this.currentPressedKeys[key] = true
  }

  releaseKey(key: string) {
    this.currentPressedKeys[key] = false
  }

  fireEvent(
    e: KeyboardEvent | MouseEvent | PointerEvent | WheelEvent | DragEvent | Event,
    trigger: string,
    options: FireEventOptions = {}
  ) {
    const isMouseEvent = e instanceof MouseEvent
    const triggerEvents: TriggerEvents<EventName> = {}
    Object.keys(this.events).forEach((_eventName) => {
      const eventName = _eventName as EventName
      // may be deleted by other event
      if (!this.events[eventName]) {
        return
      }
      const event = this.events[eventName] as StayEventProps<EventName>
      if (event.trigger !== trigger) return false
      if (options.onlyLinkedEvents && !this.pointerSessionEventNames.has(eventName)) return false

      const actionEvent = {
        state: this.getState(),
        name: eventName,
        pressedKeys: new Set(
          Object.keys(this.currentPressedKeys).filter((key) => this.currentPressedKeys[key])
        ),
        isMouseEvent: isMouseEvent,
      } as ActionEvent<EventName>

      if (actionEvent.isMouseEvent) {
        const mouseE = e as MouseEvent
        actionEvent.x = mouseE.clientX - this.root.x
        actionEvent.y = mouseE.clientY - this.root.y
        actionEvent.point = { x: actionEvent.x, y: actionEvent.y }
        if (event.trigger === MOUSE_EVENTS.WHEEL) {
          const wheelE = e as WheelEvent
          const _actionEvent = actionEvent as ActionEvent<PredefinedWheelEventName>
          _actionEvent.deltaX = wheelE.deltaX
          _actionEvent.deltaY = wheelE.deltaY
          _actionEvent.deltaZ = wheelE.deltaZ
        }
        if (typeof PointerEvent !== "undefined" && e instanceof PointerEvent) {
          actionEvent.pointerId = e.pointerId
          actionEvent.pointerType = e.pointerType
        } else if (options.pointerId !== undefined) {
          actionEvent.pointerId = options.pointerId
          actionEvent.pointerType = options.pointerType
        }
        actionEvent.cancelled = options.cancelled ?? false
        actionEvent.cancelReason = options.cancelReason
      } else {
        const keyboardE = e as KeyboardEvent
        actionEvent.key = keyboardE.key
      }

      if (
        event.conditionCallback({
          e: actionEvent,
          store: this.store,
          stateStore: this.stateStore,
        })
      ) {
        triggerEvents[eventName] = {
          info: actionEvent,
          event,
        }
        let linkEvent = event.successCallback({
          e: actionEvent,
          store: this.store,
          stateStore: this.stateStore,
          deleteEvent: this.deleteEvent.bind(this),
        })
        if (linkEvent) {
          if (!(linkEvent instanceof Array)) {
            linkEvent = [linkEvent]
          }
          linkEvent.forEach((le) => {
            const belongsToPointerSession = Boolean(this.activePointer) &&
              (trigger === MOUSE_EVENTS.MOUSE_DOWN || trigger === MOUSE_EVENTS.MOUSE_MOVE) &&
              POINTER_SESSION_EVENT_NAMES.has(le.name)
            this.registerEvent(le, belongsToPointerSession)
          })
        }
      }
    })

    this.triggerAction(e, triggerEvents, {})
  }

  private addDomListener(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions
  ) {
    target.addEventListener(type, listener, options)
    this.cleanupCallbacks.push(() => target.removeEventListener(type, listener, options))
  }

  private startPointerSession(e: PointerEvent) {
    if (!e.isPrimary || this.activePointer) return
    this.activePointer = {
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      button: e.button,
      lastEvent: e,
      ended: false,
    }
    this.pressKey(`mouse${e.button}`)
    try {
      this.topLayer?.setPointerCapture(e.pointerId)
    } catch {
      // The window-level pointerup listener remains as a release fallback.
    }
    this.fireEvent(e, MOUSE_EVENTS.MOUSE_DOWN)
  }

  private syncMouseButtons(e: PointerEvent) {
    if (e.pointerType !== "mouse") return
    MOUSE_BUTTON_MASKS.forEach((mask, button) => {
      this.currentPressedKeys[`mouse${button}`] = (e.buttons & mask) !== 0
    })
  }

  private clearPointerButtons() {
    Object.keys(this.currentPressedKeys).forEach((key) => {
      if (key.startsWith("mouse")) delete this.currentPressedKeys[key]
    })
  }

  private movePointerSession(e: PointerEvent) {
    if (!e.isPrimary) return
    if (this.activePointer) {
      if (e.pointerId !== this.activePointer.pointerId) return
      this.activePointer.lastEvent = e
      this.syncMouseButtons(e)
      const initiatingButtonMask = MOUSE_BUTTON_MASKS[this.activePointer.button]
      if (
        e.pointerType === "mouse" &&
        initiatingButtonMask !== undefined &&
        (e.buttons & initiatingButtonMask) === 0
      ) {
        this.finishPointerSession(e, false)
        return
      }
    } else {
      this.syncMouseButtons(e)
    }
    this.fireEvent(e, MOUSE_EVENTS.MOUSE_MOVE)
  }

  private finishPointerSession(
    e: PointerEvent | MouseEvent,
    cancelled: boolean,
    cancelReason?: PointerSessionCancelReason,
    notify = true
  ) {
    const session = this.activePointer
    const pointerId = typeof PointerEvent !== "undefined" && e instanceof PointerEvent
      ? e.pointerId
      : session?.pointerId
    if (!session || session.ended || pointerId !== session.pointerId) return

    session.ended = true
    this.handledPointerEnds.add(e)
    this.activePointer = undefined
    this.releaseKey(`mouse${session.button}`)
    if (cancelled) this.clearPointerButtons()

    try {
      if (notify) {
        this.fireEvent(e, MOUSE_EVENTS.MOUSE_UP, {
          cancelled,
          cancelReason,
          onlyLinkedEvents: cancelled,
          pointerId: session.pointerId,
          pointerType: session.pointerType,
        })
      }
    } finally {
      // Click pairing belongs to this pointer session even when cancellation
      // intentionally suppresses the public mouseup event.
      this.store.delete("lastMouseDownPosition")
      this.store.delete("laseMouseDownTime")

      if (this.topLayer?.hasPointerCapture?.(session.pointerId)) {
        try {
          this.topLayer.releasePointerCapture(session.pointerId)
        } catch {
          // Capture may already have been released implicitly.
        }
      }

      this.clearPointerSessionEvents()
      this.onPointerSessionEnd()
    }
  }

  private cancelPointerSession(reason: PointerSessionCancelReason, event?: PointerEvent) {
    const session = this.activePointer
    if (!session) return
    this.finishPointerSession(event ?? session.lastEvent, true, reason)
  }

  private clearPointerSessionEvents() {
    this.pointerSessionEventNames.forEach((name) => delete this.events[name])
    this.pointerSessionEventNames.clear()
  }

  // Bind the DOM events on the top layer to fireEvent / pressKey / releaseKey.
  initEvents() {
    this.destroy(false)
    const topLayer = this.root.layers[this.root.layers.length - 1]
    this.topLayer = topLayer
    const fire = this.fireEvent.bind(this)
    const press = this.pressKey.bind(this)
    const release = this.releaseKey.bind(this)

    const onKeyUp = (e: KeyboardEvent) => keyup(fire, release, e)
    const onWindowKeyUp = (e: KeyboardEvent) => {
      if (this.currentPressedKeys[e.key]) onKeyUp(e)
    }
    const onPointerDown = (e: PointerEvent) => this.startPointerSession(e)
    const onPointerMove = (e: PointerEvent) => this.movePointerSession(e)
    const onPointerUp = (e: PointerEvent) => {
      this.syncMouseButtons(e)
      if (this.activePointer?.pointerId === e.pointerId) {
        this.finishPointerSession(e, false)
      } else if (!this.handledPointerEnds.has(e)) {
        // Preserve the old standalone mouseup behavior for a pointer that was
        // pressed elsewhere and released over this Canvas.
        this.handledPointerEnds.add(e)
        this.fireEvent(e, MOUSE_EVENTS.MOUSE_UP)
      }
    }
    const onWindowPointerUp = (e: PointerEvent) => {
      this.syncMouseButtons(e)
      if (this.activePointer?.pointerId === e.pointerId) onPointerUp(e)
    }
    const onPointerCancel = (e: PointerEvent) =>
      this.finishPointerSession(e, true, "pointercancel")
    const onLostPointerCapture = (e: PointerEvent) =>
      this.cancelPointerSession("lostpointercapture", e)
    const onWindowBlur = () => {
      this.cancelPointerSession("blur")
      this.currentPressedKeys = {}
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        this.cancelPointerSession("visibilitychange")
        this.currentPressedKeys = {}
      }
    }
    // PointerEvent.buttons is authoritative for mouse chords. Compatibility
    // MouseEvents remain a fallback for browsers that emit them and preserve
    // per-button state between pointer samples.
    const onMouseDown = (e: MouseEvent) => {
      if (this.activePointer?.pointerType === "mouse") {
        this.pressKey(`mouse${e.button}`)
      }
    }
    const onWindowMouseUp = (e: MouseEvent) => {
      this.releaseKey(`mouse${e.button}`)
      if (
        this.activePointer?.pointerType === "mouse" &&
        this.activePointer.button === e.button
      ) {
        this.finishPointerSession(e, false)
      }
    }

    this.addDomListener(topLayer, "keyup", onKeyUp as EventListener)
    this.addDomListener(topLayer, "keydown", ((e: KeyboardEvent) => keydown(fire, press, e)) as EventListener)
    this.addDomListener(window, "keyup", onWindowKeyUp as EventListener)
    this.addDomListener(topLayer, "pointerdown", onPointerDown as EventListener)
    this.addDomListener(topLayer, "pointermove", onPointerMove as EventListener)
    this.addDomListener(topLayer, "pointerup", onPointerUp as EventListener)
    this.addDomListener(topLayer, "pointercancel", onPointerCancel as EventListener)
    this.addDomListener(topLayer, "lostpointercapture", onLostPointerCapture as EventListener)
    // Capture-phase fallbacks still observe termination when an outside target
    // stops bubbling. Pointer capture remains the normal delivery path.
    this.addDomListener(window, "pointerup", onWindowPointerUp as EventListener, true)
    this.addDomListener(topLayer, "mousedown", onMouseDown as EventListener)
    this.addDomListener(window, "mouseup", onWindowMouseUp as EventListener, true)
    this.addDomListener(window, "blur", onWindowBlur as EventListener)
    this.addDomListener(document, "visibilitychange", onVisibilityChange as EventListener)
    this.addDomListener(topLayer, "mouseover", ((e: MouseEvent) => mouseover(fire, e)) as EventListener)
    this.addDomListener(topLayer, "click", ((e: MouseEvent) => click(fire, e)) as EventListener)
    this.addDomListener(topLayer, "dblclick", ((e: MouseEvent) => dblclick(fire, e)) as EventListener)
    this.addDomListener(topLayer, "contextmenu", ((e: MouseEvent) => contextmenu(fire, e)) as EventListener)
    this.addDomListener(topLayer, "dragover", ((e: DragEvent) => {
      dragover(fire, e)
    }) as EventListener)
    this.addDomListener(topLayer, "dragstart", ((e: DragEvent) => dragstart(fire, e)) as EventListener)
    this.addDomListener(topLayer, "dragend", ((e: DragEvent) => dragend(fire, e)) as EventListener)
    this.addDomListener(topLayer, "drop", ((e: DragEvent) => drop(fire, e)) as EventListener)
    this.addDomListener(topLayer, "wheel", ((e: WheelEvent) => wheel(fire, e)) as EventListener, { passive: this.passive })
    this.addDomListener(topLayer, "mouseenter", ((e: MouseEvent) => mouseenter(fire, e)) as EventListener)
    this.addDomListener(topLayer, "mouseleave", ((e: MouseEvent) => mouseleave(fire, e)) as EventListener)
  }

  destroy(notify = false) {
    const session = this.activePointer
    if (session) this.finishPointerSession(session.lastEvent, true, "lostpointercapture", notify)
    this.cleanupCallbacks.splice(0).forEach((cleanup) => cleanup())
    this.clearPointerSessionEvents()
    this.currentPressedKeys = {}
    this.topLayer = undefined
    this.onPointerSessionEnd()
  }
}

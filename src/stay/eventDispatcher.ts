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
  mousedown,
  mouseenter,
  mouseleave,
  mousemove,
  mouseover,
  mouseup,
  wheel,
} from "../rawEvents"
import { EventProps, StayEventMap, StayEventProps } from "../types"
import { DEFAULTSTATE, MOUSE_EVENTS, ROOTNAME } from "../userConstants"
import {
  ActionEvent,
  ListenerNamePayloadPair,
  ListenerProps,
  PredefinedWheelEventName,
  TriggerEvents,
} from "../userTypes"

type Store = Map<string, any>
type TriggerActionFn<EventName extends string> = (
  originEvent: Event,
  triggerEvents: TriggerEvents<EventName>,
  payload: Record<string, any>
) => void

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

  constructor(
    private readonly root: Canvas,
    private readonly passive: boolean,
    private readonly store: Store,
    private readonly stateStore: Store,
    private readonly getState: () => string,
    private readonly triggerAction: TriggerActionFn<EventName>
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
  }: EventProps<EventName>) {
    this.events[name] = {
      name,
      trigger,
      conditionCallback: conditionCallback || (() => true),
      successCallback: successCallback || (() => void 0),
      withTargetConditionCallback,
    }
  }

  deleteEvent(name: EventName) {
    delete this.events[name]
  }

  clearEvents() {
    this.events = {} as StayEventMap<EventName>
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

  fireEvent(e: KeyboardEvent | MouseEvent | WheelEvent | DragEvent | Event, trigger: string) {
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
            this.registerEvent(le)
          })
        }
      }
    })

    this.triggerAction(e, triggerEvents, {})
  }

  // Bind the DOM events on the top layer to fireEvent / pressKey / releaseKey.
  initEvents() {
    const topLayer = this.root.layers[this.root.layers.length - 1]
    const fire = this.fireEvent.bind(this)
    const press = this.pressKey.bind(this)
    const release = this.releaseKey.bind(this)

    topLayer.onkeyup = (e: KeyboardEvent) => keyup(fire, release, e)
    topLayer.onkeydown = (e: KeyboardEvent) => keydown(fire, press, e)
    topLayer.onmouseup = (e: MouseEvent) => mouseup(fire, release, e)
    topLayer.onmousedown = (e: MouseEvent) => mousedown(fire, press, e)
    topLayer.onmousemove = (e: MouseEvent) => mousemove(fire, e)
    topLayer.onmouseover = (e: MouseEvent) => mouseover(fire, e)
    topLayer.onclick = (e: MouseEvent) => click(fire, e)
    topLayer.ondblclick = (e: MouseEvent) => dblclick(fire, e)
    topLayer.oncontextmenu = (e: MouseEvent) => contextmenu(fire, e)
    topLayer.ondragover = (e) => dragover(fire, e)
    topLayer.addEventListener("dragstart", (e: DragEvent) => dragstart(fire, e), false)
    topLayer.ondragend = (e: DragEvent) => dragend(fire, e)
    topLayer.ondrop = (e: DragEvent) => drop(fire, e)
    topLayer.addEventListener("wheel", (e: WheelEvent) => wheel(fire, e), { passive: this.passive })
    topLayer.onmouseenter = (e: MouseEvent) => mouseenter(fire, e)
    topLayer.onmouseleave = (e: MouseEvent) => mouseleave(fire, e)
  }
}

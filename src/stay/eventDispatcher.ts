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
import { MOUSE_EVENTS } from "../userConstants"
import {
  ActionEvent,
  PredefinedWheelEventName,
  TriggerEvents,
} from "../userTypes"

type Store = Map<string, any>
type ActionRoutePort<EventName extends string> = {
  dispatch<T extends string>(
    originEvent: Event,
    triggerEvents: TriggerEvents<T>,
    payload: Record<string, any>,
    eventDefinitions?: Readonly<
      Partial<Record<string, { trigger?: string } | undefined>>
    >
  ): void
  endGesture(): void
}

// U1 leaves event-definition execution and DOM wiring here. Listener routing is
// delegated through the narrow ActionRoutePort; U2 and U3 will extract the two
// remaining concerns without coupling them back to Child selection.
export class EventDispatcher<EventName extends string> {
  events: StayEventMap<EventName> = {} as StayEventMap<EventName>
  currentPressedKeys: { [key: string]: boolean } = {}

  constructor(
    private readonly root: Canvas,
    private readonly passive: boolean,
    private readonly store: Store,
    private readonly stateStore: Store,
    private readonly getState: () => string,
    private readonly actionRouter: ActionRoutePort<EventName>
  ) {}

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

  pressKey(key: string) {
    this.currentPressedKeys[key] = true
  }

  releaseKey(key: string) {
    this.currentPressedKeys[key] = false
  }

  fireEvent(e: KeyboardEvent | MouseEvent | WheelEvent | DragEvent | Event, trigger: string) {
    try {
      const triggerEvents = this.collectTriggerEvents(e, trigger)
      this.actionRouter.dispatch(e, triggerEvents, {}, this.events)
    } finally {
      if (trigger === MOUSE_EVENTS.MOUSE_UP) {
        this.actionRouter.endGesture()
      }
    }
  }

  private collectTriggerEvents(
    e: KeyboardEvent | MouseEvent | WheelEvent | DragEvent | Event,
    trigger: string
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
    return triggerEvents
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

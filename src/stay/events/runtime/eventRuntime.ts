import Canvas from "../../../canvas"
import type {
  EventProps,
  StayEventProps,
} from "../../../types/events"
import { MOUSE_EVENTS } from "../../../userConstants"
import type {
  ActionRoutePort,
  EvaluatedActions,
  EventDefinitionLookup,
  EventInput,
  NormalizedActionEvent,
} from "../contracts"
import { EventRegistry } from "./eventRegistry"

type Store = Map<string, any>

type EventRuntimeContext<EventName extends string> = {
  canvas: Canvas
  store: Store
  stateStore: Store
  getState: () => string
  actionRouter: ActionRoutePort<EventName>
}

export class EventRuntime<EventName extends string> {
  private readonly registry = new EventRegistry<EventName>()
  private readonly definitions: EventDefinitionLookup = {
    get: (name) => this.registry.get(name),
  }

  constructor(private readonly context: EventRuntimeContext<EventName>) {}

  registerEvent(definition: EventProps<EventName>) {
    this.registry.register(definition)
  }

  deleteEvent(name: EventName) {
    this.registry.delete(name)
  }

  clearEvents() {
    this.registry.clear()
    this.context.actionRouter.endGesture()
  }

  handleInput(input: EventInput) {
    try {
      const triggerEvents = this.evaluate(input)
      this.context.actionRouter.dispatch(
        input.originEvent,
        triggerEvents,
        {},
        this.definitions
      )
    } finally {
      if (input.trigger === MOUSE_EVENTS.MOUSE_UP) {
        this.context.actionRouter.endGesture()
      }
    }
  }

  private evaluate(input: EventInput): EvaluatedActions<EventName> {
    const triggerEvents: EvaluatedActions<EventName> = {}
    const namesAtStart = this.registry.names()

    namesAtStart.forEach((eventName) => {
      const event = this.registry.get(eventName)
      if (!event || event.trigger !== input.trigger) return

      const actionEvent = this.createActionEvent(eventName, event, input)
      if (!this.conditionPasses(event, actionEvent)) return

      this.runSuccess(event, actionEvent)
      triggerEvents[eventName] = { info: actionEvent, event }
    })

    return triggerEvents
  }

  private createActionEvent(
    eventName: EventName,
    event: StayEventProps<EventName>,
    input: EventInput
  ): NormalizedActionEvent<EventName> {
    const actionEvent: NormalizedActionEvent<EventName> = {
      state: this.context.getState(),
      name: eventName,
      pressedKeys: new Set(input.pressedKeys),
      isMouseEvent: input.originEvent instanceof MouseEvent,
    }

    if (input.originEvent instanceof KeyboardEvent) {
      actionEvent.key = input.originEvent.key
      return actionEvent
    }

    if (!(input.originEvent instanceof MouseEvent)) return actionEvent

    actionEvent.x = input.originEvent.clientX - this.context.canvas.x
    actionEvent.y = input.originEvent.clientY - this.context.canvas.y
    actionEvent.point = { x: actionEvent.x, y: actionEvent.y }

    if (event.trigger === MOUSE_EVENTS.WHEEL && input.originEvent instanceof WheelEvent) {
      actionEvent.deltaX = input.originEvent.deltaX
      actionEvent.deltaY = input.originEvent.deltaY
      actionEvent.deltaZ = input.originEvent.deltaZ
    }

    return actionEvent
  }

  private conditionPasses(
    event: StayEventProps<EventName>,
    actionEvent: NormalizedActionEvent<EventName>
  ) {
    return event.conditionCallback({
      e: actionEvent,
      store: this.context.store,
      stateStore: this.context.stateStore,
    })
  }

  private runSuccess(
    event: StayEventProps<EventName>,
    actionEvent: NormalizedActionEvent<EventName>
  ) {
    const linked = event.successCallback({
      e: actionEvent,
      store: this.context.store,
      stateStore: this.context.stateStore,
      deleteEvent: (name) => this.deleteEvent(name),
    })
    if (!linked) return

    this.registry.registerAll(Array.isArray(linked) ? linked : [linked])
  }
}

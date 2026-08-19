import Canvas from "../canvas"
import { EventProps, StayEventProps } from "../types"
import { MOUSE_EVENTS } from "../userConstants"
import {
  ActionEvent,
  PredefinedWheelEventName,
  TriggerEvents,
} from "../userTypes"
import type { EventDefinitionLookup } from "./actionTargetResolver"
import { EventRegistry } from "./eventRegistry"

type Store = Map<string, any>

type ActionRoutePort = {
  dispatch<T extends string>(
    originEvent: Event,
    triggerEvents: TriggerEvents<T>,
    payload: Record<string, any>,
    eventDefinitions: EventDefinitionLookup
  ): void
  endGesture(): void
}

export type EventInput = {
  originEvent: Event
  trigger: string
  pressedKeys: ReadonlySet<string>
}

type EventRuntimeContext = {
  canvas: Canvas
  store: Store
  stateStore: Store
  getState: () => string
  actionRouter: ActionRoutePort
}

export class EventRuntime<EventName extends string> {
  private readonly registry = new EventRegistry<EventName>()
  private readonly definitions: EventDefinitionLookup = {
    get: (name) => this.registry.get(name),
  }

  constructor(private readonly context: EventRuntimeContext) {}

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

  private evaluate(input: EventInput): TriggerEvents<EventName> {
    const triggerEvents: TriggerEvents<EventName> = {}
    const namesAtStart = this.registry.names()

    namesAtStart.forEach((eventName) => {
      const event = this.registry.get(eventName)
      if (!event || event.trigger !== input.trigger) return

      const actionEvent = this.createActionEvent(eventName, event, input)
      if (!this.conditionPasses(event, actionEvent)) return

      triggerEvents[eventName] = { info: actionEvent, event }
      this.runSuccess(event, actionEvent)
    })

    return triggerEvents
  }

  private createActionEvent(
    eventName: EventName,
    event: StayEventProps<EventName>,
    input: EventInput
  ): ActionEvent<EventName> {
    const actionEvent = {
      state: this.context.getState(),
      name: eventName,
      pressedKeys: new Set(input.pressedKeys),
      isMouseEvent: input.originEvent instanceof MouseEvent,
    } as ActionEvent<EventName>

    if (!actionEvent.isMouseEvent) {
      actionEvent.key = (input.originEvent as KeyboardEvent).key
      return actionEvent
    }

    const mouseEvent = input.originEvent as MouseEvent
    actionEvent.x = mouseEvent.clientX - this.context.canvas.x
    actionEvent.y = mouseEvent.clientY - this.context.canvas.y
    actionEvent.point = { x: actionEvent.x, y: actionEvent.y }

    if (event.trigger === MOUSE_EVENTS.WHEEL) {
      const wheelEvent = input.originEvent as WheelEvent
      const wheelAction = actionEvent as ActionEvent<PredefinedWheelEventName>
      wheelAction.deltaX = wheelEvent.deltaX
      wheelAction.deltaY = wheelEvent.deltaY
      wheelAction.deltaZ = wheelEvent.deltaZ
    }

    return actionEvent
  }

  private conditionPasses(
    event: StayEventProps<EventName>,
    actionEvent: ActionEvent<EventName>
  ) {
    return event.conditionCallback({
      e: actionEvent,
      store: this.context.store,
      stateStore: this.context.stateStore,
    })
  }

  private runSuccess(
    event: StayEventProps<EventName>,
    actionEvent: ActionEvent<EventName>
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

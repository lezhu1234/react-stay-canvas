import Canvas from "../../../canvas"
import type { EventProps, StayEventProps } from "../../../types/events"
import type { PointType } from "../../../types/geometry"
import type {
  ActionRoutePort,
  EvaluatedActions,
  EventDefinitionLookup,
  EventInput,
  NormalizedActionEvent,
} from "../contracts"
import {
  beginClickPairing,
  clearClickPairing,
  getClickPairing,
} from "../clickPairing"
import {
  describeEventDefinition,
  type EventDefinitionScope,
} from "../gesturePhases"
import { EventRegistry, type RegisteredEvent } from "./eventRegistry"

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

  constructor(private readonly context: EventRuntimeContext<EventName>) {}

  registerEvent(definition: EventProps<EventName>) {
    this.registry.register(definition)
  }

  deleteEvent(name: EventName) {
    this.registry.delete(name)
  }

  clearEvents() {
    this.registry.clear()
    clearClickPairing(this.context.store)
    this.context.actionRouter.clearGestureOwners()
  }

  handleInput(input: EventInput) {
    const point = this.canvasPoint(input)
    this.beginClickCandidate(input, point)
    const terminalSessionId = this.terminalSessionId(input)

    try {
      const triggerEvents = this.evaluate(input, point)
      this.context.actionRouter.dispatch(
        input.originEvent,
        triggerEvents,
        {},
        this.definitionLookup(input.pointerSession?.id)
      )
    } finally {
      if (terminalSessionId !== undefined) {
        this.registry.clearPointerSession(terminalSessionId)
        clearClickPairing(this.context.store, terminalSessionId)
        this.context.actionRouter.endPointerSession(terminalSessionId)
      }
    }
  }

  private evaluate(
    input: EventInput,
    point?: PointType
  ): EvaluatedActions<EventName> {
    const triggerEvents: EvaluatedActions<EventName> = {}
    const namesAtStart = this.registry.names()

    namesAtStart.forEach((eventName) => {
      const registered = this.registry.getRegistered(
        eventName,
        input.pointerSession?.id
      )
      if (!registered || !this.shouldEvaluate(registered, input)) return

      const actionEvent = this.createActionEvent(
        eventName,
        registered.definition,
        input,
        point
      )
      if (!this.conditionPasses(registered.definition, actionEvent)) return

      this.runSuccess(registered, actionEvent, input)
      triggerEvents[eventName] = {
        info: actionEvent,
        event: registered.definition,
        role: registered.role,
        scope: registered.scope,
        sessionId: input.pointerSession?.id,
      }
    })

    return triggerEvents
  }

  private shouldEvaluate(
    registered: RegisteredEvent<EventName>,
    input: EventInput
  ) {
    const { definition, role, scope } = registered
    const rawTrigger = input.rawAction?.trigger
    const transition = input.sessionTransition
    const sessionId = input.pointerSession?.id

    if (role.kind === "ordinary") return rawTrigger === definition.trigger

    if (role.kind === "click-terminal") {
      if (
        rawTrigger !== definition.trigger ||
        transition?.phase !== "end" ||
        transition.outcome !== "released"
      ) {
        return false
      }
      const pairing = getClickPairing(this.context.store)
      return sessionId !== undefined &&
        pairing?.sessionId === sessionId &&
        pairing.initiatingButton === input.pointerSession?.initiatingButton
    }

    if (role.phase === "start") {
      return rawTrigger === definition.trigger && transition?.phase === "start"
    }

    if (!transition || sessionId === undefined || !this.scopeAccepts(scope, sessionId)) {
      return false
    }

    if (role.phase === "continue") {
      return rawTrigger === definition.trigger && transition.phase === "continue"
    }

    if (transition.phase !== "end" && transition.phase !== "cancel") return false
    return scope.kind === "pointer-session" || transition.phase === "end"
  }

  private scopeAccepts(scope: EventDefinitionScope, sessionId: number) {
    return scope.kind === "persistent" || scope.sessionId === sessionId
  }

  private createActionEvent(
    eventName: EventName,
    event: StayEventProps<EventName>,
    input: EventInput,
    point?: PointType
  ): NormalizedActionEvent<EventName> {
    const actionEvent: NormalizedActionEvent<EventName> = {
      state: this.context.getState(),
      name: eventName,
      pressedKeys: new Set(input.pressedKeys),
      isMouseEvent: Boolean(input.pointerSample) || input.originEvent instanceof MouseEvent,
    }

    if (input.originEvent instanceof KeyboardEvent) {
      actionEvent.key = input.originEvent.key
    }

    if (point) {
      actionEvent.x = point.x
      actionEvent.y = point.y
      actionEvent.point = { ...point }
    }

    const session = input.pointerSession
    if (session) {
      actionEvent.pointerId = session.pointerId
      actionEvent.pointerType = session.pointerType
    }
    if (input.sessionTransition?.phase === "cancel") {
      actionEvent.cancelled = true
      actionEvent.cancelReason = input.sessionTransition.cancelReason
    } else if (input.sessionTransition) {
      actionEvent.cancelled = false
    }

    if (event.trigger === "wheel" && input.originEvent instanceof WheelEvent) {
      actionEvent.deltaX = input.originEvent.deltaX
      actionEvent.deltaY = input.originEvent.deltaY
      actionEvent.deltaZ = input.originEvent.deltaZ
    }

    return actionEvent
  }

  private canvasPoint(input: EventInput): PointType | undefined {
    const sample = input.pointerSample ?? this.sampleFromMouseEvent(input.originEvent)
    return sample
      ? this.context.canvas.clientToCanvasPoint(sample.clientX, sample.clientY)
      : undefined
  }

  private sampleFromMouseEvent(originEvent: Event) {
    if (!(originEvent instanceof MouseEvent)) return undefined
    return { clientX: originEvent.clientX, clientY: originEvent.clientY }
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
    registered: RegisteredEvent<EventName>,
    actionEvent: NormalizedActionEvent<EventName>,
    input: EventInput
  ) {
    const linked = registered.definition.successCallback({
      e: actionEvent,
      store: this.context.store,
      stateStore: this.context.stateStore,
      deleteEvent: (name) => this.registry.deleteResolved(
        name,
        input.pointerSession?.id
      ),
    })
    if (!linked) return

    const definitions = Array.isArray(linked) ? linked : [linked]
    definitions.forEach((definition) => {
      this.registry.register(
        definition,
        this.linkedScope(registered, definition, input)
      )
    })
  }

  private linkedScope(
    parent: RegisteredEvent<EventName>,
    child: EventProps<EventName>,
    input: EventInput
  ): EventDefinitionScope {
    const childRole = describeEventDefinition(child.name, child.trigger)
    const parentRole = parent.role
    const sessionId = input.pointerSession?.id

    if (
      sessionId !== undefined &&
      parentRole.kind === "gesture" &&
      childRole.kind === "gesture" &&
      parentRole.family === childRole.family &&
      childRole.phase !== "start"
    ) {
      return { kind: "pointer-session", sessionId }
    }

    return { kind: "persistent" }
  }

  private beginClickCandidate(input: EventInput, point?: PointType) {
    const transition = input.sessionTransition
    const session = input.pointerSession
    if (transition?.phase !== "start" || !point || !session) return

    beginClickPairing(this.context.store, {
      sessionId: session.id,
      initiatingButton: session.initiatingButton,
      point: { ...point },
      startedAt: Date.now(),
    })
  }

  private terminalSessionId(input: EventInput) {
    const phase = input.sessionTransition?.phase
    if (phase !== "end" && phase !== "cancel") return undefined
    return input.pointerSession?.id
  }

  private definitionLookup(pointerSessionId?: number): EventDefinitionLookup {
    return {
      get: (name) => {
        const registered = this.registry.getRegistered(name, pointerSessionId)
        if (!registered) return undefined
        return {
          trigger: registered.definition.trigger,
          role: registered.role,
          scope: registered.scope,
        }
      },
    }
  }
}

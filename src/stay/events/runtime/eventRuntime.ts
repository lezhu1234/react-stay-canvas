import Canvas from "../../../canvas"
import type { EventProps, StayEventProps } from "../../../types/events"
import {
  CoordinateSystem,
  type CoordinateFrame,
  type PointerCoordinates,
  type PointerSamples,
  type SurfaceMetrics,
} from "../../coordinates/coordinateSystem"
import type {
  ActionRoutePort,
  EvaluatedActions,
  EventDefinitionLookup,
  EventInput,
  NormalizedActionEvent,
} from "../contracts"
import {
  describeEventDefinition,
  type EventDefinitionScope,
} from "../gesturePhases"
import { EventRegistry, type RegisteredEvent } from "./eventRegistry"

type Store = Map<string, any>

type EventRuntimeContext<EventName extends string> = {
  canvas: Canvas
  coordinates: CoordinateSystem
  store: Store
  stateStore: Store
  getState: () => string
  actionRouter: ActionRoutePort<EventName>
}

type PointerMappingContext = {
  frame: CoordinateFrame
  metrics: SurfaceMetrics
}

export class EventRuntime<EventName extends string> {
  private readonly registry = new EventRegistry<EventName>()
  private readonly activatedDragSessions = new Set<number>()
  private readonly pointerMappingContexts = new Map<number, PointerMappingContext>()

  constructor(private readonly context: EventRuntimeContext<EventName>) {}

  registerEvent(definition: EventProps<EventName>) {
    this.registry.register(definition)
  }

  deleteEvent(name: EventName) {
    this.registry.delete(name)
  }

  clearEvents() {
    this.registry.clear()
    this.activatedDragSessions.clear()
    this.context.actionRouter.clearGestureOwners()
  }

  handleInput(input: EventInput) {
    const mapped = this.pointerCoordinates(input)
    const terminalSessionId = this.terminalSessionId(input)

    try {
      const triggerEvents = this.evaluate(input, mapped?.coordinates, mapped?.frame)
      this.context.actionRouter.dispatch(
        input.originEvent,
        triggerEvents,
        {},
        this.definitionLookup(input.pointerSession?.id)
      )
    } finally {
      if (terminalSessionId !== undefined) {
        this.registry.clearPointerSession(terminalSessionId)
        this.activatedDragSessions.delete(terminalSessionId)
        this.pointerMappingContexts.delete(terminalSessionId)
        this.context.actionRouter.endPointerSession(terminalSessionId)
      }
    }
  }

  private evaluate(
    input: EventInput,
    coordinates?: PointerCoordinates,
    coordinateFrame?: CoordinateFrame
  ): EvaluatedActions<EventName> {
    const triggerEvents: EvaluatedActions<EventName> = {}
    const namesAtStart = this.registry.names()

    namesAtStart.forEach((eventName) => {
      const registered = this.registry.getRegistered(
        eventName,
        input.pointerSession?.id
      )
      if (!registered || !this.shouldEvaluate(registered, input, coordinates)) return

      const actionEvent = this.createActionEvent(
        eventName,
        registered.definition,
        input,
        coordinates
      )
      if (!this.conditionPasses(registered.definition, actionEvent)) return

      this.runSuccess(registered, actionEvent, input)
      triggerEvents[eventName] = {
        info: actionEvent,
        coordinates,
        coordinateFrame,
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
    input: EventInput,
    coordinates?: PointerCoordinates
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
      return sessionId !== undefined &&
        input.pointerSession !== undefined &&
        coordinates !== undefined &&
        Date.now() - input.pointerSession.startedAt < 500 &&
        Math.hypot(
          coordinates.viewOffsetFromStart.x,
          coordinates.viewOffsetFromStart.y
        ) < 10 &&
        !this.activatedDragSessions.has(sessionId)
    }

    if (role.phase === "start") {
      return rawTrigger === definition.trigger && transition?.phase === "start"
    }

    if (!transition || sessionId === undefined || !this.scopeAccepts(scope, sessionId)) {
      return false
    }

    if (role.phase === "continue") {
      if (rawTrigger !== definition.trigger || transition.phase !== "continue") return false
      if (role.family !== "drag") return true
      if (this.activatedDragSessions.has(sessionId)) return true
      if (!coordinates) return false
      const activated = Math.hypot(
        coordinates.viewOffsetFromStart.x,
        coordinates.viewOffsetFromStart.y
      ) >= 10
      if (activated) this.activatedDragSessions.add(sessionId)
      return activated
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
    coordinates?: PointerCoordinates
  ): NormalizedActionEvent<EventName> {
    const actionEvent: NormalizedActionEvent<EventName> = {
      state: this.context.getState(),
      name: eventName,
      pressedKeys: new Set(input.pressedKeys),
      isMouseEvent: Boolean(coordinates) || input.originEvent instanceof MouseEvent,
    }

    if (input.originEvent instanceof KeyboardEvent) {
      actionEvent.key = input.originEvent.key
    }

    if (coordinates) {
      actionEvent.x = coordinates.content.x
      actionEvent.y = coordinates.content.y
      actionEvent.point = { ...coordinates.content }
      actionEvent.movement = { ...coordinates.viewMovement }
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

  private pointerCoordinates(input: EventInput): {
    coordinates: PointerCoordinates
    frame: CoordinateFrame
  } | undefined {
    const current = input.pointerSample ?? this.sampleFromMouseEvent(input.originEvent)
    if (!current) return undefined
    const samples: PointerSamples = input.pointerSamples ?? {
      start: current,
      previous: current,
      current,
    }
    const mappingContext = this.pointerMappingContext(input)
    this.rememberPointerMappingContext(input, mappingContext)
    return {
      coordinates: this.context.coordinates.mapPointer(
        samples,
        mappingContext.metrics,
        mappingContext.frame
      ),
      frame: mappingContext.frame,
    }
  }

  private pointerMappingContext(input: EventInput): PointerMappingContext {
    const sessionId = input.pointerSession?.id
    if (
      sessionId !== undefined &&
      input.sessionTransition?.phase === "cancel" &&
      input.sessionTransition.cancelReason === "resize"
    ) {
      const remembered = this.pointerMappingContexts.get(sessionId)
      if (remembered) return remembered
    }

    const metrics = this.context.canvas.getSurfaceMetrics()
    return {
      metrics,
      frame: this.context.coordinates.getFrame(metrics),
    }
  }

  private rememberPointerMappingContext(
    input: EventInput,
    mappingContext: PointerMappingContext
  ) {
    const sessionId = input.pointerSession?.id
    const phase = input.sessionTransition?.phase
    if (sessionId !== undefined && (phase === "start" || phase === "continue")) {
      this.pointerMappingContexts.set(sessionId, mappingContext)
    }
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

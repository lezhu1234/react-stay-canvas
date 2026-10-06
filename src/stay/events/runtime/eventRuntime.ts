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
import { inputSourceOf } from "../input/forwardedInput"

type Store = Map<string, any>

type EventRuntimeContext<EventName extends string, Origin> = {
  canvas: Canvas
  coordinates: CoordinateSystem
  store: Store
  stateStore: Store
  getState: () => string
  actionRouter: ActionRoutePort<EventName, Origin>
}

type PointerMappingContext = {
  frame: CoordinateFrame
  metrics: SurfaceMetrics
}

export class EventRuntime<EventName extends string, Origin = Event> {
  private readonly registry = new EventRegistry<EventName, Origin>()
  private readonly activatedDragSessions = new Set<number>()
  private readonly pointerMappingContexts = new Map<number, PointerMappingContext>()

  constructor(private readonly context: EventRuntimeContext<EventName, Origin>) {}

  registerEvent(definition: EventProps<EventName, never, never, Origin>) {
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

  handleInput(input: EventInput<Origin>) {
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
    input: EventInput<Origin>,
    coordinates?: PointerCoordinates,
    coordinateFrame?: CoordinateFrame
  ): EvaluatedActions<EventName, Origin> {
    const triggerEvents: EvaluatedActions<EventName, Origin> = {}
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
    registered: RegisteredEvent<EventName, Origin>,
    input: EventInput<Origin>,
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
    event: StayEventProps<EventName, never, never, Origin>,
    input: EventInput<Origin>,
    coordinates?: PointerCoordinates
  ): NormalizedActionEvent<EventName> {
    const source = input.source ?? inputSourceOf(input.originEvent)
    const actionEvent: NormalizedActionEvent<EventName> = {
      state: this.context.getState(),
      name: eventName,
      pressedKeys: new Set(input.pressedKeys),
      isMouseEvent: Boolean(coordinates) || source.kind === "pointer" || source.kind === "wheel",
    }

    if (source.kind === "keyboard") actionEvent.key = source.key

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

    if (event.trigger === "wheel" && source.kind === "wheel") {
      actionEvent.deltaX = source.deltaX
      actionEvent.deltaY = source.deltaY
      actionEvent.deltaZ = source.deltaZ
    }

    return actionEvent
  }

  private pointerCoordinates(input: EventInput<Origin>): {
    coordinates: PointerCoordinates
    frame: CoordinateFrame
  } | undefined {
    const source = input.source ?? inputSourceOf(input.originEvent)
    const current = input.pointerSample ?? (
      source.clientX !== undefined && source.clientY !== undefined
        ? { clientX: source.clientX, clientY: source.clientY } : undefined
    )
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

  private pointerMappingContext(input: EventInput<Origin>): PointerMappingContext {
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
    input: EventInput<Origin>,
    mappingContext: PointerMappingContext
  ) {
    const sessionId = input.pointerSession?.id
    const phase = input.sessionTransition?.phase
    if (sessionId !== undefined && (phase === "start" || phase === "continue")) {
      this.pointerMappingContexts.set(sessionId, mappingContext)
    }
  }

  private conditionPasses(
    event: StayEventProps<EventName, never, never, Origin>,
    actionEvent: NormalizedActionEvent<EventName>
  ) {
    return event.conditionCallback({
      e: actionEvent,
      store: this.context.store,
      stateStore: this.context.stateStore,
    })
  }

  private runSuccess(
    registered: RegisteredEvent<EventName, Origin>,
    actionEvent: NormalizedActionEvent<EventName>,
    input: EventInput<Origin>
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
    parent: RegisteredEvent<EventName, Origin>,
    child: EventProps<EventName, never, never, Origin>,
    input: EventInput<Origin>
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

  private terminalSessionId(input: EventInput<Origin>) {
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

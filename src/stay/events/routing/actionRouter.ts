import Canvas from "../../../canvas"
import { DEFAULTSTATE, ROOTNAME } from "../../../userConstants"
import type { ChildSortFunction } from "../../../types/children"
import type { Dict } from "../../../types/common"
import type {
  ActionEvent,
  ListenerNamePayloadPair,
  ListenerProps,
} from "../../../types/events"
import type { StayTools } from "../../../types/tools"
import { createActionEventEnvelope } from "./actionEventEnvelope"
import {
  ActionTargetResolver,
  TargetDecision,
  TargetResolverContext,
} from "./actionTargetResolver"
import type { GestureFamily } from "../gesturePhases"
import type {
  EvaluatedActions,
  EventDefinitionLookup,
  NormalizedActionEvent,
} from "../contracts"

type Store = Map<string, any>

type ListenerRegistration<EventName extends string> = {
  id: symbol
  name: string
  state: string
  selector: string
  sortBy?: ChildSortFunction
  eventNames: EventName[]
  callback: ListenerProps<ListenerNamePayloadPair, EventName>["callback"]
}

type ListenerRuntime<EventName extends string> = {
  registration: ListenerRegistration<EventName>
  composeStore: Record<string, any>
}

type ActionRouterContext = {
  canvas: Canvas
  store: Store
  stateStore: Store
  getTools: () => StayTools
  isStateAvailable: (selector: string) => boolean
  targetResolver: TargetResolverContext
}

const EMPTY_EVENT_DEFINITIONS: EventDefinitionLookup = {
  get: () => undefined,
}

export class ActionRouter<EventName extends string> {
  private readonly listeners = new Map<string, ListenerRuntime<EventName>>()
  private readonly targetResolver: ActionTargetResolver

  constructor(private readonly context: ActionRouterContext) {
    this.targetResolver = new ActionTargetResolver(context.targetResolver)
  }

  addListener({
    name,
    event,
    callback,
    state = DEFAULTSTATE,
    selector = `.${ROOTNAME}`,
    sortBy,
  }: ListenerProps<ListenerNamePayloadPair, EventName>) {
    const listenerName = name as string
    const previous = this.listeners.get(listenerName)
    if (previous) {
      this.targetResolver.forgetListener(previous.registration.id)
      this.listeners.delete(listenerName)
    }

    const registration: ListenerRegistration<EventName> = {
      id: Symbol(listenerName),
      name: listenerName,
      state,
      selector,
      sortBy,
      callback,
      eventNames: (Array.isArray(event) ? [...event] : [event]) as EventName[],
    }
    this.listeners.set(listenerName, { registration, composeStore: {} })
  }

  deleteListener(name: string) {
    const runtime = this.listeners.get(name)
    if (!runtime) return
    this.targetResolver.forgetListener(runtime.registration.id)
    this.listeners.delete(name)
  }

  clearListeners() {
    this.listeners.clear()
    this.targetResolver.clearGestureOwners()
  }

  endPointerSession(sessionId: number) {
    this.targetResolver.endPointerSession(sessionId)
  }

  clearGestureOwners() {
    this.targetResolver.clearGestureOwners()
  }

  dispatch(
    originEvent: Event,
    triggerEvents: EvaluatedActions<EventName>,
    payload: Dict,
    eventDefinitions: EventDefinitionLookup = EMPTY_EVENT_DEFINITIONS
  ): void {
    this.listeners.forEach((runtime) => {
      this.dispatchListener(
        runtime,
        originEvent,
        triggerEvents,
        payload,
        eventDefinitions
      )
    })
  }

  dispatchManual(
    originEvent: Event,
    actions: ReadonlyMap<EventName, NormalizedActionEvent<EventName>>,
    payload: Dict
  ): void {
    this.listeners.forEach((runtime) => {
      const { registration } = runtime
      registration.eventNames.forEach((eventName) => {
        const actionEvent = actions.get(eventName)
        if (!actionEvent || !this.context.isStateAvailable(registration.state)) return

        this.invoke(
          runtime,
          eventName,
          actionEvent,
          { kind: "targetless" },
          originEvent,
          payload
        )
      })
    })
  }

  private dispatchListener(
    runtime: ListenerRuntime<EventName>,
    originEvent: Event,
    triggerEvents: EvaluatedActions<EventName>,
    payload: Dict,
    eventDefinitions: EventDefinitionLookup
  ) {
    const { registration } = runtime
    const capturedFamilies = new Set<GestureFamily>()

    registration.eventNames.forEach((eventName) => {
      const triggered = triggerEvents[eventName]
      if (!triggered) return

      const available = this.context.isStateAvailable(registration.state)
      const capturedFamily = this.targetResolver.captureStartForAction(
        registration,
        eventName,
        available,
        originEvent,
        triggerEvents,
        eventDefinitions
      )
      if (capturedFamily) capturedFamilies.add(capturedFamily)
      if (!available) return

      const target = this.targetResolver.resolve(
        registration,
        eventName,
        triggered.info,
        triggered.event,
        triggered.role,
        triggered.sessionId,
        originEvent,
        triggered.coordinates,
        triggered.coordinateFrame
      )
      if (target.kind === "skip") return

      this.invoke(runtime, eventName, triggered.info, target, originEvent, payload)
    })

    // Continuation-only listeners do not observe dragstart/startmove directly.
    // Capture for them after their own actions so synchronous state changes are visible.
    this.targetResolver.captureRemainingStarts(
      registration,
      capturedFamilies,
      this.context.isStateAvailable(registration.state),
      originEvent,
      triggerEvents,
      eventDefinitions
    )
  }

  private invoke(
    runtime: ListenerRuntime<EventName>,
    eventName: EventName,
    sourceEvent: NormalizedActionEvent<EventName>,
    target: Exclude<TargetDecision, { kind: "skip" }>,
    originEvent: Event,
    payload: Dict
  ) {
    const routedEvent = createActionEventEnvelope(sourceEvent, eventName)
    if (target.kind === "target") {
      routedEvent.target = target.target
    }

    const result = runtime.registration.callback({
      originEvent,
      e: routedEvent,
      store: this.context.store,
      stateStore: this.context.stateStore,
      composeStore: runtime.composeStore,
      tools: this.context.getTools(),
      canvas: this.context.canvas,
      payload,
    })

    if (result instanceof Promise) {
      result
        .then((eventFunctions) => this.mergeComposeStore(runtime, eventName, eventFunctions))
        .catch((error) =>
          console.error(
            `[stay] listener "${runtime.registration.name}" async callback threw:`,
            error
          )
        )
      return
    }

    this.mergeComposeStore(runtime, eventName, result)
  }

  private mergeComposeStore(
    runtime: ListenerRuntime<EventName>,
    eventName: EventName,
    eventFunctions: any
  ) {
    const eventFunction = eventFunctions?.[eventName]
    if (!eventFunction) return

    const partial = eventFunction()
    if (partial === undefined) return
    runtime.composeStore = { ...runtime.composeStore, ...partial }
  }
}

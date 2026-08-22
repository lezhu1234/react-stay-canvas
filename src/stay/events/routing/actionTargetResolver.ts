import type { ChildSortFunction, SelectorFunc } from "../../../types/children"
import type { EventProps } from "../../../types/events"
import { StayInstantChild } from "../../children/stayInstantChild"
import type {
  EvaluatedActions,
  EventDefinitionLookup,
  NormalizedActionEvent,
} from "../contracts"
import {
  GESTURES,
  type EventDefinitionRole,
  type GestureDefinition,
  type GestureFamily,
} from "../gesturePhases"
import { createActionEventEnvelope } from "./actionEventEnvelope"

type Store = Map<string, any>

type GestureTarget =
  | { kind: "child"; child: StayInstantChild }
  | { kind: "none" }

type GestureOwner = {
  sessionId: number
  target: GestureTarget
}

export type TargetRegistration = {
  id: symbol
  eventNames: readonly string[]
  selector: string
  sortBy: ChildSortFunction
}

export type TargetDecision =
  | { kind: "target"; target: StayInstantChild }
  | { kind: "targetless" }
  | { kind: "skip" }

export type TargetResolverContext = {
  rootChild: StayInstantChild
  store: Store
  stateStore: Store
  select: (
    selector: string | SelectorFunc,
    sortBy?: ChildSortFunction
  ) => StayInstantChild[]
  hitTest: (props: {
    point: { x: number; y: number }
    selector: string | SelectorFunc
    sortBy?: ChildSortFunction
  }) => StayInstantChild[]
}

export class ActionTargetResolver {
  private readonly gestureOwners = new Map<
    symbol,
    Map<GestureFamily, GestureOwner>
  >()

  constructor(private readonly context: TargetResolverContext) {}

  captureStartForAction<T extends string>(
    registration: TargetRegistration,
    eventName: string,
    available: boolean,
    originEvent: Event,
    triggerEvents: EvaluatedActions<T>,
    eventDefinitions: EventDefinitionLookup
  ): GestureFamily | undefined {
    const triggered = triggerEvents[eventName as T]
    const role = triggered?.role
    if (
      !triggered ||
      role?.kind !== "gesture" ||
      role.phase !== "start" ||
      triggered.sessionId === undefined
    ) {
      return undefined
    }

    const gesture = GESTURES.find(({ family }) => family === role.family)
    if (!gesture || !this.listenerParticipates(registration, gesture, eventDefinitions)) {
      return undefined
    }

    this.captureGestureStart(
      registration,
      gesture,
      triggered.sessionId,
      available,
      originEvent,
      triggerEvents
    )
    return gesture.family
  }

  captureRemainingStarts<T extends string>(
    registration: TargetRegistration,
    capturedFamilies: ReadonlySet<GestureFamily>,
    available: boolean,
    originEvent: Event,
    triggerEvents: EvaluatedActions<T>,
    eventDefinitions: EventDefinitionLookup
  ) {
    GESTURES.forEach((gesture) => {
      const triggered = triggerEvents[gesture.start as T]
      if (
        !triggered ||
        triggered.role.kind !== "gesture" ||
        triggered.role.phase !== "start" ||
        triggered.sessionId === undefined ||
        capturedFamilies.has(gesture.family) ||
        !this.listenerParticipates(registration, gesture, eventDefinitions)
      ) return

      this.captureGestureStart(
        registration,
        gesture,
        triggered.sessionId,
        available,
        originEvent,
        triggerEvents
      )
    })
  }

  resolve<T extends string>(
    registration: TargetRegistration,
    eventName: T,
    sourceEvent: NormalizedActionEvent<T>,
    eventDefinition: EventProps<T>,
    role: EventDefinitionRole,
    sessionId: number | undefined,
    originEvent: Event
  ): TargetDecision {
    if (role.kind === "gesture" && sessionId !== undefined) {
      return this.resolveGestureTarget(
        registration.id,
        role.family,
        role.phase,
        sessionId,
        eventName,
        sourceEvent,
        eventDefinition,
        originEvent
      )
    }

    if (eventName === "mouseleave") {
      return this.targetIfAccepted(
        this.context.rootChild,
        eventName,
        sourceEvent,
        eventDefinition,
        originEvent
      )
    }

    if (originEvent instanceof MouseEvent) {
      const target = this.findPointerTarget(
        registration,
        eventName,
        sourceEvent,
        eventDefinition,
        originEvent
      )
      return target ? { kind: "target", target } : { kind: "skip" }
    }

    if (!eventDefinition.withTargetConditionCallback) return { kind: "targetless" }

    const target = this.context
      .select(registration.selector, registration.sortBy)
      .find((child) =>
        this.acceptsTarget(child, eventName, sourceEvent, eventDefinition, originEvent)
      )
    return target ? { kind: "target", target } : { kind: "skip" }
  }

  forgetListener(listenerId: symbol) {
    this.gestureOwners.delete(listenerId)
  }

  endPointerSession(sessionId: number) {
    this.gestureOwners.forEach((owners, listenerId) => {
      owners.forEach((owner, family) => {
        if (owner.sessionId === sessionId) owners.delete(family)
      })
      if (owners.size === 0) this.gestureOwners.delete(listenerId)
    })
  }

  clearGestureOwners() {
    this.gestureOwners.clear()
  }

  private resolveGestureTarget<T extends string>(
    listenerId: symbol,
    family: GestureFamily,
    phase: "start" | "continue" | "terminal",
    sessionId: number,
    eventName: T,
    sourceEvent: NormalizedActionEvent<T>,
    eventDefinition: EventProps<T>,
    originEvent: Event
  ): TargetDecision {
    const owner = this.gestureOwners.get(listenerId)?.get(family)
    if (
      !owner ||
      owner.sessionId !== sessionId ||
      owner.target.kind === "none"
    ) {
      return { kind: "skip" }
    }

    if (
      phase !== "start" &&
      !this.acceptsTarget(
        owner.target.child,
        eventName,
        sourceEvent,
        eventDefinition,
        originEvent
      )
    ) {
      return { kind: "skip" }
    }

    return { kind: "target", target: owner.target.child }
  }

  private findPointerTarget<T extends string>(
    registration: TargetRegistration,
    eventName: T,
    sourceEvent: NormalizedActionEvent<T>,
    eventDefinition: EventProps<T>,
    originEvent: Event
  ): StayInstantChild | undefined {
    const point = sourceEvent.point
    if (!point) return undefined

    return this.context
      .hitTest({ point, selector: registration.selector, sortBy: registration.sortBy })
      .find((child) =>
        this.acceptsTarget(child, eventName, sourceEvent, eventDefinition, originEvent)
      )
  }

  private targetIfAccepted<T extends string>(
    target: StayInstantChild,
    eventName: T,
    sourceEvent: NormalizedActionEvent<T>,
    eventDefinition: EventProps<T>,
    originEvent: Event
  ): TargetDecision {
    return this.acceptsTarget(target, eventName, sourceEvent, eventDefinition, originEvent)
      ? { kind: "target", target }
      : { kind: "skip" }
  }

  private acceptsTarget<T extends string>(
    target: StayInstantChild,
    eventName: T,
    sourceEvent: NormalizedActionEvent<T>,
    eventDefinition: EventProps<T>,
    originEvent: Event
  ) {
    const predicate = eventDefinition.withTargetConditionCallback
    if (!predicate) return true

    return predicate({
      e: createActionEventEnvelope(sourceEvent, eventName),
      store: this.context.store,
      stateStore: this.context.stateStore,
      target,
      originEvent,
    })
  }

  private setGestureOwner(
    sessionId: number,
    listenerId: symbol,
    family: GestureFamily,
    target: GestureTarget
  ) {
    let owners = this.gestureOwners.get(listenerId)
    if (!owners) {
      owners = new Map()
      this.gestureOwners.set(listenerId, owners)
    }
    owners.set(family, { sessionId, target })
  }

  private listenerParticipates(
    registration: TargetRegistration,
    gesture: GestureDefinition,
    eventDefinitions: EventDefinitionLookup
  ) {
    return registration.eventNames.some((name) => {
      if (!gesture.all.has(name)) return false
      const definition = eventDefinitions.get(name)
      if (!definition) return true
      return definition.role.kind === "gesture" &&
        definition.role.family === gesture.family
    })
  }

  private captureGestureStart<T extends string>(
    registration: TargetRegistration,
    gesture: GestureDefinition,
    sessionId: number,
    available: boolean,
    originEvent: Event,
    triggerEvents: EvaluatedActions<T>
  ) {
    if (!available) {
      this.setGestureOwner(
        sessionId,
        registration.id,
        gesture.family,
        { kind: "none" }
      )
      return
    }

    const start = triggerEvents[gesture.start as T]
    if (!start) return
    const target = this.findPointerTarget(
      registration,
      gesture.start as T,
      start.info,
      start.event,
      originEvent
    )
    this.setGestureOwner(
      sessionId,
      registration.id,
      gesture.family,
      target ? { kind: "child", child: target } : { kind: "none" }
    )
  }
}

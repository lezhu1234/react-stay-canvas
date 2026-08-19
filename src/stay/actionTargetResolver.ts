import { EventProps } from "../types"
import { MOUSE_EVENTS } from "../userConstants"
import {
  ActionEvent,
  ChildSortFunction,
  SelectorFunc,
  TriggerEvents,
} from "../userTypes"
import { createActionEventEnvelope } from "./actionEventEnvelope"
import { StayInstantChild } from "./child/stayInstantChild"

type Store = Map<string, any>
export type GestureFamily = "drag" | "move"

type GestureOwner =
  | { kind: "child"; child: StayInstantChild }
  | { kind: "none" }

type GestureDefinition = {
  family: GestureFamily
  start: string
  end: string
  continuation: ReadonlySet<string>
  all: ReadonlySet<string>
  triggers: Readonly<Record<string, string>>
}

export type TargetRegistration = {
  id: symbol
  eventNames: readonly string[]
  selector: string
  sortBy: ChildSortFunction
}

export type EventDefinitionLookup = Readonly<
  Partial<Record<string, { trigger?: string } | undefined>>
>

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

const GESTURES: readonly GestureDefinition[] = [
  {
    family: "drag",
    start: "dragstart",
    end: "dragend",
    continuation: new Set(["drag", "dragend"]),
    all: new Set(["dragstart", "drag", "dragend"]),
    triggers: {
      dragstart: MOUSE_EVENTS.MOUSE_DOWN,
      drag: MOUSE_EVENTS.MOUSE_MOVE,
      dragend: MOUSE_EVENTS.MOUSE_UP,
    },
  },
  {
    family: "move",
    start: "startmove",
    end: "moveend",
    continuation: new Set(["move", "moveend"]),
    all: new Set(["startmove", "move", "moveend"]),
    triggers: {
      startmove: MOUSE_EVENTS.MOUSE_DOWN,
      move: MOUSE_EVENTS.MOUSE_MOVE,
      moveend: MOUSE_EVENTS.MOUSE_UP,
    },
  },
]

function gestureForEvent(eventName: string): GestureDefinition | undefined {
  return GESTURES.find(({ all }) => all.has(eventName))
}

export class ActionTargetResolver {
  private readonly gestureOwners = new Map<symbol, Map<GestureFamily, GestureOwner>>()

  constructor(private readonly context: TargetResolverContext) {}

  captureStartForAction<T extends string>(
    registration: TargetRegistration,
    eventName: string,
    available: boolean,
    originEvent: Event,
    triggerEvents: TriggerEvents<T>,
    eventDefinitions: EventDefinitionLookup
  ): GestureFamily | undefined {
    if (!(originEvent instanceof MouseEvent)) return undefined

    const gesture = GESTURES.find(({ start }) => start === eventName)
    if (
      !gesture ||
      !this.shouldCaptureStart(registration, gesture, triggerEvents, eventDefinitions)
    ) {
      return undefined
    }

    this.captureGestureStart(registration, gesture, available, originEvent, triggerEvents)
    return gesture.family
  }

  captureRemainingStarts<T extends string>(
    registration: TargetRegistration,
    capturedFamilies: ReadonlySet<GestureFamily>,
    available: boolean,
    originEvent: Event,
    triggerEvents: TriggerEvents<T>,
    eventDefinitions: EventDefinitionLookup
  ) {
    if (!(originEvent instanceof MouseEvent)) return

    GESTURES.forEach((gesture) => {
      if (capturedFamilies.has(gesture.family)) return
      if (
        !this.shouldCaptureStart(
          registration,
          gesture,
          triggerEvents,
          eventDefinitions
        )
      ) return
      this.captureGestureStart(registration, gesture, available, originEvent, triggerEvents)
    })
  }

  resolve<T extends string>(
    registration: TargetRegistration,
    eventName: string,
    sourceEvent: ActionEvent<T>,
    eventDefinition: EventProps<T>,
    originEvent: Event
  ): TargetDecision {
    const gesture = gestureForEvent(eventName)
    const isGesturePhase = originEvent instanceof MouseEvent &&
      gesture?.triggers[eventName] === eventDefinition.trigger
    if (gesture && isGesturePhase) {
      return this.resolveGestureTarget(
        registration.id,
        gesture,
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

  clearGestureOwners() {
    this.gestureOwners.clear()
  }

  releaseCompletedGestures<T extends string>(
    originEvent: Event,
    triggerEvents: TriggerEvents<T>
  ) {
    if (!(originEvent instanceof MouseEvent)) return

    const completedFamilies = GESTURES
      .filter(({ end, triggers }) => {
        const terminal = triggerEvents[end]
        return terminal && terminal.event.trigger === triggers[end]
      })
      .map(({ family }) => family)
    if (completedFamilies.length === 0) return

    this.gestureOwners.forEach((owners, listenerId) => {
      completedFamilies.forEach((family) => owners.delete(family))
      if (owners.size === 0) this.gestureOwners.delete(listenerId)
    })
  }

  private resolveGestureTarget<T extends string>(
    listenerId: symbol,
    gesture: GestureDefinition,
    eventName: string,
    sourceEvent: ActionEvent<T>,
    eventDefinition: EventProps<T>,
    originEvent: Event
  ): TargetDecision {
    const owner = this.gestureOwners.get(listenerId)?.get(gesture.family)
    if (!owner || owner.kind === "none") return { kind: "skip" }

    if (
      gesture.continuation.has(eventName) &&
      !this.acceptsTarget(
        owner.child,
        eventName,
        sourceEvent,
        eventDefinition,
        originEvent
      )
    ) {
      return { kind: "skip" }
    }

    return { kind: "target", target: owner.child }
  }

  private findPointerTarget<T extends string>(
    registration: TargetRegistration,
    eventName: string,
    sourceEvent: ActionEvent<T>,
    eventDefinition: EventProps<T>,
    originEvent: Event
  ): StayInstantChild | undefined {
    const point = (sourceEvent as any).point
    if (!point) return undefined

    return this.context
      .hitTest({ point, selector: registration.selector, sortBy: registration.sortBy })
      .find((child) =>
        this.acceptsTarget(child, eventName, sourceEvent, eventDefinition, originEvent)
      )
  }

  private targetIfAccepted<T extends string>(
    target: StayInstantChild,
    eventName: string,
    sourceEvent: ActionEvent<T>,
    eventDefinition: EventProps<T>,
    originEvent: Event
  ): TargetDecision {
    return this.acceptsTarget(target, eventName, sourceEvent, eventDefinition, originEvent)
      ? { kind: "target", target }
      : { kind: "skip" }
  }

  private acceptsTarget<T extends string>(
    target: StayInstantChild,
    eventName: string,
    sourceEvent: ActionEvent<T>,
    eventDefinition: EventProps<T>,
    originEvent: Event
  ) {
    const predicate = eventDefinition.withTargetConditionCallback
    if (!predicate) return true

    return predicate({
      e: createActionEventEnvelope(sourceEvent, eventName) as any,
      store: this.context.store,
      stateStore: this.context.stateStore,
      target,
      originEvent,
    })
  }

  private setGestureOwner(
    listenerId: symbol,
    family: GestureFamily,
    owner: GestureOwner
  ) {
    let owners = this.gestureOwners.get(listenerId)
    if (!owners) {
      owners = new Map()
      this.gestureOwners.set(listenerId, owners)
    }
    owners.set(family, owner)
  }

  private shouldCaptureStart<T extends string>(
    registration: TargetRegistration,
    gesture: GestureDefinition,
    triggerEvents: TriggerEvents<T>,
    eventDefinitions: EventDefinitionLookup
  ) {
    const start = triggerEvents[gesture.start]
    return (
      Boolean(start) &&
      gesture.triggers[gesture.start] === start.event.trigger &&
      registration.eventNames.some((name) => {
        if (!gesture.all.has(name)) return false
        const definition = eventDefinitions[name]
        return !definition || definition.trigger === gesture.triggers[name]
      })
    )
  }

  private captureGestureStart<T extends string>(
    registration: TargetRegistration,
    gesture: GestureDefinition,
    available: boolean,
    originEvent: Event,
    triggerEvents: TriggerEvents<T>
  ) {
    if (!available) {
      this.setGestureOwner(registration.id, gesture.family, { kind: "none" })
      return
    }

    const start = triggerEvents[gesture.start]!
    const target = this.findPointerTarget(
      registration,
      gesture.start,
      start.info,
      start.event,
      originEvent
    )
    this.setGestureOwner(
      registration.id,
      gesture.family,
      target ? { kind: "child", child: target } : { kind: "none" }
    )
  }
}

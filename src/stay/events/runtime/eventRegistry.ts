import type { EventProps, StayEventProps } from "../../../types/events"
import {
  describeEventDefinition,
  type EventDefinitionRole,
  type EventDefinitionScope,
} from "../gesturePhases"

export type RegisteredEvent<EventName extends string, Origin = Event> = {
  definition: StayEventProps<EventName, never, never, Origin>
  role: EventDefinitionRole
  scope: EventDefinitionScope
}

type RegisteredEventSlots<EventName extends string, Origin> = {
  persistent?: RegisteredEvent<EventName, Origin>
  pointerSession?: RegisteredEvent<EventName, Origin>
}

export class EventRegistry<EventName extends string, Origin = Event> {
  private readonly events = new Map<EventName, RegisteredEventSlots<EventName, Origin>>()

  register({
    name,
    trigger,
    conditionCallback,
    successCallback,
    withTargetConditionCallback,
  }: EventProps<EventName, never, never, Origin>, scope: EventDefinitionScope = { kind: "persistent" }) {
    const registered: RegisteredEvent<EventName, Origin> = {
      definition: {
        name,
        trigger,
        conditionCallback: conditionCallback || (() => true),
        successCallback: successCallback || (() => void 0),
        withTargetConditionCallback,
      },
      role: describeEventDefinition(name, trigger),
      scope,
    }
    const slots = this.getOrCreateSlots(name)
    if (scope.kind === "persistent") {
      slots.persistent = registered
      slots.pointerSession = undefined
    } else {
      slots.pointerSession = registered
    }
    return registered
  }

  getRegistered(
    name: string,
    pointerSessionId?: number
  ): RegisteredEvent<EventName, Origin> | undefined {
    const slots = this.events.get(name as EventName)
    if (!slots) return undefined
    if (
      pointerSessionId !== undefined &&
      slots.pointerSession?.scope.kind === "pointer-session" &&
      slots.pointerSession.scope.sessionId === pointerSessionId
    ) {
      return slots.pointerSession
    }
    return slots.persistent
  }

  delete(name: EventName) {
    const slots = this.events.get(name)
    if (!slots) return

    slots.persistent = undefined
    this.deleteEmptySlots(name, slots)
  }

  deleteResolved(name: EventName, pointerSessionId?: number) {
    const slots = this.events.get(name)
    if (!slots) return

    if (
      pointerSessionId !== undefined &&
      slots.pointerSession?.scope.kind === "pointer-session" &&
      slots.pointerSession.scope.sessionId === pointerSessionId
    ) {
      slots.pointerSession = undefined
    } else {
      slots.persistent = undefined
    }
    this.deleteEmptySlots(name, slots)
  }

  clearPointerSession(pointerSessionId: number) {
    this.events.forEach((slots, name) => {
      if (
        slots.pointerSession?.scope.kind === "pointer-session" &&
        slots.pointerSession.scope.sessionId === pointerSessionId
      ) {
        slots.pointerSession = undefined
      }
      this.deleteEmptySlots(name, slots)
    })
  }

  clear() {
    this.events.clear()
  }

  names(): EventName[] {
    return [...this.events.keys()]
  }

  private getOrCreateSlots(name: EventName) {
    let slots = this.events.get(name)
    if (!slots) {
      slots = {}
      this.events.set(name, slots)
    }
    return slots
  }

  private deleteEmptySlots(
    name: EventName,
    slots: RegisteredEventSlots<EventName, Origin>
  ) {
    if (!slots.persistent && !slots.pointerSession) {
      this.events.delete(name)
    }
  }
}

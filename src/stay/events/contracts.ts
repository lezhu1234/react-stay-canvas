import type {
  ActionEvent,
  EventProps,
  PointerSessionCancelReason,
} from "../../types/events"
import type {
  EventDefinitionRole,
  EventDefinitionScope,
} from "./gesturePhases"
import type {
  CoordinateFrame,
  PointerCoordinates,
  PointerSamples,
} from "../coordinates/coordinateSystem"

export type PointerSample = {
  clientX: number
  clientY: number
}

export type PointerSessionRef = {
  id: number
  startedAt: number
  pointerId?: number
  pointerType: string
  initiatingButton: number
}

export type PointerSessionTransition = {
  phase: "start" | "continue" | "end" | "cancel"
  outcome?: "released" | "implicit-release" | "cancelled"
  cancelReason?: PointerSessionCancelReason
}

export type EventInput = {
  originEvent: Event
  pressedKeys: ReadonlySet<string>
  pointerSample?: PointerSample
  pointerSamples?: PointerSamples
  rawAction?: { trigger: string }
  pointerSession?: PointerSessionRef
  sessionTransition?: PointerSessionTransition
}

export type EventInputSink = (input: EventInput) => void

export type EventInputPort = {
  handleInput(input: EventInput): void
}

export type EventDefinitionLookup = {
  get(name: string): {
    trigger: string
    role: EventDefinitionRole
    scope: EventDefinitionScope
  } | undefined
}

// Input adapters and event definitions produce normalized action data. A Child
// target is attached only when ActionRouter creates a routed listener envelope.
export type NormalizedActionEvent<EventName extends string> = Omit<
  ActionEvent<EventName>,
  "target"
>

export type EvaluatedActions<EventName extends string> = Partial<
  Record<EventName, {
    info: NormalizedActionEvent<EventName>
    coordinates?: PointerCoordinates
    coordinateFrame?: CoordinateFrame
    event: EventProps<EventName>
    role: EventDefinitionRole
    scope: EventDefinitionScope
    sessionId?: number
  }>
>

export type ActionRoutePort<EventName extends string> = {
  dispatch(
    originEvent: Event,
    triggerEvents: EvaluatedActions<EventName>,
    payload: Record<string, any>,
    eventDefinitions: EventDefinitionLookup
  ): void
  endPointerSession(sessionId: number): void
  clearGestureOwners(): void
}

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
import type { CanvasInputSource } from "./input/forwardedInput"

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

export type EventInput<Origin = Event> = {
  originEvent: Origin
  source?: CanvasInputSource
  pressedKeys: ReadonlySet<string>
  pointerSample?: PointerSample
  pointerSamples?: PointerSamples
  rawAction?: { trigger: string }
  pointerSession?: PointerSessionRef
  sessionTransition?: PointerSessionTransition
}

export type EventInputSink<Origin = Event> = (input: EventInput<Origin>) => void

export type EventInputPort<Origin = Event> = {
  handleInput(input: EventInput<Origin>): void
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

export type EvaluatedActions<EventName extends string, Origin = Event> = Partial<
  Record<EventName, {
    info: NormalizedActionEvent<EventName>
    coordinates?: PointerCoordinates
    coordinateFrame?: CoordinateFrame
    event: EventProps<EventName, never, never, Origin>
    role: EventDefinitionRole
    scope: EventDefinitionScope
    sessionId?: number
  }>
>

export type ActionRoutePort<EventName extends string, Origin = Event> = {
  dispatch(
    originEvent: Origin,
    triggerEvents: EvaluatedActions<EventName, Origin>,
    payload: Record<string, any>,
    eventDefinitions: EventDefinitionLookup
  ): void
  endPointerSession(sessionId: number): void
  clearGestureOwners(): void
}

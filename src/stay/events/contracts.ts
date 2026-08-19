import type { ActionEvent, EventProps } from "../../types/events"

export type EventInput = {
  originEvent: Event
  trigger: string
  pressedKeys: ReadonlySet<string>
}

export type EventInputSink = (input: EventInput) => void

export type EventInputPort = {
  handleInput(input: EventInput): void
}

export type EventDefinitionLookup = {
  get(name: string): { trigger?: string } | undefined
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
    event: EventProps<EventName>
  }>
>

export type ActionRoutePort<EventName extends string> = {
  dispatch(
    originEvent: Event,
    triggerEvents: EvaluatedActions<EventName>,
    payload: Record<string, any>,
    eventDefinitions: EventDefinitionLookup
  ): void
  endGesture(): void
}

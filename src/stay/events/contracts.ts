import type { TriggerEvents } from "../../types/events"

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

export type ActionRoutePort = {
  dispatch<T extends string>(
    originEvent: Event,
    triggerEvents: TriggerEvents<T>,
    payload: Record<string, any>,
    eventDefinitions: EventDefinitionLookup
  ): void
  endGesture(): void
}

import { EventProps, StayEventProps } from "../types"

export class EventRegistry<EventName extends string> {
  private readonly definitions = new Map<EventName, StayEventProps<EventName>>()

  register({
    name,
    trigger,
    conditionCallback,
    successCallback,
    withTargetConditionCallback,
  }: EventProps<EventName>) {
    this.definitions.set(name, {
      name,
      trigger,
      conditionCallback: conditionCallback || (() => true),
      successCallback: successCallback || (() => void 0),
      withTargetConditionCallback,
    })
  }

  registerAll(definitions: EventProps<EventName>[]) {
    definitions.forEach((definition) => this.register(definition))
  }

  get(name: string): StayEventProps<EventName> | undefined {
    return this.definitions.get(name as EventName)
  }

  delete(name: EventName) {
    this.definitions.delete(name)
  }

  clear() {
    this.definitions.clear()
  }

  names(): EventName[] {
    return [...this.definitions.keys()]
  }
}

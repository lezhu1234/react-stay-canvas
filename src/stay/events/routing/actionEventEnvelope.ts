import { ActionEvent } from "../../../userTypes"

function wrapNativeEvent(source: Event, eventName: string): Event & { name: string } {
  const overrides = new Map<PropertyKey, any>([["name", eventName]])
  const deleted = new Set<PropertyKey>()
  const point = (source as any).point
  const pressedKeys = (source as any).pressedKeys
  if (point) overrides.set("point", { ...point })
  if (pressedKeys instanceof Set) overrides.set("pressedKeys", new Set(pressedKeys))

  return new Proxy(source, {
    get(target, key) {
      if (deleted.has(key)) return undefined
      if (overrides.has(key)) return overrides.get(key)
      const value = Reflect.get(target, key, target)
      return typeof value === "function" && key !== "constructor"
        ? value.bind(target)
        : value
    },
    set(_target, key, value) {
      deleted.delete(key)
      overrides.set(key, value)
      return true
    },
    defineProperty(_target, key, descriptor) {
      deleted.delete(key)
      overrides.set(key, descriptor.value)
      return true
    },
    deleteProperty(_target, key) {
      overrides.delete(key)
      deleted.add(key)
      return true
    },
    has(target, key) {
      return !deleted.has(key) && (overrides.has(key) || Reflect.has(target, key))
    },
  }) as Event & { name: string }
}

export function createActionEventEnvelope<EventName extends string>(
  source: ActionEvent<EventName> | Event,
  eventName: string
): ActionEvent<EventName> {
  if (source instanceof Event) {
    return wrapNativeEvent(source, eventName) as unknown as ActionEvent<EventName>
  }

  return {
    ...source,
    name: eventName,
    pressedKeys: new Set(source.pressedKeys),
    ...((source as any).point ? { point: { ...(source as any).point } } : {}),
  } as ActionEvent<EventName>
}

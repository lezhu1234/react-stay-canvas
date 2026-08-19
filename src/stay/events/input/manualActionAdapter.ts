import type {
  ManualActionEvent,
  ManualTriggerEvents,
} from "../../../types/manualActions"
import type { NormalizedActionEvent } from "../contracts"

function isNativeEvent(source: unknown): source is Event {
  if (!source || typeof source !== "object") return false
  if (typeof Event !== "undefined" && source instanceof Event) return true

  // `instanceof` is realm-specific. The native brand is preserved when an
  // Event crosses a same-origin iframe boundary.
  return /^\[object [^\]]*Event\]$/.test(Object.prototype.toString.call(source))
}

function normalizeAction<EventName extends string>(
  eventName: EventName,
  currentState: string,
  source: ManualActionEvent
): NormalizedActionEvent<EventName> {
  if (isNativeEvent(source)) {
    throw new TypeError(
      "Manual action info must be plain action data; pass the native Event as originEvent"
    )
  }

  const actionEvent: NormalizedActionEvent<EventName> = {
    state: source.state ?? currentState,
    name: eventName,
    pressedKeys: new Set(source.pressedKeys),
    isMouseEvent: source.isMouseEvent ?? false,
  }

  if (source.x !== undefined) actionEvent.x = source.x
  if (source.y !== undefined) actionEvent.y = source.y
  if (source.point) actionEvent.point = { ...source.point }
  if (source.key !== undefined) actionEvent.key = source.key
  if (source.deltaX !== undefined) actionEvent.deltaX = source.deltaX
  if (source.deltaY !== undefined) actionEvent.deltaY = source.deltaY
  if (source.deltaZ !== undefined) actionEvent.deltaZ = source.deltaZ
  return actionEvent
}

export function normalizeManualActions<EventName extends string>(
  triggerEvents: ManualTriggerEvents<EventName>,
  currentState: string
): ReadonlyMap<EventName, NormalizedActionEvent<EventName>> {
  const actions = new Map<EventName, NormalizedActionEvent<EventName>>()
  const eventNames = Object.keys(triggerEvents) as EventName[]

  eventNames.forEach((eventName) => {
    const triggered = triggerEvents[eventName]
    if (!triggered) return
    actions.set(eventName, normalizeAction(eventName, currentState, triggered.info))
  })

  return actions
}

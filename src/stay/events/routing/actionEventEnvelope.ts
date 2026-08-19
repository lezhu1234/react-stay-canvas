import type { ActionEvent } from "../../../types/events"
import type { NormalizedActionEvent } from "../contracts"

export function createActionEventEnvelope<EventName extends string>(
  source: NormalizedActionEvent<EventName>,
  eventName: EventName
): ActionEvent<EventName> {
  const envelope: ActionEvent<EventName> = {
    state: source.state,
    name: eventName,
    pressedKeys: new Set(source.pressedKeys),
    isMouseEvent: source.isMouseEvent,
  }

  if (source.x !== undefined) envelope.x = source.x
  if (source.y !== undefined) envelope.y = source.y
  if (source.point) envelope.point = { ...source.point }
  if (source.key !== undefined) envelope.key = source.key
  if (source.deltaX !== undefined) envelope.deltaX = source.deltaX
  if (source.deltaY !== undefined) envelope.deltaY = source.deltaY
  if (source.deltaZ !== undefined) envelope.deltaZ = source.deltaZ
  return envelope
}

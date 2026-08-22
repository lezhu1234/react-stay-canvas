import type { ActionEvent } from "react-stay-canvas"

export type PositionedActionEvent<EventName extends string = string> =
  ActionEvent<EventName> &
    Required<Pick<ActionEvent<EventName>, "x" | "y" | "point">>

export type TargetedPointerActionEvent<EventName extends string = string> =
  PositionedActionEvent<EventName> &
    Required<Pick<ActionEvent<EventName>, "target">>

export function hasPointerPosition<EventName extends string>(
  event: ActionEvent<EventName>
): event is PositionedActionEvent<EventName> {
  return event.x !== undefined && event.y !== undefined && event.point !== undefined
}

export function hasPointerTarget<EventName extends string>(
  event: ActionEvent<EventName>
): event is TargetedPointerActionEvent<EventName> {
  return hasPointerPosition(event) && event.target !== undefined
}

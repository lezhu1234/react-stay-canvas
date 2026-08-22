import type { Coordinate } from "./geometry"

export interface ManualActionEvent {
  state?: string
  pressedKeys?: ReadonlySet<string>
  isMouseEvent?: boolean
  x?: number
  y?: number
  point?: Coordinate
  key?: string
  deltaX?: number
  deltaY?: number
  deltaZ?: number
}

export type ManualTriggerEvents<EventName extends string = string> = Partial<
  Record<EventName, { info: ManualActionEvent }>
>

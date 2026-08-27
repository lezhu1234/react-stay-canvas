import type Canvas from "../canvas"
import type { InstantShape } from "../shapes/instantShape"
import type { StayInstantChild } from "../stay/children/stayInstantChild"
import type { FRAME_EVENT_NAME, KEYBOARRD_EVENTS, MOUSE_EVENTS } from "../userConstants"
import type { ChildSortFunction } from "./children"
import type { Dict, storeType, valueof } from "./common"
import type { ContentPoint, ViewVector } from "./coordinates"
import type { ManualTriggerEvents } from "./manualActions"
import type { StayTools } from "./tools"

export type PredefinedWheelEventName = "wheel" | "zoomout" | "zoomin"

export type PredefinedMouseEventName =
  | "mousedown"
  | "dragover"
  | "drop"
  | "mouseup"
  | "startmove"
  | "move"
  | "moveend"
  | "dragstart"
  | "drag"
  | "dragend"
  | "mouseleave"
  | "mouseenter"
  | "mousemove"
  | "click"
  | "hover"
  | PredefinedWheelEventName

export type PredefinedKeyEventName = "keydown" | "keyup" | "undo" | "redo"

export type PredefinedEventName = PredefinedMouseEventName | PredefinedKeyEventName

export type PointerSessionCancelReason =
  | "pointercancel"
  | "lostpointercapture"
  | "blur"
  | "visibilitychange"
  | "resize"

export interface ActionEvent<EventName extends string = string> {
  state: string
  pressedKeys: Set<string>
  name: EventName
  isMouseEvent: boolean
  // Action names do not imply an input source: a manual action may use a
  // predefined name without carrying pointer, keyboard, wheel, or target data.
  target?: StayInstantChild
  x?: number
  y?: number
  point?: ContentPoint
  movement?: ViewVector
  key?: string
  deltaX?: number
  deltaY?: number
  deltaZ?: number
  pointerId?: number
  pointerType?: string
  cancelled?: boolean
  cancelReason?: PointerSessionCancelReason
}

export interface MouseActionEvent<EventName extends PredefinedMouseEventName>
  extends ActionEvent<EventName> {
  x: number
  y: number
  point: ContentPoint
  movement?: ViewVector
  isMouseEvent: true
}

export interface KeyActionEvent<EventName extends PredefinedKeyEventName>
  extends ActionEvent<EventName> {
  key: string
  isMouseEvent: false
}

export interface WheelActionEvent<EventName extends PredefinedWheelEventName>
  extends MouseActionEvent<EventName> {
  deltaX: number
  deltaY: number
  deltaZ: number
}

export interface AnyActionEvent extends ActionEvent<string> {}

export interface ActionCallbackProps<
  T = Dict,
  EventName extends string = string,
  CS = Record<string, any>
> {
  originEvent: Event
  e: ActionEvent<EventName>
  store: storeType
  stateStore: storeType
  composeStore: CS
  canvas: Canvas
  tools: StayTools
  payload: T
}

export type CallbackFuncMap<
  T extends ActionCallbackProps<U, EventName>,
  U,
  EventName extends string,
  CS = Record<string, any>
> = {
  [key in T["e"]["name"]]?: () => Partial<CS> | void | undefined
}

export type UserCallback<T, EventName extends string, CS = Record<string, any>> = (
  p: ActionCallbackProps<T, EventName, CS>
) =>
  | CallbackFuncMap<ActionCallbackProps<T, EventName>, T, EventName, CS>
  | void

export type ListenerNamePayloadPairOrName = ListenerNamePayloadPair | string

export interface ListenerNamePayloadPair {
  name: any
  payload: any
}

export type GetListenerNamePayloadPairByName<T extends string> = {
  name: T
  payload: Dict
}

export type ConvertListenerNamePayloadPairOrNameToListenerNamePayloadPair<
  T extends ListenerNamePayloadPairOrName[]
> = T extends [infer R, ...infer U]
  ? U extends ListenerNamePayloadPairOrName[]
    ? [
        R extends string ? GetListenerNamePayloadPairByName<R> : R,
        ...ConvertListenerNamePayloadPairOrNameToListenerNamePayloadPair<U>
      ]
    : []
  : []

export interface ListenerProps<
  T extends ListenerNamePayloadPair = ListenerNamePayloadPair,
  EventName extends string = string,
  CS = Record<string, any>
> {
  name: T["name"]
  state?: string
  selector?: string
  event: EventName | EventName[]
  sortBy?: ChildSortFunction
  callback: UserCallback<T["payload"], EventName, CS>
}

export interface PredefinedEventListenerProps<
  EventName extends PredefinedEventName = PredefinedEventName,
  CS = Record<string, any>
> {
  name: string
  state?: string
  selector?: string
  event: EventName | EventName[]
  sortBy?: ChildSortFunction
  callback: UserCallback<Dict, EventName, CS>
}

export interface FireEvent {
  (e: KeyboardEvent | MouseEvent | WheelEvent, trigger: string): void
}

export interface UserCallbackTools {
  deleteEvent: (name: string) => void
}

export interface UserSuccessCallbackProps<EventName extends string> {
  e: ActionEvent<EventName>
  store: storeType
  stateStore: storeType
  deleteEvent: (name: EventName) => void
}

export interface UserConditionCallbackProps<EventName extends string> {
  e: ActionEvent<EventName>
  store: storeType
  stateStore: storeType
}

export interface UserConditionCallbackFunction<EventName extends string> {
  (props: UserConditionCallbackProps<EventName>): boolean
}

export type StayEventMap<EventName extends string> = {
  [key in EventName]: StayEventProps<EventName>
}

export interface StayEventRequiredProps<EventName extends string> {
  name: EventName
  trigger:
    | valueof<typeof MOUSE_EVENTS>
    | valueof<typeof KEYBOARRD_EVENTS>
    | typeof FRAME_EVENT_NAME
}

export interface StayEventChooseProps<EventName extends string> {
  conditionCallback: UserConditionCallbackFunction<EventName>
  successCallback: (
    props: UserSuccessCallbackProps<EventName>
  ) => void | EventProps<EventName> | EventProps<EventName>[]
}

export type StayEventProps<EventName extends string> = StayEventRequiredProps<EventName> &
  StayEventChooseProps<EventName> & {
    withTargetConditionCallback?: (props: {
      originEvent: Event
      e: ActionEvent<EventName>
      store: storeType
      stateStore: storeType
      target: StayInstantChild<InstantShape>
    }) => boolean
  }

export type EventProps<EventName extends string> = StayEventRequiredProps<EventName> &
  Partial<StayEventChooseProps<EventName>> & {
    withTargetConditionCallback?: (props: {
      originEvent: Event
      e: ActionEvent<EventName>
      store: storeType
      stateStore: storeType
      target: StayInstantChild<InstantShape>
    }) => boolean
  }

/** @deprecated Use ManualTriggerEvents for StayTools.triggerAction. */
export type TriggerEvents<EventName extends string> = ManualTriggerEvents<EventName>

export type Contra<T> = T extends any ? (arg: T) => void : never

export type InferContra<T> = [T] extends [(arg: infer I) => void] ? I : never

export type PickOne<T> = InferContra<InferContra<Contra<Contra<T>>>>

export type Union2Tuple<T> = PickOne<T> extends infer U
  ? Exclude<T, U> extends never
    ? [T]
    : [...Union2Tuple<Exclude<T, U>>, U]
  : never

export type Insert<T extends unknown[], U> = T extends [infer F, ...infer L]
  ? [F, U, ...L] | [F, ...Insert<L, U>]
  : [U]

export type PermutationsOfTuple<T extends unknown[], R extends unknown[] = []> = T extends [
  infer F,
  ...infer L
]
  ? PermutationsOfTuple<L, Insert<R, F> | [F, ...R]>
  : R

export type DisOrderArr<T> = PermutationsOfTuple<Union2Tuple<T>>

export type UnionListenerProps<
  T extends ListenerNamePayloadPair[],
  EventName extends string = string
> = {
  [key in keyof T]: ListenerProps<T[key], EventName>
}

export type ListenerArrayProps<
  T extends ListenerNamePayloadPairOrName[],
  EventName extends string = string
> = UnionListenerProps<
  ConvertListenerNamePayloadPairOrNameToListenerNamePayloadPair<T>,
  EventName
>

export type Tuple2Union<T extends unknown[]> = T extends [infer F, ...infer L]
  ? F | Tuple2Union<L>
  : never

export type LisenerTupleToLisenerUnion<T extends ListenerNamePayloadPairOrName[]> = Tuple2Union<
  ConvertListenerNamePayloadPairOrNameToListenerNamePayloadPair<T>
>

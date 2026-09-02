import type Canvas from "../canvas"
import type { InstantShape } from "../shapes/instantShape"
import type { StayInstantChild } from "../stay/children/stayInstantChild"
import type { FRAME_EVENT_NAME, KEYBOARRD_EVENTS, MOUSE_EVENTS } from "../userConstants"
import type { ChildSortFunction } from "./children"
import type { Dict, StayStoreFor, valueof } from "./common"
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
  CS = Record<string, any>,
  StoreSchema extends object = never,
  StateStoreSchema extends object = never,
> {
  originEvent: Event
  e: ActionEvent<EventName>
  store: StayStoreFor<StoreSchema>
  stateStore: StayStoreFor<StateStoreSchema>
  composeStore: CS
  canvas: Canvas
  tools: StayTools
  payload: T
}

export type CallbackFuncMap<
  T extends ActionCallbackProps<
    U,
    EventName,
    CS,
    StoreSchema,
    StateStoreSchema
  >,
  U,
  EventName extends string,
  CS = Record<string, any>,
  StoreSchema extends object = never,
  StateStoreSchema extends object = never,
> = {
  [key in T["e"]["name"]]?: () => Partial<CS> | void | undefined
}

export type UserCallback<
  T,
  EventName extends string,
  CS = Record<string, any>,
  StoreSchema extends object = never,
  StateStoreSchema extends object = never,
> = (
  p: ActionCallbackProps<T, EventName, CS, StoreSchema, StateStoreSchema>
) =>
  | CallbackFuncMap<
      ActionCallbackProps<T, EventName, CS, StoreSchema, StateStoreSchema>,
      T,
      EventName,
      CS,
      StoreSchema,
      StateStoreSchema
    >
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
  CS = Record<string, any>,
  StoreSchema extends object = never,
  StateStoreSchema extends object = never,
> {
  name: T["name"]
  state?: string
  selector?: string
  event: EventName | EventName[]
  sortBy?: ChildSortFunction
  callback: UserCallback<
    T["payload"],
    EventName,
    CS,
    StoreSchema,
    StateStoreSchema
  >
}

export interface PredefinedEventListenerProps<
  EventName extends PredefinedEventName = PredefinedEventName,
  CS = Record<string, any>,
  StoreSchema extends object = never,
  StateStoreSchema extends object = never,
> {
  name: string
  state?: string
  selector?: string
  event: EventName | EventName[]
  sortBy?: ChildSortFunction
  callback: UserCallback<Dict, EventName, CS, StoreSchema, StateStoreSchema>
}

export interface FireEvent {
  (e: KeyboardEvent | MouseEvent | WheelEvent, trigger: string): void
}

export interface UserCallbackTools {
  deleteEvent: (name: string) => void
}

export interface UserSuccessCallbackProps<
  EventName extends string,
  StoreSchema extends object = never,
  StateStoreSchema extends object = never,
> {
  e: ActionEvent<EventName>
  store: StayStoreFor<StoreSchema>
  stateStore: StayStoreFor<StateStoreSchema>
  deleteEvent: (name: EventName) => void
}

export interface UserConditionCallbackProps<
  EventName extends string,
  StoreSchema extends object = never,
  StateStoreSchema extends object = never,
> {
  e: ActionEvent<EventName>
  store: StayStoreFor<StoreSchema>
  stateStore: StayStoreFor<StateStoreSchema>
}

export interface UserConditionCallbackFunction<
  EventName extends string,
  StoreSchema extends object = never,
  StateStoreSchema extends object = never,
> {
  (props: UserConditionCallbackProps<EventName, StoreSchema, StateStoreSchema>): boolean
}

export type StayEventMap<
  EventName extends string,
  StoreSchema extends object = never,
  StateStoreSchema extends object = never,
> = {
  [key in EventName]: StayEventProps<EventName, StoreSchema, StateStoreSchema>
}

export interface StayEventRequiredProps<EventName extends string> {
  name: EventName
  trigger:
    | valueof<typeof MOUSE_EVENTS>
    | valueof<typeof KEYBOARRD_EVENTS>
    | typeof FRAME_EVENT_NAME
}

export interface StayEventChooseProps<
  EventName extends string,
  StoreSchema extends object = never,
  StateStoreSchema extends object = never,
> {
  conditionCallback: UserConditionCallbackFunction<
    EventName,
    StoreSchema,
    StateStoreSchema
  >
  successCallback: (
    props: UserSuccessCallbackProps<EventName, StoreSchema, StateStoreSchema>
  ) =>
    | void
    | EventProps<EventName, StoreSchema, StateStoreSchema>
    | EventProps<EventName, StoreSchema, StateStoreSchema>[]
}

export type StayEventProps<
  EventName extends string,
  StoreSchema extends object = never,
  StateStoreSchema extends object = never,
> = StayEventRequiredProps<EventName> &
  StayEventChooseProps<EventName, StoreSchema, StateStoreSchema> & {
    withTargetConditionCallback?: (props: {
      originEvent: Event
      e: ActionEvent<EventName>
      store: StayStoreFor<StoreSchema>
      stateStore: StayStoreFor<StateStoreSchema>
      target: StayInstantChild<InstantShape>
    }) => boolean
  }

export type EventProps<
  EventName extends string,
  StoreSchema extends object = never,
  StateStoreSchema extends object = never,
> = StayEventRequiredProps<EventName> &
  Partial<StayEventChooseProps<EventName, StoreSchema, StateStoreSchema>> & {
    withTargetConditionCallback?: (props: {
      originEvent: Event
      e: ActionEvent<EventName>
      store: StayStoreFor<StoreSchema>
      stateStore: StayStoreFor<StateStoreSchema>
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
  EventName extends string = string,
  StoreSchema extends object = never,
  StateStoreSchema extends object = never,
> = {
  [key in keyof T]: ListenerProps<
    T[key],
    EventName,
    Record<string, any>,
    StoreSchema,
    StateStoreSchema
  >
}

export type ListenerArrayProps<
  T extends ListenerNamePayloadPairOrName[],
  EventName extends string = string,
  StoreSchema extends object = never,
  StateStoreSchema extends object = never,
> = UnionListenerProps<
  ConvertListenerNamePayloadPairOrNameToListenerNamePayloadPair<T>,
  EventName,
  StoreSchema,
  StateStoreSchema
>

export type Tuple2Union<T extends unknown[]> = T extends [infer F, ...infer L]
  ? F | Tuple2Union<L>
  : never

export type LisenerTupleToLisenerUnion<T extends ListenerNamePayloadPairOrName[]> = Tuple2Union<
  ConvertListenerNamePayloadPairOrNameToListenerNamePayloadPair<T>
>

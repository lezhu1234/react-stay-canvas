import { InstantShape } from "./shapes"
import { Rectangle } from "./shapes/rectangle"
import { StayInstantChild } from "./stay/child/stayInstantChild"
import { valueof } from "./stay/types"
import { FRAME_EVENT_NAME, KEYBOARRD_EVENTS, MOUSE_EVENTS } from "./userConstants"
import {
  ActionCallbackProps,
  ActionEvent,
  ListenerProps,
  PredefinedEventListenerProps,
  PredefinedEventName,
  PredefinedKeyEventName,
  PredefinedMouseEventName,
  PredefinedWheelEventName,
  StayMode,
  BasicTools,
  storeType,
  StayTools,
} from "./userTypes"

export interface composeProps {
  status?: string
  area?: Rectangle[] | Rectangle
  event?: string
}
interface AreaProps {
  x: number
  y: number
  width: number
  height: number
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

export type CallbackFuncMap<
  T extends ActionCallbackProps<U, EventName>,
  U,
  EventName extends string | string[]
> = {
  [key in T["e"]["name"]]?: () => { [key: string]: any } | void | undefined
}

export type UserCallback<T, EventName extends string | string[], Mode extends StayMode> = (
  p: ActionCallbackProps<T, EventName, Mode>
) => CallbackFuncMap<ActionCallbackProps<T, EventName>, T, EventName> | void

// export interface StayAction {
//   name: string
//   state: string
//   selector: string
//   event: string[]
//   sortBy: SortChildrenMethodsValues | ChildSortFunction
//   callback: UserCallback
// }

export type StayEventMap<EventName extends string> = {
  [key in EventName]: StayEventProps<EventName>
}

export interface StayEventRequiredProps<EventName extends string> {
  name: EventName
  trigger: valueof<typeof MOUSE_EVENTS> | valueof<typeof KEYBOARRD_EVENTS> | typeof FRAME_EVENT_NAME
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

export interface ContextLayerSetFunction {
  (layer: HTMLCanvasElement): DrawCanvasContext | null
}
export interface StayCanvasProps<Mode extends StayMode, EventName extends string = string> {
  className?: string
  width?: number
  height?: number
  layers?: number | ContextLayerSetFunction[]
  eventList?: EventProps<EventName>[]
  listenerList?: (
    | ListenerProps
    | PredefinedEventListenerProps<PredefinedWheelEventName>
    | PredefinedEventListenerProps<PredefinedMouseEventName>
    | PredefinedEventListenerProps<PredefinedKeyEventName>
  )[]
  passive?: boolean
  mode: Mode
  mounted?: (tools: StayTools<Mode>) => void
  recreateOnResize?: boolean
  focusOnInit?: boolean
}
export type DrawCanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export type NumericString = `${number}` | `+${number}` | `-${number}` | number
export type ShapeConfig = {
  offsetX?: NumericString
  offsetY?: NumericString
  scale?: number
  opacity?: number
}

export type Positive<T extends number> = number extends T
  ? never
  : `${T}` extends `-${string}` | "0"
  ? never
  : T

export type Negative<T extends number> = number extends T
  ? never
  : Positive<T> extends never
  ? T extends 0
    ? never
    : T
  : never

export type NumberInRangeZeroOne<T extends number> = Positive<T> extends never
  ? T extends 0
    ? T
    : never
  : T extends number
  ? (T extends 1 ? T : never) | (`${T}` extends `0.${string}` ? T : never) | never
  : never
export type ZeroToOne = NumberInRangeZeroOne<number>

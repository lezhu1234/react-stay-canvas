import { Rectangle } from "./shapes/rectangle"
import { valueof } from "./stay/types"
import { KEYBOARRD_EVENTS, MOUSE_EVENTS } from "./userConstants"
import { ActionCallbackProps, ActionEvent, ListenerProps, StayTools, storeType } from "./userTypes"

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

export interface UserSuccessCallbackProps {
  e: ActionEvent
  store: storeType
  stateStore: storeType
  deleteEvent: (name: string) => void
}

export interface UserConditionCallbackProps {
  e: ActionEvent
  store: storeType
  stateStore: storeType
}

export interface UserConditionCallbackFunction {
  (props: UserConditionCallbackProps): boolean
}

export type CallbackFuncMap<T extends ActionCallbackProps<U>, U> = {
  [key in T["e"]["name"]]: () => { [key: string]: any } | void | undefined
}

export type UserCallback<T> = (p: ActionCallbackProps<T>) => CallbackFuncMap<typeof p, T> | void

// export interface StayAction {
//   name: string
//   state: string
//   selector: string
//   event: string[]
//   sortBy: SortChildrenMethodsValues | ChildSortFunction
//   callback: UserCallback
// }

export interface StayEventMap {
  [key: string]: StayEventProps
}

export interface StayEventRequiredProps {
  name: string
  trigger: valueof<typeof MOUSE_EVENTS> | valueof<typeof KEYBOARRD_EVENTS>
}

export interface StayEventChooseProps {
  conditionCallback: UserConditionCallbackFunction
  successCallback: (props: UserSuccessCallbackProps) => void | EventProps | EventProps[]
}

export type StayEventProps = StayEventRequiredProps & StayEventChooseProps

export type EventProps = StayEventRequiredProps & Partial<StayEventChooseProps>

export interface ContextLayerSetFunction {
  (layer: HTMLCanvasElement): DrawCanvasContext | null
}
export interface StayCanvasProps {
  className?: string
  width?: number
  height?: number
  layers?: number | ContextLayerSetFunction[]
  eventList?: EventProps[]
  listenerList?: ListenerProps[]
  passive?: boolean
  autoRender?: boolean
  mounted?: (tools: StayTools) => void
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

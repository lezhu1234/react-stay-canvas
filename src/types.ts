import { Rectangle } from "./shapes/rectangle"
import { valueof } from "./stay/types"
import { KEYBOARRD_EVENTS, MOUSE_EVENTS } from "./userConstants"
import {
  ActionCallbackProps,
  ActionEvent,
  ChildSortFunction,
  ListenerProps,
  SortChildrenMethodsValues,
  StayTools,
  storeType,
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

export type CallbackFuncMap<T extends ActionCallbackProps> = {
  [key in T["e"]["name"]]: () => { [key: string]: any }
}

export type UserCallback = (p: ActionCallbackProps) => CallbackFuncMap<typeof p> | void

export interface StayAction {
  name: string
  state: string
  selector: string
  event: string[]
  sortBy: SortChildrenMethodsValues | ChildSortFunction
  callback: UserCallback
}

export interface StayEventMap {
  [key: string]: StayEventProps
}

export interface StayEventRequiredProps {
  name: string
  trigger: valueof<typeof MOUSE_EVENTS> | valueof<typeof KEYBOARRD_EVENTS>
}

export interface StayEventChooseProps {
  conditionCallback: UserConditionCallbackFunction
  successCallback: (props: UserSuccessCallbackProps) => void | EventProps
}

export type StayEventProps = StayEventRequiredProps & StayEventChooseProps

export type EventProps = StayEventRequiredProps & Partial<StayEventChooseProps>

export interface ContextLayerSetFunction {
  (layer: HTMLCanvasElement): CanvasRenderingContext2D | null
}
export interface StayCanvasProps {
  className?: string
  width?: number
  height?: number
  layers?: number | ContextLayerSetFunction[]
  eventList?: EventProps[]
  listenerList?: ListenerProps[]
  mounted?: (tools: StayTools) => void
}

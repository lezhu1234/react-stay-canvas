import { Rectangle } from "./shapes/rectangle"
import {
  ActionCallbackProps,
  ActionEvent,
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

export interface StayAction {
  name: string
  state: string
  selector: string
  event: string[]
  sortBy: SortChildrenMethodsValues
  callback: (p: ActionCallbackProps) => { [key: string]: any } | any
  log: boolean
}

export interface StayEventMap {
  [key: string]: StayEventProps
}

export interface StayEventRequiredProps {
  name: string
  trigger: string
}

export interface StayEventChooseProps {
  conditionCallback: UserConditionCallbackFunction
  successCallback: (
    props: UserSuccessCallbackProps
  ) => void | UserStayEventProps
}

export type StayEventProps = StayEventRequiredProps & StayEventChooseProps

export type UserStayEventProps = StayEventRequiredProps &
  Partial<StayEventChooseProps>

export interface StayCanvasProps {
  className?: string
  width?: number
  height?: number
  layers?: number
  eventList?: UserStayEventProps[]
  listenerList?: ListenerProps[]
  mounted?: (tools: StayTools) => void
}

import { Point } from "./shapes/point"
import { Shape } from "./shapes/shape"
import { StayChild } from "./stay/stayChild"
import { valueof } from "./stay/types"
import { DrawActions, DrawParents, SortChildrenMethods } from "./userConstants"

type SortChildrenMethodsKeys = keyof typeof SortChildrenMethods
export type StayChildren = Record<string, StayChild>
export type DrawParentsValuesType = valueof<typeof DrawParents>
export type DrawActionsValuesType = valueof<typeof DrawActions>

export type storeType = Map<string, any>
export type Dict = Record<string, any>

export interface SimplePoint {
  x: number
  y: number
}

export interface ActionEvent {
  state: string
  name: string
  x: number
  y: number
  point: Point
  target: StayChild
  pressedKeys: Set<string>
  key: string | null
  isMouseEvent: boolean
  deltaX: number
  deltaY: number
  deltaZ: number
}

export interface createChildProps {
  id?: string
  zIndex?: number
  shape: Shape
  className: string
  individual?: boolean
}

export interface updateChildProps {
  child: StayChild
  zIndex?: number
  className?: string
  shape: Shape
  individual?: boolean
}

export interface UpdateStayChildProps {
  className?: string
  parent?: DrawParentsValuesType | undefined
  shape?: Shape | undefined
  zIndex?: number
}

export interface getContainPointChildrenProps {
  selector: string | string[]
  point: SimplePoint
  returnFirst?: boolean | undefined
  sortBy?: SortChildrenMethodsValues
}

export type SortChildrenMethodsValues =
  (typeof SortChildrenMethods)[SortChildrenMethodsKeys]

export interface ActionCallbackProps {
  originEvent: Event
  e: ActionEvent
  store: storeType
  stateStore: storeType
  composeStore: { [key: string]: any }
  tools: StayTools
  payload: Dict
}

export interface UserStayAction {
  name: string
  state?: string
  selector?: string
  event: string | string[]
  sortBy?: SortChildrenMethodsValues
  callback: (p: ActionCallbackProps) => { [key: string]: any } | any
  log?: boolean
}

export interface StayTools {
  createChild: (props: createChildProps) => StayChild
  appendChild: (props: createChildProps) => StayChild
  updateChild: (props: updateChildProps) => StayChild
  removeChild: (childId: string) => void
  getContainPointChildren: (props: getContainPointChildrenProps) => StayChild[]
  hasChild: (id: string) => boolean
  fix: () => void
  switchState: (state: string) => void
  getChildrenBySelector: (
    selector: string,
    sortBy?: SortChildrenMethodsValues
  ) => StayChild[]
  getAvailiableStates: (selector: string) => string[]
  log: () => void
  changeCursor: (cursor: string) => void
  moveStart: () => void
  move: (offsetX: number, offsetY: number) => void
  zoom: (deltaY: number, center: SimplePoint) => void
  forward: () => void
  backward: () => void
  triggerAction: (
    originEvent: Event,
    triggerEvents: { [key: string]: any },
    payload: Dict
  ) => void
  deleteListener: (name: string) => void
  forceUpdateCanvas: () => void
}

import { Point } from "./shapes/point"
import { Shape } from "./shapes/shape"
import { StepProps, valueof } from "./stay/types"
import {
  DRAW_ACTIONS,
  DRAW_PARENTS,
  SORT_CHILDREN_METHODS,
} from "./userConstants"

type SortChildrenMethodsKeys = keyof typeof SORT_CHILDREN_METHODS
export type StayChildren = Record<string, StayChild>
export type DrawParentsValuesType = valueof<typeof DRAW_PARENTS>
export type DrawActionsValuesType = valueof<typeof DRAW_ACTIONS>

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

export interface createChildProps<T> {
  id?: string
  zIndex?: number
  shape: T
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

export interface UpdateStayChildProps<T> {
  className?: string
  parent?: DrawParentsValuesType | undefined
  shape?: T | undefined
  zIndex?: number
}

export interface getContainPointChildrenProps {
  selector: string | string[]
  point: SimplePoint
  returnFirst?: boolean | undefined
  sortBy?: SortChildrenMethodsValues
}

export type SortChildrenMethodsValues =
  (typeof SORT_CHILDREN_METHODS)[SortChildrenMethodsKeys]

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
  createChild: <T extends Shape>(props: createChildProps<T>) => StayChild<T>
  appendChild: <T extends Shape>(props: createChildProps<T>) => StayChild<T>
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

export interface StayChildProps<T> {
  id?: string
  zIndex?: number
  className: string
  parent: DrawParentsValuesType
  beforeParent?: DrawParentsValuesType | null
  shape: T
  drawAction?: DrawActionsValuesType | null
}

declare class StayChild<T extends Shape = Shape> {
  beforeParent: string | null
  className: string
  drawAction: DrawParentsValuesType | null
  id: string
  parent: string
  shape: T
  zIndex: number
  constructor({
    id,
    zIndex,
    className,
    parent,
    beforeParent,
    shape,
    drawAction,
  }: StayChildProps<T>)
  static diff<T extends Shape>(
    history: StayChild<T> | undefined,
    now: StayChild<T> | undefined
  ): StepProps | undefined
  copy(): StayChild<T>
  update({ className, parent, shape, zIndex }: UpdateStayChildProps<T>): void
}

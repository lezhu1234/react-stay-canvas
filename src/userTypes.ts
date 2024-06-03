import Canvas from "./canvas"
import { Point } from "./shapes/point"
import { Shape } from "./shapes/shape"
import { StepProps, valueof } from "./stay/types"
import { DRAW_ACTIONS, SORT_CHILDREN_METHODS } from "./userConstants"

type SortChildrenMethodsKeys = keyof typeof SORT_CHILDREN_METHODS
export type StayChildren = Record<string, StayChild>
export type DrawActionsValuesType = valueof<typeof DRAW_ACTIONS>

export type storeType = Map<string, any>
export type Dict<T = any> = Record<string, T>

export interface SimplePoint {
  x: number
  y: number
}

export type StayCanvasTriggerType = {
  trigger: (name: string, payload: Dict) => void
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
  layer?: number
}

export type updateChildProps<T = Shape> = {
  child: StayChild
} & Partial<createChildProps<T>>

export interface UpdateStayChildProps<T> {
  className?: string
  layer?: number | undefined
  shape?: T | undefined
  zIndex?: number
}

export type ChildSortFunction = (a: StayChild, b: StayChild) => number
export interface getContainPointChildrenProps {
  selector: string | string[]
  point: SimplePoint
  returnFirst?: boolean | undefined
  sortBy?: SortChildrenMethodsValues | ChildSortFunction
}

export type SortChildrenMethodsValues = valueof<typeof SORT_CHILDREN_METHODS>

export interface ActionCallbackProps {
  originEvent: Event
  e: ActionEvent
  store: storeType
  stateStore: storeType
  composeStore: Record<string, any>
  canvas: Canvas
  tools: StayTools
  payload: Dict
}

type ListenerCallback = (p: ActionCallbackProps) => Record<string, any> | void

export interface ListenerProps {
  name: string
  state?: string
  selector?: string
  event: string | string[]
  sortBy?: SortChildrenMethodsValues | ChildSortFunction
  callback: ListenerCallback
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
    sortBy?: SortChildrenMethodsValues | ChildSortFunction
  ) => StayChild[]
  getAvailiableStates: (selector: string) => string[]
  changeCursor: (cursor: string) => void
  moveStart: () => void
  move: (offsetX: number, offsetY: number) => void
  zoom: (deltaY: number, center: SimplePoint) => void
  log: () => void
  forward: () => void
  backward: () => void
  triggerAction: (originEvent: Event, triggerEvents: Record<string, any>, payload: Dict) => void
  deleteListener: (name: string) => void
  forceUpdateCanvas: () => void
}

export interface StayChildProps<T> {
  id?: string
  zIndex?: number
  className: string
  layer: number
  beforeLayer?: number | null
  shape: T
  drawAction?: DrawActionsValuesType | null
}

export declare class StayChild<T extends Shape = Shape> {
  beforeLayer: number | null
  className: string
  drawAction: DrawActionsValuesType | null
  id: string
  layer: number
  shape: T
  zIndex: number
  constructor({ id, zIndex, className, layer, beforeLayer, shape, drawAction }: StayChildProps<T>)
  static diff<T extends Shape>(
    history: StayChild<T> | undefined,
    now: StayChild<T> | undefined
  ): StepProps | undefined
  copy(): StayChild<T>
  update({ className, layer, shape, zIndex }: UpdateStayChildProps<T>): void
}

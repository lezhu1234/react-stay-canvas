import Canvas from "./canvas"
import { Point } from "./shapes/point"
import { Shape } from "./shapes/shape"
import { StayChild } from "./stay/stayChild"
import { valueof } from "./stay/types"
import { UserCallback } from "./types"
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

export type StayCanvasRefType = {
  trigger: (name: string, payload?: Dict) => void
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
  duration?: number
  transitionType?: EasingFunction
}

export type updateChildProps<T = Shape> = {
  child: StayChild
} & Partial<createChildProps<T>>

export interface UpdateStayChildProps<T> {
  className?: string
  layer?: number | undefined
  shape?: T | undefined
  zIndex?: number
  duration?: number
  transitionType?: EasingFunction
}

export type ChildSortFunction = (a: StayChild, b: StayChild) => number
export interface getContainPointChildrenProps {
  selector: string | string[]
  point: SimplePoint
  returnFirst?: boolean | undefined
  sortBy?: SortChildrenMethodsValues | ChildSortFunction
}

export type SortChildrenMethodsValues = valueof<typeof SORT_CHILDREN_METHODS>

export interface ActionCallbackProps<T = Dict> {
  originEvent: Event
  e: ActionEvent
  store: storeType
  stateStore: storeType
  composeStore: Record<string, any>
  canvas: Canvas
  tools: StayTools
  payload: T
}

export interface Area {
  x: number
  y: number
  width: number
  height: number
}
export interface ImportChildrenProps {
  children: StayChild[]
  area?: Area
}

export interface ExportChildrenProps {
  children: StayChild[]
  area: Area
}

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

export interface ListenerProps<T extends ListenerNamePayloadPair = ListenerNamePayloadPair> {
  name: T["name"]
  state?: string
  selector?: string
  event: string | string[]
  sortBy?: SortChildrenMethodsValues | ChildSortFunction
  callback: UserCallback<T["payload"]>
}

export type SelectorFunc = (child: StayChild) => boolean

export interface StayTools {
  createChild: <T extends Shape>(props: createChildProps<T>) => StayChild<T>
  appendChild: <T extends Shape>(props: createChildProps<T>) => StayChild<T>
  updateChild: (props: updateChildProps) => StayChild
  removeChild: (childId: string) => Promise<void> | void
  getContainPointChildren: (props: getContainPointChildrenProps) => StayChild[]
  hasChild: (id: string) => boolean
  fix: () => void
  switchState: (state: string) => void
  getChildBySelector: <T extends Shape>(selector: string | SelectorFunc) => StayChild<T> | void
  getChildrenBySelector: (
    selector: string | SelectorFunc,
    sortBy?: SortChildrenMethodsValues | ChildSortFunction
  ) => StayChild[]
  getAvailiableStates: (selector: string) => string[]
  changeCursor: (cursor: string) => void
  moveStart: () => void
  move: (offsetX: number, offsetY: number) => Promise<void>
  zoom: (deltaY: number, center: SimplePoint) => Promise<void>
  reset: () => Promise<void>
  exportChildren: (props: ImportChildrenProps) => ExportChildrenProps
  importChildren: (props: ExportChildrenProps, targetArea?: Area) => void
  regionToTargetCanvas: (props: RegionToTargetCanvasProps) => Promise<HTMLCanvasElement>
  log: () => void
  redo: () => void
  undo: () => void
  triggerAction: (originEvent: Event, triggerEvents: Record<string, any>, payload: Dict) => void
  deleteListener: (name: string) => void
}

export interface StayChildProps<T> {
  id?: string
  zIndex?: number
  className: string
  layer: number
  transitionType?: EasingFunction
  beforeLayer?: number | null
  shape: T
  drawAction?: DrawActionsValuesType | null
  afterRefresh?: (fn: () => void) => void
  duration?: number
}

export interface RegionToTargetCanvasProps {
  area: Area
  targetArea?: Area
  children: StayChild[]
}

export type EasingFunction =
  | "linear"
  | "easeInSine"
  | "easeOutSine"
  | "easeInOutSine"
  | "easeInQuad"
  | "easeOutQuad"
  | "easeInOutQuad"
  | "easeInCubic"
  | "easeOutCubic"
  | "easeInOutCubic"
  | "easeInQuart"
  | "easeOutQuart"
  | "easeInOutQuart"
  | "easeInQuint"
  | "easeOutQuint"
  | "easeInOutQuint"
  | "easeInExpo"
  | "easeOutExpo"
  | "easeInOutExpo"
  | "easeInCirc"
  | "easeOutCirc"
  | "easeInOutCirc"
  | "easeInBack"
  | "easeOutBack"
  | "easeInOutBack"
  | "easeInElastic"
  | "easeOutElastic"
  | "easeInOutElastic"
  | "easeInBounce"
  | "easeOutBounce"
  | "easeInOutBounce"

export type EasingFunctionMap = {
  [key in EasingFunction]: (x: number) => number
}

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
export type UnionListenerProps<T extends ListenerNamePayloadPair[]> = {
  [key in keyof T]: ListenerProps<T[key]>
}

export type ListenerArrayProps<T extends ListenerNamePayloadPairOrName[]> = UnionListenerProps<
  ConvertListenerNamePayloadPairOrNameToListenerNamePayloadPair<T>
>

export type Tuple2Union<T extends unknown[]> = T extends [infer F, ...infer L]
  ? F | Tuple2Union<L>
  : never

export type LisenerTupleToLisenerUnion<T extends ListenerNamePayloadPairOrName[]> = Tuple2Union<
  ConvertListenerNamePayloadPairOrNameToListenerNamePayloadPair<T>
>

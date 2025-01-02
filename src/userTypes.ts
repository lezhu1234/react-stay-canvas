import Canvas from "./canvas"
import { AnimatedShape } from "./shapes/animatedShape"
import { InstantShape } from "./shapes/instantShape"
import { Point } from "./shapes/point"
import { StayInstantChild } from "./stay/child/stayInstantChild"
import { valueof } from "./stay/types"
import {
  DrawCanvasContext,
  EventProps,
  NumberInRangeZeroOne,
  ShapeConfig,
  UserCallback,
} from "./types"
import { DRAW_ACTIONS, SHAPE_DRAW_TYPES, SORT_CHILDREN_METHODS } from "./userConstants"
import { RGB, RGBA } from "./w3color"

type SortChildrenMethodsKeys = keyof typeof SORT_CHILDREN_METHODS
export type StayChildren = Record<string, StayInstantChild>
export type DrawActionsValuesType = valueof<typeof DRAW_ACTIONS>

export type storeType = Map<string, any>
export type Dict<T = any> = Record<string, T>

export interface PointType {
  x: number
  y: number
}

export type StayCanvasRefType = {
  trigger: (name: string, payload?: Dict) => void
  reCreate: () => void
  focus: () => void
}

export interface MouseActionEvent<EventName extends PredefinedMouseEventName> {
  state: string
  pressedKeys: Set<string>
  name: EventName
  x: number
  y: number
  point: Coordinate
  target: StayInstantChild
  isMouseEvent: true
}

export interface KeyActionEvent<EventName extends PredefinedKeyEventName> {
  state: string
  key: string
  pressedKeys: Set<string>
  name: EventName
  isMouseEvent: false
}

export interface WheelActionEvent<EventName extends PredefinedWheelEventName>
  extends MouseActionEvent<EventName> {
  name: EventName
  deltaX: number
  deltaY: number
  deltaZ: number
}

export type ActionEvent<EventName extends string | string[]> =
  EventName extends PredefinedWheelEventName
    ? WheelActionEvent<EventName>
    : EventName extends PredefinedKeyEventName
    ? KeyActionEvent<EventName>
    : EventName extends PredefinedMouseEventName
    ? MouseActionEvent<EventName>
    : never

// export interface TimelineChildProps<T extends Shape> {
//   id?: string
//   zIndex?: number
//   shape: T
//   className: string
//   layer?: number
//   transition?: Omit<StayChildTransitions, "update">
//   timeline: TimeLineProps<T>[]
// }

export interface createChildProps<T> {
  id?: string
  shape: T | T[] | Map<string, T>
  className: string
}

export type updateChildProps<T = InstantShape> = {
  child: StayInstantChild
  transition?: StayShapeTransitionConfig
} & Partial<createChildProps<T>>

export interface UpdateStayChildProps<T> {
  id?: string
  className?: string
  shape?: T | undefined
  zIndex?: number
  transition?: StayShapeTransitionConfig
}

export type ChildSortFunction = (a: StayInstantChild, b: StayInstantChild) => number
export interface getContainPointChildrenProps {
  selector: string | string[]
  point: PointType
  returnFirst?: boolean | undefined
  sortBy?: ChildSortFunction
  withRoot?: boolean
}

export type SortChildrenMethodsValues = valueof<typeof SORT_CHILDREN_METHODS>

export interface ActionCallbackProps<T = Dict, EventName extends string | string[] = string> {
  originEvent: Event
  e: ActionEvent<EventName>
  store: storeType
  stateStore: storeType
  composeStore: Record<string, any>
  canvas: Canvas
  tools: StayTools
  payload: T
}

export interface Coordinate {
  x: number
  y: number
}

// export type StayChildShapes = Shape[]

export interface Area {
  x: number
  y: number
  width: number
  height: number
}
export interface ImportChildrenProps {
  children: StayInstantChild[]
  area?: Area
}

export interface ExportChildrenProps {
  children: StayInstantChild[]
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

export interface ListenerProps<
  T extends ListenerNamePayloadPair = ListenerNamePayloadPair,
  EventName extends string = string
> {
  name: T["name"]
  state?: string
  selector?: string
  event: EventName | EventName[]
  sortBy?: ChildSortFunction
  callback: UserCallback<T["payload"], EventName | EventName[]>
}

export interface PredefinedEventListenerProps<
  EventName extends PredefinedEventName = PredefinedEventName
> {
  name: string
  state?: string
  selector?: string
  event: EventName | EventName[]
  sortBy?: ChildSortFunction
  callback: UserCallback<Dict, EventName | EventName[]>
}

export type SelectorFunc = (child: StayInstantChild) => boolean

export interface ProgressBound {
  beforeTime: number
  afterTime: number
}

export interface StayDrawProps {
  forceDraw?: boolean
  now?: number
  beforeDrawCallback?: () => void
  afterDrawCallback?: (canvas: Canvas) => void
}

export interface ProgressProps {
  time: number
  bound?: ProgressBound
  beforeDrawCallback?: () => void
  afterDrawCallback?: (canvas: Canvas) => void
}
export interface StayTools {
  createChild: <T extends InstantShape>(props: createChildProps<T>) => StayInstantChild<T>
  appendChild: <T extends InstantShape>(props: createChildProps<T>) => StayInstantChild<T>
  updateChild: (props: updateChildProps) => StayInstantChild
  removeChild: (childId: string) => Promise<void> | void
  getContainPointChildren: (props: getContainPointChildrenProps) => StayInstantChild[]
  hasChild: (id: string) => boolean
  fix: () => void
  switchState: (state: string) => void
  getChildrenWithoutRoot: () => StayInstantChild[]
  getChildById: <T extends InstantShape>(id: string) => StayInstantChild<T> | void
  getChildBySelector: <T extends InstantShape>(
    selector: string | SelectorFunc
  ) => StayInstantChild<T> | void
  getChildrenByArea: (area: Area, selector?: string | SelectorFunc) => StayInstantChild[]
  getChildrenBySelector: (
    selector: string | SelectorFunc,
    sortBy?: ChildSortFunction
  ) => StayInstantChild[]
  getAvailiableStates: (selector: string) => string[]
  changeCursor: (cursor: string) => void
  moveStart: () => void
  move: (
    offsetX: number,
    offsetY: number,
    filter?: (child: StayInstantChild) => boolean
  ) => Promise<void>
  zoom: (
    deltaY: number,
    center: PointType,
    filter?: (child: StayInstantChild) => boolean
  ) => Promise<void>
  reset: () => Promise<void>
  exportChildren: (props: ImportChildrenProps) => ExportChildrenProps
  importChildren: (props: ExportChildrenProps, targetArea?: Area) => void
  regionToTargetCanvas: (props: RegionToTargetCanvasProps) => Promise<HTMLCanvasElement>
  log: () => void
  redo: () => void
  undo: () => void
  // start: () => void
  refresh: () => void
  progress: (props: ProgressProps) => void
  triggerAction: (originEvent: Event, triggerEvents: Record<string, any>, payload: Dict) => void
  deleteListener: (name: string) => void
  // timelineChild: <T extends InstantShape>(props: TimelineChildProps<T>) => StayInstantChild<T>
}

export type StayInstantChildShapes = Map<string, InstantShape>

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface AnimatedShapeTransitionConfig {
  enter?: StayShapeTransitionConfig
  leave?: StayShapeTransitionConfig
  update?: StayShapeTransitionConfig
}

export interface AnimatedShapeProps extends ShapeProps {
  transition?: AnimatedShapeTransitionConfig
}

export interface StayShapeTransitionConfig {
  type?: EasingFunction
  durationMs?: number
  delayMs?: number
}

export interface StayInstantChildUpdateProps<T extends InstantShape> {
  id?: string
  className?: string
  shape?: T | T[] | Map<string, T>
}

export interface StayInstantChildProps<T extends InstantShape> {
  id?: string
  className: string
  shape: T | T[] | Map<string, T>
  canvas: Canvas
}

export interface StayAnimatedChildProps<T extends AnimatedShape> {
  id?: string
  className: string
  canvas: Canvas
}

export interface StayChildProps<T> {
  id?: string
  zIndex?: number
  className: string

  transition?: StayShapeTransitionConfig

  shape: T
  drawAction?: DrawActionsValuesType | null
}

// export interface StayChildTimeLineProps<T extends Shape> {
//   id?: string
//   zIndex?: number
//   className: string

//   shape: T

//   timeline: TimeLineProps<T>[]
//   drawAction?: DrawActionsValuesType | null
//   afterRefresh?: (fn: () => void) => void
//   drawEndCallback?: (child: StayInstantChild) => void
// }
export interface RegionToTargetCanvasProps {
  area: Area
  targetArea?: Area
  children: StayInstantChild[]
  progress?: number
}

export type Effects =
  | "left10px"
  | "right10px"
  | "up10px"
  | "down10px"
  | "fade100%"
  | "zoomIn100%"
  | "zoomOut100%"

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
export type UnionListenerProps<
  T extends ListenerNamePayloadPair[],
  EventName extends string = string
> = {
  [key in keyof T]: ListenerProps<T[key], EventName>
}

export type ListenerArrayProps<
  T extends ListenerNamePayloadPairOrName[],
  EventName extends string = string
> = UnionListenerProps<ConvertListenerNamePayloadPairOrNameToListenerNamePayloadPair<T>, EventName>

export type Tuple2Union<T extends unknown[]> = T extends [infer F, ...infer L]
  ? F | Tuple2Union<L>
  : never

export type LisenerTupleToLisenerUnion<T extends ListenerNamePayloadPairOrName[]> = Tuple2Union<
  ConvertListenerNamePayloadPairOrNameToListenerNamePayloadPair<T>
>
export interface ShapeDrawProps {
  context: DrawCanvasContext
  now: number
  width: number
  height: number
}
export interface ShapeProps {
  color?: string | CanvasGradient | RGB | RGBA
  lineWidth?: number
  zoomY?: number
  zoomCenter?: PointType
  type?: valueof<typeof SHAPE_DRAW_TYPES>
  gco?: GlobalCompositeOperation
  stateDrawFuncMap?: Dict<(props: ShapeDrawProps) => void>
  state?: string
  hidden?: boolean
  lineDash?: number[]
  lineDashOffset?: number
  filter?: string
  layer?: number
  zIndex?: number
}

export type FourrDirection = "top" | "right" | "bottom" | "left"
export type DiagonalDirection = "top-right" | "top-left" | "bottom-right" | "bottom-left"

export interface Border {
  size?: number
  color?: string
  type: "solid" | "dashed"
  direction: FourrDirection
}

export interface TextDecoration {
  position: number
  color?: string
}
export interface TextAttr {
  x: number
  y: number
  text: string
  font?: Font
  color?: string | CanvasGradient
  decoration?: TextDecoration
  border?: Border[]
  offsetXRatio?: number
  offsetYRatio?: number
  textBaseline?: CanvasTextBaseline
  textAlign?: CanvasTextAlign
  props?: ShapeProps
  width?: number
  height?: number
  autoTransitionDiffText?: boolean
}

export type StayMode = "instant" | "animated"
export interface Font {
  size?: number
  fontFamily?: string
  fontWeight?: number
  italic?: boolean
  backgroundColor?: string | RGBA | CanvasGradient
  underline?: boolean
  strikethrough?: boolean
}

export interface ExtraTransform {
  zoom: number
  zoomCenter: { x: number; y: number }
  offsetX: number
  offsetY: number
}

export interface FrameBoundInfo<T extends AnimatedShape> {
  beforeTime: number
  afterTime: number
  beforeShape: T
  afterShape: T
  ratio: number
}

// export interface TimeLineProps<T extends Shape> {
//   start: number
//   duration: number
//   type?: EasingFunction
//   props: Parameters<T["update"]>[0]
// }

// export interface IntermediateShapeInfo {
//   before: Shape
//   after: Shape
//   ratio: number
//   type: EasingFunction
//   intermediate: boolean
//   beforeIndex: number
//   afterIndex: number
// }

export interface ShapeBound {
  beforeIndex: number
  afterIndex: number
  beforeTime: number
  afterTime: number
  ratio: number
}

export interface CurrentShapeInfo<T> extends ShapeBound {
  current: T
  currentTime: number
}

// export function isIntermediateShapeInfo<T extends Shape>(
//   shape: IntermediateShapeInfo | T
// ): shape is IntermediateShapeInfo {
//   return (shape as IntermediateShapeInfo).intermediate === true
// }

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
  | PredefinedWheelEventName

export type PredefinedKeyEventName = "keydown" | "keyup" | "undo" | "redo"
export type PredefinedEventName = PredefinedMouseEventName | PredefinedKeyEventName

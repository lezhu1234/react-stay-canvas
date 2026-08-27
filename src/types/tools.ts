import type Canvas from "../canvas"
import type { InstantShape } from "../shapes/instantShape"
import type { StayAnimatedChild } from "../stay/children/stayAnimatedChild"
import type { StayInstantChild } from "../stay/children/stayInstantChild"
import type { ProgressProps } from "./animation"
import type {
  AppendChildProps,
  ChildSortFunction,
  CreateChildProps,
  CaptureSceneProps,
  getContainPointChildrenProps,
  SceneFragment,
  RegionToTargetCanvasProps,
  SelectorFunc,
} from "./children"
import type { Dict } from "./common"
import type {
  ClientPoint,
  ContentPoint,
  ContentVector,
  ViewPoint,
  ViewVector,
} from "./coordinates"
import type { Area, PointType } from "./geometry"
import type { ManualTriggerEvents } from "./manualActions"

export interface StayDrawProps {
  now?: number
  beforeDrawCallback?: () => void
  afterDrawCallback?: (canvas: Canvas) => void
}

export type StayTools = BasicTools & InstantTools & AnimatedTools

export interface ViewportState {
  x: number
  y: number
  scale: number
}

export interface ViewportOptions {
  minScale?: number
  maxScale?: number
}

export interface StayViewport {
  get: () => Readonly<ViewportState>
  panBy: (viewMovement: ViewVector) => Readonly<ViewportState>
  zoomBy: (factor: number, contentAnchor?: ContentPoint) => Readonly<ViewportState>
  reset: () => Readonly<ViewportState>
  restore: (state: ViewportState) => Readonly<ViewportState>
  toClientPoint: (contentPoint: ContentPoint) => ClientPoint
}

export interface StayCoordinates {
  clientToView: (point: ClientPoint) => ViewPoint
  viewToClient: (point: ViewPoint) => ClientPoint
  viewToContent: (point: ViewPoint) => ContentPoint
  contentToView: (point: ContentPoint) => ViewPoint
  clientToContent: (point: ClientPoint) => ContentPoint
  contentToClient: (point: ContentPoint) => ClientPoint
  viewVectorToContent: (vector: ViewVector) => ContentVector
  contentVectorToView: (vector: ContentVector) => ViewVector
}

export interface BasicTools {
  readonly coordinates: StayCoordinates
  readonly viewport: StayViewport
  appendChild: <T extends InstantShape>(props: AppendChildProps<T>) => StayInstantChild<T>
  removeChild: (childId: string) => Promise<void> | void
  getContainPointChildren: <T extends InstantShape = InstantShape>(
    props: getContainPointChildrenProps
  ) => StayInstantChild<T>[]
  hasChild: (id: string) => boolean
  switchState: (state: string) => void
  getChildrenWithoutRoot: () => StayInstantChild[]
  getChildById: <T extends InstantShape>(id: string) => StayInstantChild<T> | void
  getChildBySelector: <T extends InstantShape>(
    selector: string | SelectorFunc
  ) => StayInstantChild<T> | void
  getChildrenByArea: (area: Area, selector?: string | SelectorFunc) => StayInstantChild[]
  getChildrenBySelector: <T extends InstantShape = InstantShape>(
    selector: string | SelectorFunc,
    sortBy?: ChildSortFunction
  ) => StayInstantChild<T>[]
  getAvailiableStates: (selector: string) => string[]
  changeCursor: (cursor: Cursor) => void
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
  exportChildren: (props: CaptureSceneProps) => SceneFragment
  importChildren: (props: SceneFragment, targetArea?: Area) => void
  regionToTargetCanvas: (props: RegionToTargetCanvasProps) => Promise<HTMLCanvasElement>
  refresh: () => void
  triggerAction: <EventName extends string>(
    originEvent: Event,
    triggerEvents: ManualTriggerEvents<EventName>,
    payload: Dict
  ) => void
  deleteListener: (name: string) => void
}

export interface DrawReturn {
  updatedLayers: number[]
  updatedChilds: {
    child: StayInstantChild
    shapes: InstantShape[]
  }[]
}

export interface AnimatedTools {
  progress: (props: ProgressProps) => DrawReturn
  createChild: (props: CreateChildProps) => StayAnimatedChild
}

export interface InstantTools {
  log: () => void
  redo: () => void
  resetHistory: () => void
  undo: () => void
}

export type Cursor =
  | "auto"
  | "default"
  | "none"
  | "context-menu"
  | "help"
  | "pointer"
  | "progress"
  | "wait"
  | "cell"
  | "crosshair"
  | "text"
  | "vertical-text"
  | "alias"
  | "copy"
  | "move"
  | "no-drop"
  | "not-allowed"
  | "grab"
  | "grabbing"
  | "all-scroll"
  | "col-resize"
  | "row-resize"
  | "n-resize"
  | "e-resize"
  | "s-resize"
  | "w-resize"
  | "ne-resize"
  | "nw-resize"
  | "se-resize"
  | "sw-resize"
  | "ew-resize"
  | "ns-resize"
  | "nesw-resize"
  | "nwse-resize"
  | "zoom-in"
  | "zoom-out"

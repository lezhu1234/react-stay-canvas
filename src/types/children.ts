import type Canvas from "../canvas"
import type { AnimatedShape } from "../shapes/animatedShape"
import type { InstantShape } from "../shapes/instantShape"
import type { StayAnimatedChild } from "../stay/children/stayAnimatedChild"
import type { StayInstantChild } from "../stay/children/stayInstantChild"
import type { SORT_CHILDREN_METHODS } from "../userConstants"
import type { StayShapeTransitionConfig } from "./animation"
import type { valueof } from "./common"
import type { Area, PointType, Size } from "./geometry"
import type { DrawActionsValuesType } from "./shapes"

export type StayChildren = Record<string, StayInstantChild>

export interface AppendChildProps<T> {
  id?: string
  shape: T | T[] | Map<string, T>
  className: string
}

export interface CreateChildProps {
  id?: string
  className: string
}

export type updateChildProps<T extends StayInstantChild = StayInstantChild> = {
  child: T
  transition?: StayShapeTransitionConfig
}

export interface UpdateStayChildProps<T> {
  id?: string
  className?: string
  shape?: T | undefined
  zIndex?: number
  transition?: StayShapeTransitionConfig
}

export type ChildSortFunction = (a: StayInstantChild, b: StayInstantChild) => number

export interface getContainPointChildrenProps {
  selector: string | string[] | ((child: StayInstantChild) => boolean)
  point: PointType
  returnFirst?: boolean | undefined
  sortBy?: ChildSortFunction
  withRoot?: boolean
}

export type SortChildrenMethodsValues = valueof<typeof SORT_CHILDREN_METHODS>

export interface ImportChildrenProps {
  children: StayInstantChild[]
  area?: Area
}

export interface ExportChildrenProps {
  children: StayInstantChild[]
  area: Area
}

export type SelectorFunc = (child: StayInstantChild) => boolean

export type StayInstantChildShapes = Map<string, InstantShape>

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

export interface RegionToTargetCanvasProps {
  area: Area
  targetSize?: Size
  children: StayInstantChild[]
  progress?: number
}

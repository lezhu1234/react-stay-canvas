import type Canvas from "../canvas"
import type { AnimatedShape } from "../shapes/animatedShape"
import type { InstantShape } from "../shapes/instantShape"
import type { StayAnimatedChild } from "../stay/children/stayAnimatedChild"
import type { StayInstantChild } from "../stay/children/stayInstantChild"
import type { SORT_CHILDREN_METHODS } from "../userConstants"
import type { StayShapeTransitionConfig } from "./animation"
import type { valueof } from "./common"
import type { ContentPoint } from "./coordinates"
import type { Area, PointType, Size } from "./geometry"
import type { DrawActionsValuesType } from "./shapes"
import type { ChildPlacement, ChildPlacementSnapshot } from "./transform"

export type StayChildren = Record<string, StayInstantChild>

export interface AppendChildProps<T> {
  id?: string
  shape: T | T[] | Map<string, T>
  className: string
  placement?: ChildPlacement
}

export interface CreateChildProps {
  id?: string
  className: string
  placement?: ChildPlacement
}

/** @deprecated There is no tools.updateChild API. Call child.update(...) instead. */
export type updateChildProps<T extends StayInstantChild = StayInstantChild> = {
  child: T
  transition?: StayShapeTransitionConfig
}

/** @deprecated Use StayInstantChildUpdateProps with child.update(...) instead. */
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
  point: ContentPoint
  returnFirst?: boolean | undefined
  sortBy?: ChildSortFunction
  withRoot?: boolean
}

export type SortChildrenMethodsValues = valueof<typeof SORT_CHILDREN_METHODS>

export interface CaptureSceneProps {
  children: StayInstantChild[]
  area?: Area
}

export interface SceneChildFragment<T extends InstantShape = InstantShape> {
  sourceId: string
  className: string
  shapes: Map<string, T>
  placement: ChildPlacementSnapshot
}

export interface SceneFragment {
  children: SceneChildFragment[]
  area: Area
}

export type SelectorFunc = (child: StayInstantChild) => boolean

export type StayInstantChildShapes = Map<string, InstantShape>

export interface StayInstantChildUpdateProps<T extends InstantShape> {
  className?: string
  shape?: T | T[] | Map<string, T>
  placement?: ChildPlacement
}

export interface StayAnimatedChildUpdateProps {
  className?: string
  placement?: ChildPlacement
}

export interface StayInstantChildProps<T extends InstantShape> {
  id?: string
  className: string
  shape: T | T[] | Map<string, T>
  placement?: ChildPlacement
  canvas: Canvas
  onShapeChange?: (childId: string) => void
}

export interface StayAnimatedChildProps<T extends AnimatedShape> {
  id?: string
  className: string
  placement?: ChildPlacement
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

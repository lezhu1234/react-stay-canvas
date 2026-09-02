import type { ProgressBound } from "../types/animation"
import type { ExtraTransform } from "../types/geometry"
import type { ShapeDrawProps } from "../types/shapes"

export interface ExternalHistoryStep<TSnapshot> {
  before: TSnapshot
  after: TSnapshot
}

export interface StackItem<TSnapshot = unknown, TExternalSnapshot = unknown> {
  state: string
  steps: StepProps<TSnapshot>[]
  external?: ExternalHistoryStep<TExternalSnapshot>
}
export interface StepProps<TSnapshot = unknown> {
  action: "append" | "update" | "remove"
  child: TSnapshot
  before?: TSnapshot
}

export interface StepRecorderProps<TSnapshot = unknown> {
  relatedChildren: TSnapshot[]
  steps: StepProps<TSnapshot>[]
}

export interface DrawChildProps {
  props: ShapeDrawProps
  extraTransform?: ExtraTransform
}

export interface SetShapeChildCurrentTime {
  time: number
  bound?: ProgressBound
}

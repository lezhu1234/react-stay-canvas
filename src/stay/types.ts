import { InstantShape } from "../shapes/instantShape"
import type { ProgressBound } from "../types/animation"
import type { ExtraTransform } from "../types/geometry"
import type { ShapeDrawProps } from "../types/shapes"
import type { Matrix2D } from "../types/transform"

export interface StackItem {
  state: string
  steps: StepProps[]
}
export interface StepProps {
  action: "append" | "update" | "remove"
  child: StepChildProps
}

export interface StepChildProps {
  id: string
  className: string
  beforeName?: string
  shape: Map<string, InstantShape>
  transform: Matrix2D
  beforeShape?: Map<string, InstantShape>
  beforeTransform?: Matrix2D
}

export interface StepRecorderProps {
  relatedChildren: StepChildProps[]
  steps: StepProps[]
}

export interface DrawChildProps {
  props: ShapeDrawProps
  extraTransform?: ExtraTransform
}

export interface SetShapeChildCurrentTime {
  time: number
  bound?: ProgressBound
}

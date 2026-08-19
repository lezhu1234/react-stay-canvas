import { InstantShape } from "../shapes/instantShape"
import type { ProgressBound } from "../types/animation"
import type { ExtraTransform } from "../types/geometry"
import type { ShapeDrawProps } from "../types/shapes"

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
  beforeShape?: Map<string, InstantShape>
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

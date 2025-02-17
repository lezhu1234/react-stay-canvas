import { InstantShape } from "../shapes/instantShape"
import { ExtraTransform, ProgressBound, ShapeDrawProps } from "../userTypes"

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

export type valueof<T> = T extends Record<string, infer V> ? V : never

export interface DrawChildProps {
  props: ShapeDrawProps
  extraTransform?: ExtraTransform
}

export interface SetShapeChildCurrentTime {
  time: number
  bound?: ProgressBound
}

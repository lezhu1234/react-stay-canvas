import { Shape } from "../shapes/shape"

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
  shape: Shape
  beforeShape?: Shape
}

export interface StepRecorderProps {
  relatedChildren: StepChildProps[]
  steps: StepProps[]
}

export type valueof<T> = T extends Record<string, infer V> ? V : never

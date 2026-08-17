import { ComponentType } from "react"

export interface ExampleDefinition {
  path: string
  sourcePath: string
  group: "Simple" | "Integrated"
  order: number
  title: string
  shortTitle: string
  summary: string
  features: string[]
  instructions: string[]
  checklist: string[]
  component: ComponentType
}

import { ComponentType } from "react"

import { type LocalizedText } from "../i18n"

export interface ExampleDefinition {
  path: string
  sourcePath: string
  group: "Simple" | "Integrated"
  order: number
  title: LocalizedText
  shortTitle: LocalizedText
  summary: LocalizedText
  features: string[]
  presentation?: "workspace"
  component: ComponentType
}

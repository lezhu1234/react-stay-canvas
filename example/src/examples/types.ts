import { ComponentType } from "react"

import { type LocalizedText } from "../i18n"

export interface ExampleDefinition {
  path: string
  sourcePaths: readonly [string, ...string[]]
  presentation?: "standard" | "immersive"
  group: "Simple" | "Integrated"
  order: number
  title: LocalizedText
  shortTitle: LocalizedText
  summary: LocalizedText
  features: string[]
  component: ComponentType
}

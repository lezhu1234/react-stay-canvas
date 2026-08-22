import type { StayShapeTransitionConfig } from "./animation"
import type { DrawCanvasContext } from "./canvas"
import type { Dict, NumericString, valueof } from "./common"
import type { PointType } from "./geometry"
import type { DRAW_ACTIONS } from "../userConstants"
import type { RGBA } from "../vendor/w3color"

export type DrawActionsValuesType = valueof<typeof DRAW_ACTIONS>

export type ShapeConfig = {
  offsetX?: NumericString
  offsetY?: NumericString
  scale?: number
  opacity?: number
}

export interface ShapeDrawProps {
  context: DrawCanvasContext
  now: number
  width: number
  height: number
  forchDraw?: boolean
}

export interface ShapeProps {
  zoomY?: number
  zoomCenter?: PointType
  stateDrawFuncMap?: Dict<{
    commonDraw?: (props: ShapeDrawProps) => void | boolean
    stroke?: (props: ShapeDrawProps) => void | boolean
    fill?: (props: ShapeDrawProps) => void | boolean
    afterDraw?: (props: ShapeDrawProps) => void | boolean
  }>
  state?: string
  layer?: number
  zIndex?: number
  strokeConfig?: CanvasStrokeProps
  fillConfig?: CanvasFillProps
  globalConfig?: CanvasGlobalProps
  shapeStore?: Map<string, any>
}

export interface AnimatedShapeProps extends ShapeProps {
  transition?: StayShapeTransitionConfig
}

export type FourrDirection = "top" | "right" | "bottom" | "left"

export type DiagonalDirection = "top-right" | "top-left" | "bottom-right" | "bottom-left"

export interface Border {
  size?: number
  color?: string
  type: "solid" | "dashed"
  direction: FourrDirection
}

export interface TextDecoration {
  position: number
  color?: string
}

export interface CanvasStrokeProps {
  color?: RGBA
  lineWidth?: number
  dash?: number[]
  dashOffset?: number
  lineCap?: CanvasLineCap
  lineJoin?: CanvasLineJoin
  miterLimit?: number
}

export interface CanvasFillProps {
  color?: RGBA
}

export interface CanvasGlobalProps {
  gco?: GlobalCompositeOperation
}

export interface TextAttr extends AnimatedShapeProps {
  x: number
  y: number
  text: string
  font?: Font
  decoration?: TextDecoration
  border?: Border[]
  offsetXRatio?: number
  offsetYRatio?: number
  textBaseline?: CanvasTextBaseline
  textAlign?: CanvasTextAlign
  autoTransitionDiffText?: boolean
}

export interface Font {
  size?: number
  fontFamily?: string
  fontWeight?: number
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
}

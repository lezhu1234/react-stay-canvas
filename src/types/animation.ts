import type Canvas from "../canvas"
import type { AnimatedShape } from "../shapes/animatedShape"

export interface ProgressBound {
  beforeMs: number
  afterMs: number
}

export interface ProgressProps {
  timeMs: number
  bound?: ProgressBound
  beforeDrawCallback?: () => void
  afterDrawCallback?: (canvas: Canvas) => void
}

export interface StayShapeTransitionConfig {
  type?: EasingFunction
  durationMs?: number
  delayMs?: number
}

export type Effects =
  | "left10px"
  | "right10px"
  | "up10px"
  | "down10px"
  | "fade100%"
  | "zoomIn100%"
  | "zoomOut100%"

export type EasingFunction =
  | "linear"
  | "easeInSine"
  | "easeOutSine"
  | "easeInOutSine"
  | "easeInQuad"
  | "easeOutQuad"
  | "easeInOutQuad"
  | "easeInCubic"
  | "easeOutCubic"
  | "easeInOutCubic"
  | "easeInQuart"
  | "easeOutQuart"
  | "easeInOutQuart"
  | "easeInQuint"
  | "easeOutQuint"
  | "easeInOutQuint"
  | "easeInExpo"
  | "easeOutExpo"
  | "easeInOutExpo"
  | "easeInCirc"
  | "easeOutCirc"
  | "easeInOutCirc"
  | "easeInBack"
  | "easeOutBack"
  | "easeInOutBack"
  | "easeInElastic"
  | "easeOutElastic"
  | "easeInOutElastic"
  | "easeInBounce"
  | "easeOutBounce"
  | "easeInOutBounce"

export type EasingFunctionMap = {
  [key in EasingFunction]: (x: number) => number
}

export interface FrameBoundInfo<T extends AnimatedShape> {
  beforeTime: number
  afterTime: number
  beforeShape: T
  afterShape: T
  shape: T
  ratio: number
}

export interface ShapeBound {
  beforeIndex: number
  afterIndex: number
  beforeTime: number
  afterTime: number
  ratio: number
}

export interface CurrentShapeInfo<T> extends ShapeBound {
  current: T
  currentTime: number
}

import type { EasingFunction } from "../../types/animation"
import type { AnimatedShape } from "../animatedShape"

export type SceneTransitionMode = "morph" | "crossfade"
export type ShapeTransitionEffect = string

export interface TransitionComponent {
  readonly shape: AnimatedShape
  readonly opacity: number
}

export interface ShapeTransitionState {
  readonly mode: ShapeTransitionEffect
  readonly components: readonly TransitionComponent[]
}

export interface ShapeTransitionPair {
  readonly before: ShapeTransitionState
  readonly after: ShapeTransitionState
}

export interface ShapeTransitionSample extends ShapeTransitionPair {
  readonly ratio: number
  readonly progress: number
  readonly transitionType: EasingFunction
}

/** Modules return native drawable components; the existing timeline owns time. */
export interface ShapeTransitionModule {
  readonly id: string
  readonly contractVersion: 1
  readonly matches: (pair: ShapeTransitionPair) => boolean
  readonly sample: (sample: ShapeTransitionSample) => readonly TransitionComponent[]
}

export interface ShapeTransitionRegistry {
  readonly modules: readonly ShapeTransitionModule[]
  readonly sample: (sample: ShapeTransitionSample) => readonly TransitionComponent[]
}

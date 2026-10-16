import type { AnimatedShape } from "../animatedShape"
import type { ShapeTransitionSample, TransitionComponent } from "./types"

export function copyShape(shape: AnimatedShape): AnimatedShape {
  return shape.copy() as AnimatedShape
}

export function componentIsVisible({ shape, opacity }: TransitionComponent): boolean {
  return opacity > 0 && (shape.shouldStroke() || shape.shouldFill())
}

export function primaryComponentIndex(components: readonly TransitionComponent[]): number {
  return components.reduce((selected, component, index) =>
    component.opacity > components[selected].opacity ? index : selected, 0)
}

export function morphTarget({ after }: ShapeTransitionSample): AnimatedShape {
  return after.components[primaryComponentIndex(after.components)].shape
}

export function sampleNativeShape(
  before: AnimatedShape,
  after: AnimatedShape,
  { ratio, transitionType }: ShapeTransitionSample
): AnimatedShape {
  return after.intermediateState(before, after, ratio, transitionType)
}

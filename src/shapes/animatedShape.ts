import { AnimatedShapeProps, AnimatedShapeTransitionConfig, EasingFunction } from "../userTypes"
import { applyEasing } from "../utils"
import { InstantShape } from "./instantShape"

export const DefaultTransitionConfig: Required<AnimatedShapeTransitionConfig> = {
  enter: {
    type: "easeInOutSine",
    durationMs: 300,
    delayMs: 0,
  },
  leave: { type: "easeInOutSine", durationMs: 300, delayMs: 0 },
  update: { type: "easeInOutSine", durationMs: 300, delayMs: 0 },
}

export abstract class AnimatedShape extends InstantShape {
  transition: Required<AnimatedShapeTransitionConfig>
  constructor(props: AnimatedShapeProps) {
    super(props)
    this.transition = { ...DefaultTransitionConfig, ...props.transition }
  }

  getNumberIntermediateState(
    before: number,
    after: number,
    ratio: number,
    transitionType: EasingFunction
  ) {
    return before + (after - before) * applyEasing(transitionType, ratio)
  }

  recursiveIntermidateState(
    before: any,
    after: any,
    ratio: number,
    transitionType: EasingFunction
  ) {
    let state: any = structuredClone(after)
    if (typeof before === "number" && typeof after === "number") {
      state = this.getNumberIntermediateState(before, after, ratio, transitionType)
    }
    if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
      state = before.map((b, i) => {
        return this.recursiveIntermidateState(b, after[i], ratio, transitionType)
      })
    }

    if (before && after && typeof before === "object" && typeof after === "object") {
      const beforeKeys = Object.keys(before)
      const afterKeys = Object.keys(after)
      if (
        beforeKeys.length === afterKeys.length &&
        beforeKeys.every((key) => afterKeys.includes(key))
      ) {
        for (const key of beforeKeys) {
          const beforeValue = before[key]
          const afterValue = after[key]
          state[key] = this.recursiveIntermidateState(
            beforeValue,
            afterValue,
            ratio,
            transitionType
          )
        }
      }
    }
    return state
  }

  abstract zeroShape(shape: AnimatedShape): AnimatedShape
}

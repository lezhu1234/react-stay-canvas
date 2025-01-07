import { AnimatedShapeProps, Border, EasingFunction, StayShapeTransitionConfig } from "../userTypes"
import { applyEasing, fillSame, isBasicType, strokeSame } from "../utils"
import { RGBA } from "../w3color"
import { InstantShape, ZeroColor } from "./instantShape"

// export const DefaultTransitionConfig: Required<AnimatedShapeTransitionConfig> = {
//   enter: {
//     type: "easeInOutSine",
//     durationMs: 300,
//     delayMs: 0,
//   },
//   leave: { type: "easeInOutSine", durationMs: 300, delayMs: 0 },
//   update: { type: "easeInOutSine", durationMs: 300, delayMs: 0 },
// }

export const DefaultStayShapeTransitionConfig: Required<StayShapeTransitionConfig> = {
  type: "easeInOutSine",
  durationMs: 300,
  delayMs: 0,
}

export abstract class AnimatedShape extends InstantShape {
  transition: Required<StayShapeTransitionConfig>

  constructor(props: AnimatedShapeProps) {
    super(props)
    this.transition = { ...DefaultStayShapeTransitionConfig, ...props.transition }
  }

  getNumberIntermediateState(
    before: number,
    after: number,
    ratio: number,
    transitionType: EasingFunction
  ) {
    if (ratio === 0) {
      return before
    }
    if (ratio === 1) {
      return after
    }
    return before + (after - before) * applyEasing(transitionType, ratio)
  }

  recursiveIntermidateState(
    before: any,
    after: any,
    ratio: number,
    transitionType: EasingFunction
  ): any {
    let state: any = isBasicType(after) ? after : { ...after }
    if (typeof before === "number" && typeof after === "number") {
      return this.getNumberIntermediateState(before, after, ratio, transitionType)
    }
    if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
      return before.map((b, i) => {
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

  getIntermediateObj(
    before: AnimatedShape,
    after: AnimatedShape,
    ratio: number,
    transitionType: EasingFunction
  ) {
    const getTransObj = (shape: AnimatedShape) => {
      const transProps = ["strokeConfig", "fillConfig", ...shape.getTransProps()]
      const transObj: any = {}

      transProps.forEach((prop) => {
        transObj[prop] = shape[prop as keyof AnimatedShape]
      })

      return transObj
    }
    const beforeTransObj = getTransObj(before)
    const afterTransObj = getTransObj(after)

    const intermediateObj = this.recursiveIntermidateState(
      beforeTransObj,
      afterTransObj,
      ratio,
      transitionType
    )

    return {
      ...intermediateObj,
      ...this.getNonTransitionState(),
    }
  }

  override getNonTransitionState() {
    return {
      ...super.getNonTransitionState(),
      transition: { ...this.transition },
    }
  }
  abstract getTransProps(): string[]

  abstract intermediateState(
    before: AnimatedShape,
    after: AnimatedShape,
    ratio: number,
    transitionType: EasingFunction
  ): AnimatedShape

  _zeroShape(): AnimatedShape {
    const zeroShape = this.zeroShape()
    zeroShape.transition.delayMs = 0
    zeroShape.transition.durationMs = 0
    zeroShape.parent
    return zeroShape
  }
  abstract zeroShape(): AnimatedShape

  abstract childSameAs(shape: AnimatedShape): boolean

  propsSameAs(shape: AnimatedShape): boolean {
    return (
      strokeSame(this.strokeConfig, shape.strokeConfig) &&
      fillSame(this.fillConfig, shape.fillConfig)
    )
  }
  sameAs(shape: AnimatedShape): boolean {
    return this.childSameAs(shape) && this.propsSameAs(shape)
  }

  colorSame(c1?: RGBA, c2?: RGBA) {
    if (!c1 && !c2) {
      return true
    }
    if (!c1 || !c2) {
      return false
    }
    return c1.a === c2.a && c1.r === c2.r && c1.g === c2.g && c1.b === c2.b
  }

  borderSame(b1?: Border[], b2?: Border[]) {
    if (!b1 && !b2) {
      return true
    }
    if (!b1 || !b2) {
      return false
    }
    if (b1.length !== b2.length) return false
    return b1.every((b, i) => {
      return (
        b.color === b2[i].color &&
        b.size === b2[i].size &&
        b.type === b2[i].type &&
        b.direction === b2[i].direction
      )
    })
  }
}

import { AnimatedShapeProps, Border, EasingFunction, StayShapeTransitionConfig } from "../userTypes"
import { applyEasing } from "../utils"
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
  color: RGBA
  constructor(props: AnimatedShapeProps) {
    super(props)
    this.transition = { ...DefaultStayShapeTransitionConfig, ...props.transition }
    this.color = props.color ?? ZeroColor
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

  getIntermediateObj(
    before: AnimatedShape,
    after: AnimatedShape,
    ratio: number,
    transitionType: EasingFunction
  ) {
    const getTransObj = (shape: AnimatedShape) => {
      const transProps = shape.getTransProps()
      const transObj: any = {
        lineWidth: shape.lineWidth,
        lineDash: shape.lineDash,
        lineDashOffset: shape.lineDashOffset,
        color: shape.color,
      }

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

    return intermediateObj
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

  sameAs(shape: AnimatedShape): boolean {
    return this.childSameAs(shape) && this.propsSameAs(shape)
  }

  propsSameAs(shape: AnimatedShape): boolean {
    return (
      this.colorSame(this.color, shape.color) &&
      this.lineWidth === shape.lineWidth &&
      this.lineDash.length === shape.lineDash.length &&
      this.lineDash.every((v, i) => v === shape.lineDash[i]) &&
      this.lineDashOffset === shape.lineDashOffset
    )
  }

  colorSame(c1: RGBA, c2: RGBA) {
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

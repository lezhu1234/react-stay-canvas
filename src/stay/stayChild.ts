import { Shape } from "../shapes/shape"
import { ShapeDrawProps, ShapeProps } from "../userTypes"
import { DRAW_ACTIONS } from "../userConstants"
import {
  DrawActionsValuesType,
  EasingFunction,
  StayChildProps,
  UpdateStayChildProps,
} from "../userTypes"
import { uuid4 } from "../utils"
import { StepProps } from "./types"

export class StayChild<T extends Shape = Shape> {
  beforeLayer: number | null
  className: string
  drawAction: DrawActionsValuesType | null
  id: string
  layer: number
  shape: T
  zIndex: number
  afterRefresh: (fn: () => void) => void
  #currentShape: Shape
  #lastShape: Shape
  duration: number
  transitionType: EasingFunction
  updateTime: number
  #shapeCopy: Shape
  drawEndCallback: ((child: StayChild) => void) | undefined

  constructor({
    id,
    zIndex,
    className,
    layer,
    beforeLayer,
    shape,
    drawAction,
    transitionType,
    duration,
    afterRefresh = (fn: () => void) => void 0,
    drawEndCallback,
  }: StayChildProps<T>) {
    this.id = id ?? uuid4()
    this.zIndex = zIndex === undefined ? 1 : zIndex
    this.className = className
    this.layer = layer
    this.beforeLayer = beforeLayer ?? null
    this.shape = shape as T
    this.#currentShape = shape.copy()
    this.#lastShape = shape.copy().update({ props: { hidden: true } })
    this.#shapeCopy = shape.copy()
    this.drawAction = drawAction ?? null
    this.duration = Math.max(duration ?? 0, 0)
    this.afterRefresh = afterRefresh
    this.transitionType = transitionType ?? "linear"
    this.updateTime = Date.now()
    this.drawEndCallback = drawEndCallback
  }

  static diff<T extends Shape>(
    history: StayChild<T> | undefined,
    now: StayChild<T> | undefined
  ): StepProps | undefined {
    if (now && !history) {
      return {
        action: "append",
        child: {
          id: now.id,
          className: now.className,
          shape: now.shape.copy(),
        },
      }
    }
    if (history && !now) {
      return {
        action: "remove",
        child: {
          id: history.id,
          className: history.className,
          shape: history.shape.copy(),
        },
      }
    }
    if (history && now) {
      if (history.id !== now.id) {
        throw new Error("history id and now id must be the same")
      }
      return {
        action: "update",
        child: {
          id: now.id,
          className: now.className,
          shape: now.shape.copy(),
          beforeName: history.className,
          beforeShape: history.shape.copy(),
        },
      }
    }
  }

  copy(): StayChild<T> {
    return new StayChild({ ...this, shape: this.shape.copy() })
  }

  awaitCopy(): Promise<StayChild<T>> {
    return new Promise(async (resolve) => {
      const shape = await this.shape.awaitCopy()
      resolve(new StayChild({ ...this, shape }))
    })
  }

  draw(props: ShapeDrawProps): boolean {
    const ratio = ((Date.now() - this.updateTime) / this.duration) * 0.001

    let updateNextFrame = false
    this.#currentShape = this.shape
    if (ratio < 1) {
      const intermediateState = this.shape.intermediateState(
        this.#lastShape,
        this.shape,
        ratio,
        this.transitionType
      )

      if (intermediateState !== false) {
        this.#currentShape = intermediateState
        updateNextFrame = true
      }
    } else {
      if (this.drawEndCallback) {
        this.drawEndCallback(this)
        this.drawEndCallback = undefined
      }
    }

    return this.#currentShape._draw(props) || updateNextFrame
  }

  _update({
    id,
    className,
    layer,
    shape,
    zIndex,
    transitionType,
    duration,
    drawEndCallback,
  }: UpdateStayChildProps<T>) {
    this.id = id ?? this.id
    this.className = className ?? this.className
    this.beforeLayer = this.layer
    this.zIndex = zIndex ?? this.zIndex
    this.layer = layer ?? this.layer
    this.#lastShape = this.#shapeCopy.copy()
    this.shape = shape ? (shape.copy() as T) : (this.shape.copy() as T)
    this.#shapeCopy = this.shape.copy()
    this.drawAction = DRAW_ACTIONS.UPDATE
    this.updateTime = Date.now()
    this.transitionType = transitionType ?? this.transitionType
    this.duration = duration ?? this.duration
    this.drawEndCallback = drawEndCallback ?? this.drawEndCallback
  }
}

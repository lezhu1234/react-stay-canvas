import { Shape } from "../shapes/shape"
import { ShapeDrawProps, ShapeProps, StayChildTransitions, TransitionConfig } from "../userTypes"
import { DRAW_ACTIONS } from "../userConstants"
import {
  DrawActionsValuesType,
  EasingFunction,
  StayChildProps,
  UpdateStayChildProps,
} from "../userTypes"
import { getShapeByEffect, uuid4 } from "../utils"
import { StepProps } from "./types"

export class StayChild<T extends Shape = Shape> {
  beforeLayer: number | null
  className: string
  drawAction: DrawActionsValuesType | null
  id: string
  layer: number
  zIndex: number
  afterRefresh: (fn: () => void) => void
  drawEndCallback: ((child: StayChild) => void) | undefined
  state: "entering" | "updating" | "removing" | "idle"
  shapeStack: {
    shape: T
    transition: TransitionConfig | Omit<TransitionConfig, "effect"> | undefined
  }[]
  endTransition: TransitionConfig | undefined
  #removeCallback: ((layer: number) => void) | undefined

  constructor({
    id,
    zIndex,
    className,
    layer,
    beforeLayer,
    shape,
    drawAction,
    transition,
    afterRefresh = (fn: () => void) => void 0,
    drawEndCallback,
  }: StayChildProps<T>) {
    this.id = id ?? uuid4()
    this.zIndex = zIndex === undefined ? 1 : zIndex
    this.className = className
    this.layer = layer
    this.beforeLayer = beforeLayer ?? null
    this.shapeStack = []
    this.drawAction = drawAction ?? null
    this.afterRefresh = afterRefresh
    this.drawEndCallback = drawEndCallback
    this.state = "entering"
    this.#removeCallback = undefined
    this.init(shape, transition)
    this.endTransition = transition?.leave ?? undefined
  }

  init(shape: T, transition: StayChildTransitions | undefined) {
    if (transition && transition.enter) {
      const initShape = getShapeByEffect(transition.enter.effect, shape.copy() as T, "enter")
      this.shapeStack.push({
        shape: initShape,
        transition: undefined,
      })
    }
    this.shapeStack.push({
      shape,
      transition: transition ? transition.enter : undefined,
    })
  }

  get shape() {
    return this.shapeStack[this.shapeStack.length - 1].shape
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

  setRemove(callback: (layer: number) => void) {
    this.state = "removing"
    if (this.endTransition) {
      this._update({
        shape: getShapeByEffect<T>(this.endTransition.effect, this.shape.copy() as T, "leave"),
        transition: this.endTransition,
      })
    }
    this.#removeCallback = callback
  }

  checkRemove() {
    if (this.state === "idle" && this.#removeCallback) {
      this.#removeCallback(this.layer)
      this.#removeCallback = undefined
    }
  }

  idleDraw(props: ShapeDrawProps) {
    this.state = "idle"
    this.checkRemove()
    return this.shape._draw(props)
  }

  draw(props: ShapeDrawProps, time?: number): boolean {
    if (time === undefined) {
      return this.idleDraw(props)
    }

    if (time < 0) {
      throw new Error("time cannot be negative")
    }

    let stepStartTime = 0

    for (let index = 0; index < this.shapeStack.length; index++) {
      const { transition, shape } = this.shapeStack[index]
      const duration = transition?.duration ?? 0
      const delay = transition?.delay ?? 0

      const stepDelayEndTime = stepStartTime + delay
      const stepEndTime = stepStartTime + duration + delay

      if (stepDelayEndTime > time) {
        return this.shapeStack[index - 1].shape._draw(props)
      }

      if (stepEndTime > time) {
        const ratio = (time - stepStartTime) / (stepEndTime - stepStartTime)
        const intermediateShape = this.shape.intermediateState(
          this.shapeStack[index - 1].shape,
          shape,
          ratio,
          transition?.type ?? "linear"
        )
        return intermediateShape._draw(props) || true
      }
      stepStartTime = stepEndTime
    }

    return this.idleDraw(props)
  }

  _update({
    id,
    className,
    layer,
    shape,
    zIndex,
    transition,
    drawEndCallback,
  }: UpdateStayChildProps<T>) {
    this.id = id ?? this.id
    this.className = className ?? this.className
    this.beforeLayer = this.layer
    this.zIndex = zIndex ?? this.zIndex
    this.layer = layer ?? this.layer
    this.drawAction = DRAW_ACTIONS.UPDATE
    this.drawEndCallback = drawEndCallback ?? this.drawEndCallback
    this.state = "updating"

    if (shape) {
      this.shapeStack.push({
        shape,
        transition,
      })
    }
  }
}

import { Shape } from "../shapes/shape"
import {
  ExtraTransform,
  ShapeDrawProps,
  ShapeProps,
  StayChildTransitions,
  TransitionConfig,
} from "../userTypes"
import { DRAW_ACTIONS } from "../userConstants"
import {
  DrawActionsValuesType,
  EasingFunction,
  StayChildProps,
  UpdateStayChildProps,
} from "../userTypes"
import { getShapeByEffect, uuid4 } from "../utils"
import { StepProps } from "./types"
import { SimplePoint, StayText } from "../shapes"

export class StayChild<T extends Shape = Shape> {
  beforeLayer: number | null
  className: string
  drawAction: DrawActionsValuesType | null
  id: string
  layer: number
  zIndex: number
  afterRefresh: (fn: () => void) => void
  drawEndCallback: ((child: StayChild) => void) | undefined
  state: "entering" | "updating" | "hidden" | "idle"
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
      const _shape = shape.zeroShape() as T
      const initShape = getShapeByEffect(transition.enter.effect, _shape, "enter")
      this.push(initShape, undefined)
    }
    this.push(shape, transition ? transition.enter : undefined)
  }

  get totalDuration() {
    return this.shapeStack.reduce((acc, cur) => {
      const duration = cur.transition?.duration ?? 0
      const delay = cur.transition?.delay ?? 0
      return acc + duration + delay
    }, 0)
  }

  push(
    shape: T | undefined,
    transition: TransitionConfig | Omit<TransitionConfig, "effect"> | undefined
  ) {
    if (!shape) {
      return
    }
    if (
      (!transition || (!transition.duration && !transition.delay)) &&
      this.shapeStack.length > 0
    ) {
      this.shapeStack[this.shapeStack.length - 1].shape = shape
    } else {
      this.shapeStack.push({
        shape,
        transition,
      })
    }
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

  hidden(removeTransition?: TransitionConfig) {
    const transition = removeTransition ?? this.endTransition
    if (transition) {
      this._update({
        shape: getShapeByEffect<T>(transition.effect, this.shape.copy() as T, "leave"),
        transition,
      })
    }
    this.state = "hidden"
  }

  checkRemove() {
    // if (this.state === "idle" && this.#removeCallback) {
    //   this.#removeCallback(this.layer)
    //   this.#removeCallback = undefined
    // }
  }

  async idleDraw(props: ShapeDrawProps, extraTransform?: ExtraTransform) {
    let shape = this.shape
    if (extraTransform) {
      shape = (await shape.awaitCopy()) as T
      shape.move(extraTransform.offsetX, extraTransform.offsetY)
      shape.zoom(shape._zoom(extraTransform.zoom, extraTransform.zoomCenter))
    }
    const drawState = shape._draw(props)
    if (drawState !== true || this.state === "hidden") {
      this.state = "idle"
    }
    this.checkRemove()
    return drawState
  }

  async draw(
    props: ShapeDrawProps,
    time?: number,
    extraTransform?: ExtraTransform
  ): Promise<boolean> {
    if (time === undefined) {
      return await this.idleDraw(props, extraTransform)
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
        let _shape = this.shapeStack[index - 1].shape
        if (extraTransform) {
          _shape = (await _shape.awaitCopy()) as T
          _shape.move(extraTransform.offsetX, extraTransform.offsetY)
          _shape.zoom(_shape._zoom(extraTransform.zoom, extraTransform.zoomCenter))
        }
        return _shape._draw(props)
      }

      if (stepEndTime > time) {
        const ratio = (time - stepDelayEndTime) / (stepEndTime - stepDelayEndTime)
        const intermediateShape = this.shape.intermediateState(
          this.shapeStack[index - 1].shape,
          shape,
          ratio,
          transition?.type ?? "linear",
          props.canvas
        )
        if (intermediateShape === false) {
          return false
        }
        let _shape = intermediateShape
        if (extraTransform) {
          _shape = (await _shape.awaitCopy()) as T
          _shape.move(extraTransform.offsetX, extraTransform.offsetY)
          _shape.zoom(_shape._zoom(extraTransform.zoom, extraTransform.zoomCenter))
        }
        return _shape._draw(props) || true
      }
      stepStartTime = stepEndTime
    }

    if (this.state === "hidden") {
      return false
    }

    return await this.idleDraw(props, extraTransform)
  }

  getShapeByTime(props: ShapeDrawProps, time: number): Shape {
    if (time === undefined) {
      return this.shape
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
        let _shape = this.shapeStack[index - 1].shape

        return _shape
      }

      if (stepEndTime > time) {
        const ratio = (time - stepDelayEndTime) / (stepEndTime - stepDelayEndTime)
        const intermediateShape = this.shape.intermediateState(
          this.shapeStack[index - 1].shape,
          shape,
          ratio,
          transition?.type ?? "linear",
          props.canvas
        )
        if (intermediateShape === false) {
          return this.shapeStack[0].shape
        }
        let _shape = intermediateShape
        return _shape
      }
      stepStartTime = stepEndTime
    }

    return this.shape
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

    this.push(shape, transition)
  }
}

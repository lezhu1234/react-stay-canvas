import { Shape } from "../shapes/shape"
import {
  ExtraTransform,
  IntermediateShapeInfo,
  isIntermediateShapeInfo,
  ShapeDrawProps,
  ShapeProps,
  ShapeStackElement,
  StayChildTimeLineProps,
  StayChildTransitions,
  TimeLineProps,
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
  shapeStack: ShapeStackElement<T>[]
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
      const _shape = this.shape.zeroShape() as T
      this._update({
        shape: getShapeByEffect<T>(transition.effect, _shape.copy() as T, "leave"),
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

  getTotalDuration() {
    return this.shapeStack.reduce((acc, cur) => {
      const duration = cur.transition?.duration ?? 0
      const delay = cur.transition?.delay ?? 0
      return acc + duration + delay
    }, 0)
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
    const info = this.getIntermediateInfoOrShape(time)
    if (
      isIntermediateShapeInfo(info) &&
      this.shape.earlyStopIntermediateState(
        info.before,
        info.after,
        info.ratio,
        info.type,
        props.canvas.width,
        props.canvas.height
      )
    ) {
      return false
    }

    let shape = this.getShapeByTime(time)

    // if (this.state === "hidden") {
    //   return false
    // }

    if (extraTransform) {
      shape = (await shape.awaitCopy()) as T
      shape.move(extraTransform.offsetX, extraTransform.offsetY)
      shape.zoom(shape._zoom(extraTransform.zoom, extraTransform.zoomCenter))
    }
    const drawState = shape._draw(props)
    // if (drawState !== true || this.state === "hidden") {
    //   this.state = "idle"
    // }
    return drawState
  }

  getIntermediateInfoOrShape(time?: number): IntermediateShapeInfo | Shape {
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
        return this.shapeStack[index - 1].shape
      }

      if (stepEndTime >= time && index > 0) {
        const ratio = (time - stepDelayEndTime) / (stepEndTime - stepDelayEndTime)
        return {
          before: this.shapeStack[index - 1].shape,
          after: shape,
          ratio,
          type: transition?.type ?? "linear",
          intermediate: true,
          beforeIndex: index - 1,
          afterIndex: index,
        }
      }
      stepStartTime = stepEndTime
    }

    return this.shape
  }

  getShapeByTime(time?: number): Shape {
    const info = this.getIntermediateInfoOrShape(time)
    if (isIntermediateShapeInfo(info)) {
      return this.shape.intermediateState(info.before, info.after, info.ratio, info.type)
    } else {
      return info
    }
  }

  static timeline<T extends Shape>({
    timeline,
    shape,
    id,
    zIndex,
    className,
    layer,
    beforeLayer,
    drawAction,
    afterRefresh,
    drawEndCallback,
  }: StayChildTimeLineProps<T>): StayChild<T> {
    type intermediateState = Partial<Parameters<T["update"]>[0]>
    const propTimeline = new Map<
      number,
      {
        state: intermediateState
        type: EasingFunction
      }
    >()
    propTimeline.set(0, { state: {}, type: "easeInOutSine" })

    let lastState = {}
    let lastTime = 0
    const keyTimesMap = new Map<
      number,
      {
        start: number[]
        end: number[]
      }
    >()
    timeline.sort((a, b) => b.start + b.duration - (a.start + a.duration))
    for (let index = 0; index < timeline.length; index++) {
      const { start, duration, props } = timeline[index]
      const end = start + duration
      if (!(start in keyTimesMap)) {
        keyTimesMap.set(start, {
          start: [],
          end: [],
        })
      }
      if (!(end in keyTimesMap)) {
        keyTimesMap.set(end, {
          start: [],
          end: [],
        })
      }

      const startKeyTimes = keyTimesMap.get(start)!
      startKeyTimes.start.push(index)
      const endKeyTimes = keyTimesMap.get(end)!
      endKeyTimes.end.push(index)
    }
    const keyTimes = [...keyTimesMap].sort((a, b) => a[0] - b[0])
    for (let index = 0; index < keyTimes.length; index++) {
      let state: intermediateState = {}
      let type: EasingFunction = "linear"
      const [time, { start, end }] = keyTimes[index]

      for (let j = 0; j < timeline.length; j++) {
        const element = timeline[j]
        if (time > element.start && time <= element.start + element.duration) {
          type = element.type ?? "linear"
          state = {
            ...state,
            ...StayChild.getIntermediateProp(
              shape,
              lastState,
              element.props,
              (time - lastTime) / (element.duration + element.start - lastTime),
              type
            ),
          }
        }
      }
      const currentState = {
        ...JSON.parse(JSON.stringify(lastState)),
        ...state,
      }
      propTimeline.set(time, {
        state: currentState,
        type,
      })
      lastState = currentState
      lastTime = time
    }

    const child = new StayChild<T>({
      id,
      zIndex,
      className,
      layer,
      beforeLayer,
      drawAction,
      afterRefresh,
      drawEndCallback,
      shape: shape.copy() as T,
    })

    let delay = 0
    const shapeStack: ShapeStackElement<T>[] = []

    propTimeline.forEach(({ state, type }, time) => {
      const _shape = shape.copy().update(state)
      shapeStack.push({
        shape: _shape as T,
        transition: {
          type,
          delay: 0,
          duration: time - delay,
        },
      })
      delay = time
    })

    child.shapeStack = shapeStack

    return child
  }

  static getIntermediateProp<T extends Shape>(
    shape: T,
    before: Partial<Parameters<T["update"]>[0]>,
    after: Partial<Parameters<T["update"]>[0]>,
    ratio: number,
    type: EasingFunction
  ) {
    const beforeShape = shape.zeroShape().update(before)
    const afterShape = shape.zeroShape().update(after)
    const intermediteShape = shape.intermediateState(beforeShape, afterShape, ratio, type)
    const intermediteProps: Partial<Parameters<T["update"]>[0]> = {}
    for (const key in after) {
      if (key === "props") {
        const v: any = {}
        for (const k in after[key]) {
          v[k] = intermediteShape[k as keyof typeof intermediteShape] as any
        }
        intermediteProps[key] = v
      } else {
        intermediteProps[key] = intermediteShape[key as keyof typeof intermediteShape] as any
      }
    }
    return intermediteProps
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

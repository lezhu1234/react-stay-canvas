import { Shape } from "../shapes/shape"
import {
  CurrentShapeInfo,
  ExtraTransform,
  IntermediateShapeInfo,
  isIntermediateShapeInfo,
  ProgressBound,
  ShapeBound,
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
import { assert, getShapeByEffect, uuid4 } from "../utils"
import { DrawChildProps, SetShapeChildCurrentTime, StepProps } from "./types"

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

  private intermidateShapeCache = new Map<
    string,
    {
      shape: T
      hit: number
    }
  >()
  private intermidateShapeCacheSize = 10
  shape: T
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

    this.shape = shape
  }

  // get shape() {
  //   return this.currentShapeInfo.current
  // }

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

    this.shape = this.shapeStack[this.shapeStack.length - 1].shape
  }

  // get shape() {
  //   return this.shapeStack[this.shapeStack.length - 1].shape
  // }

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
      shape = (await shape.copy()) as T
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

  setCurrentTime({ time, bound }: SetShapeChildCurrentTime) {
    if (bound && bound.afterTime < bound.beforeTime) {
      const temp = bound.afterTime
      bound.afterTime = bound.beforeTime
      bound.beforeTime = temp
    }

    const updateCurrentShape = (shape: T) => {
      this.shape = shape
      return shape
    }

    const timeBound = this.getTimelineIndexBound(time)
    let beforeTime = timeBound.beforeTime
    let afterTime = timeBound.afterTime
    let beforeShape = this.shapeStack[timeBound.beforeIndex]!.shape
    let afterShape = this.shapeStack[timeBound.afterIndex]!.shape
    let transitionType = this.shapeStack[timeBound.afterIndex]!.transition?.type ?? "linear"

    if (bound) {
      const _bound = bound as Required<ProgressBound>
      const beforeBound = this.getTimelineIndexBound(_bound.beforeTime)
      beforeShape = this.getTimelineShapeByBound(beforeBound)
      beforeTime = _bound.beforeTime
      const afterBound = this.getTimelineIndexBound(_bound.afterTime)
      afterShape = this.getTimelineShapeByBound(afterBound)
      afterTime = _bound.afterTime
      const afterTransitionType = this.shapeStack[afterBound.afterIndex]!.transition?.type

      if (afterTransitionType) {
        transitionType = afterTransitionType
      }
    }

    if (beforeTime > afterTime) {
      throw new Error("beforeTime must be less than afterTime")
    }

    if (time < beforeTime) {
      throw new Error("time must be greater than beforeTime")
    }

    if (time > afterTime) {
      throw new Error("time must be less than afterTime")
    }

    if (beforeTime === afterTime) {
      return updateCurrentShape(afterShape)
    }

    if (time === beforeTime) {
      return updateCurrentShape(beforeShape)
    }
    if (time === afterTime) {
      return updateCurrentShape(afterShape)
    }

    const currentShape = afterShape.intermediateState(
      beforeShape,
      afterShape,
      (time - beforeTime) / (afterTime - beforeTime),
      transitionType
    ) as T

    return updateCurrentShape(currentShape)
  }

  draw({ props, extraTransform }: DrawChildProps): boolean {
    let shape = this.shape
    if (extraTransform) {
      shape = shape.copy() as T
      shape.move(extraTransform.offsetX, extraTransform.offsetY)
      shape.zoom(shape._zoom(extraTransform.zoom, extraTransform.zoomCenter))
    }
    return shape._draw(props)
  }

  getTimelineShapeByBound(bound: ShapeBound): T {
    const ratio = bound.ratio
    const beforeShape = this.shapeStack[bound.beforeIndex].shape
    const afterShape = this.shapeStack[bound.afterIndex].shape
    const transition = this.shapeStack[bound.afterIndex].transition

    if (ratio === 0) {
      return beforeShape
    }
    if (ratio === 1) {
      return afterShape
    }

    const transitionType = transition?.type ?? "linear"

    const key = `${bound.beforeIndex}-${bound.afterIndex}-${ratio}-${transitionType}`

    const cachedShape = this.intermidateShapeCache.get(key)
    if (cachedShape) {
      cachedShape.hit++
      return cachedShape.shape
    }
    if (this.intermidateShapeCache.size > this.intermidateShapeCacheSize) {
      let minCacheHit = Infinity,
        minCacheHitKey = ""
      this.intermidateShapeCache.forEach((value, key) => {
        if (value.hit < minCacheHit) {
          minCacheHit = value.hit
          minCacheHitKey = key
        }
      })
      this.intermidateShapeCache.delete(minCacheHitKey)
    }

    const intermediateShape = afterShape.intermediateState(
      beforeShape,
      afterShape,
      ratio,
      transitionType
    ) as T
    this.intermidateShapeCache.set(key, { shape: intermediateShape, hit: 1 })
    return intermediateShape
  }

  getTimelineIndexBound(time: number): ShapeBound {
    if (time < 0) {
      throw new Error("time cannot be negative")
    }

    let stepStartTime = 0
    for (let index = 0; index < this.shapeStack.length; index++) {
      const { transition } = this.shapeStack[index]
      const duration = transition?.duration ?? 0
      const delay = transition?.delay ?? 0

      const stepDelayEndTime = stepStartTime + delay
      const stepEndTime = stepStartTime + duration + delay
      if (stepDelayEndTime > time) {
        return {
          beforeIndex: index - 1,
          afterIndex: index - 1,
          beforeTime: stepStartTime,
          afterTime: stepDelayEndTime,
          ratio: 0,
        }
      }

      if (stepEndTime > time) {
        const ratio = (time - stepDelayEndTime) / (stepEndTime - stepDelayEndTime)
        return {
          ratio,
          beforeIndex: index - 1,
          afterIndex: index,
          beforeTime: stepDelayEndTime,
          afterTime: stepEndTime,
        }
      }

      if (stepEndTime === time) {
        return {
          beforeIndex: index,
          afterIndex: index,
          beforeTime: stepEndTime,
          afterTime: stepEndTime,
          ratio: 0,
        }
      }
      stepStartTime = stepEndTime
    }

    return {
      beforeIndex: this.shapeStack.length - 1,
      afterIndex: this.shapeStack.length - 1,
      beforeTime: time,
      afterTime: time,
      ratio: 0,
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

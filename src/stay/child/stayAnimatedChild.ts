import { AnimatedShape } from "../../shapes/animatedShape"
import {
  FrameBoundInfo,
  ProgressBound,
  ShapeBound,
  StayAnimatedChildProps,
  StayShapeTransitionConfig,
} from "../../userTypes"
import { parseLayer, uuid4 } from "../../utils"
import { StayInstantChild } from "./stayInstantChild"
import { Canvas } from "../../canvas"
import { SetShapeChildCurrentTime } from "../types"

export class StayAnimatedChild<
  T extends AnimatedShape = AnimatedShape
> extends StayInstantChild<T> {
  canvas: Canvas
  id: any
  className: string
  shapeFramesMap: Map<string, T[]>
  totalDurationMs: number

  private intermidateShapeCache = new Map<
    string,
    {
      shape: T
      hit: number
    }
  >()
  private intermidateShapeCacheSize = 10

  private frameMapInfo: Map<string, FrameBoundInfo<T>> = new Map<string, FrameBoundInfo<T>>()
  constructor(props: StayAnimatedChildProps<T>) {
    super({
      ...props,
      shape: [],
    })
    const { id, className, canvas } = props
    this.id = id ?? uuid4()
    this.className = className
    this.canvas = canvas
    this.shapeFramesMap = new Map<string, T[]>()
    this.totalDurationMs = 0
  }

  getSlice(name: string): T[] {
    if (!this.hasSlice(name)) {
      return []
    }

    const slice = this.shapeFramesMap.get(name)
    return slice!
  }

  getTimelineShapeByBound(slice: T[], bound: ShapeBound): T {
    const ratio = bound.ratio
    const beforeShape = slice[bound.beforeIndex]
    const afterShape = slice[bound.afterIndex]
    const transition = slice[bound.afterIndex].transition

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

  getTimelineIndexBound(slice: T[], timeMs: number): ShapeBound {
    if (timeMs < 0) {
      throw new Error("time cannot be negative")
    }

    let stepStartTime = 0
    for (let index = 0; index < slice.length; index++) {
      const { transition } = slice[index]
      const duration = transition.durationMs ?? 0
      const delay = transition.delayMs ?? 0

      const stepDelayEndTime = stepStartTime + delay
      const stepEndTime = stepStartTime + duration + delay
      if (stepDelayEndTime > timeMs) {
        return {
          beforeIndex: index - 1,
          afterIndex: index - 1,
          beforeTime: stepStartTime,
          afterTime: stepDelayEndTime,
          ratio: 0,
        }
      }

      if (stepEndTime > timeMs) {
        const ratio = (timeMs - stepDelayEndTime) / (stepEndTime - stepDelayEndTime)
        return {
          ratio,
          beforeIndex: index - 1,
          afterIndex: index,
          beforeTime: stepDelayEndTime,
          afterTime: stepEndTime,
        }
      }

      if (stepEndTime === timeMs) {
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
      beforeIndex: slice.length - 1,
      afterIndex: slice.length - 1,
      beforeTime: timeMs,
      afterTime: timeMs,
      ratio: 0,
    }
  }

  onChildShapeChange(shape: T) {
    shape.layer = parseLayer(this.canvas.layers, shape.layer)
    console.warn("change property of AnimatedShape may cause unexpected behavior")
  }

  setCurrentTime({ time, bound }: SetShapeChildCurrentTime) {
    if (bound && bound.afterMs < bound.beforeMs) {
      const temp = bound.afterMs
      bound.afterMs = bound.beforeMs
      bound.beforeMs = temp
    }

    const currentShapeMap = new Map<string, T>()

    // Helper functions to improve readability
    const hasFrameBoundInfoChanged = (
      currentInfo: FrameBoundInfo<T>,
      lastInfo?: FrameBoundInfo<T>
    ) => {
      // If no previous info exists, we need to update
      if (!lastInfo) return true

      // Check if both time AND shape changed for the "before" state
      const beforeStateChanged = () =>
        lastInfo.beforeTime !== currentInfo.beforeTime &&
        !lastInfo.beforeShape.sameAs(currentInfo.beforeShape)

      // Check if both time AND shape changed for the "after" state
      const afterStateChanged = () =>
        lastInfo.afterTime !== currentInfo.afterTime &&
        !lastInfo.afterShape.sameAs(currentInfo.afterShape)

      // Check if ratio changed when before and after shapes are different
      const ratioChanged = () =>
        !lastInfo.beforeShape.sameAs(lastInfo.afterShape) && lastInfo.ratio !== currentInfo.ratio

      const inView = () => !lastInfo.shape.isOutOfViewport() || !currentInfo.shape.isOutOfViewport()
      // Update is needed if any of these conditions are true
      return inView() && (beforeStateChanged() || afterStateChanged() || ratioChanged())
    }
    const updateCurrentShape = (name: string, shape: T, frameBoundInfo: FrameBoundInfo<T>) => {
      frameBoundInfo.shape = shape

      shape.parent = this

      // ignore unvisiable shape
      if (shape.shouldStroke() || shape.shouldFill()) {
        currentShapeMap.set(name, shape)
      }

      const lastFrameBoundInfo = this.frameMapInfo.get(name)

      if (hasFrameBoundInfoChanged(frameBoundInfo, lastFrameBoundInfo)) {
        this.updatedLayers.add(shape.layer)
      }
      this.frameMapInfo.set(name, frameBoundInfo)
      return shape
    }

    this.shapeFramesMap.forEach((slice, name) => {
      const timeBound = this.getTimelineIndexBound(slice, time)
      let beforeTime = timeBound.beforeTime
      let afterTime = timeBound.afterTime
      let beforeShape = slice[timeBound.beforeIndex]
      let afterShape = slice[timeBound.afterIndex]
      let transitionType = slice[timeBound.afterIndex].transition.type

      if (bound) {
        const _bound = bound as Required<ProgressBound>
        const beforeBound = this.getTimelineIndexBound(slice, _bound.beforeMs)
        beforeShape = this.getTimelineShapeByBound(slice, beforeBound)
        beforeTime = _bound.beforeMs
        const afterBound = this.getTimelineIndexBound(slice, _bound.afterMs)
        afterShape = this.getTimelineShapeByBound(slice, afterBound)
        afterTime = _bound.afterMs
        const afterTransitionType = slice[afterBound.afterIndex].transition.type

        if (afterTransitionType) {
          transitionType = afterTransitionType
        }
      }

      const ratio = (time - beforeTime) / (afterTime - beforeTime + 1e-9)

      const frameBoundInfo: FrameBoundInfo<T> = {
        beforeTime,
        afterTime,
        beforeShape,
        afterShape,
        ratio,
        shape: beforeShape,
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
        return updateCurrentShape(name, afterShape, frameBoundInfo)
      }

      if (time === beforeTime) {
        return updateCurrentShape(name, beforeShape, frameBoundInfo)
      }
      if (time === afterTime) {
        return updateCurrentShape(name, afterShape, frameBoundInfo)
      }

      const currentShape = afterShape.intermediateState(
        beforeShape,
        afterShape,
        ratio,
        transitionType
      ) as T
      return updateCurrentShape(name, currentShape, frameBoundInfo)
    })

    this.shapeMap = currentShapeMap
  }

  checkShape(shape: T) {
    if (isNaN(shape.transition.delayMs) || isNaN(shape.transition.durationMs)) {
      throw new Error("transition delayMs or durationMs is NaN")
    }
    return shape
  }
  appendKeyFrame(name: string, shape: T, prependZeroShape: boolean = true) {
    shape.parent = this
    const shapeFrames: T[] = this.shapeFramesMap.get(name) ?? []
    if (shapeFrames.length === 0 && prependZeroShape) {
      const zs = shape._zeroShape(this.shapeFramesMap) as T
      zs.parent = this
      shapeFrames.push(this.checkShape(zs))
    }
    shapeFrames.push(this.checkShape(shape))
    this.shapeFramesMap.set(name, shapeFrames)
    this.totalDurationMs = Math.max(this.totalDurationMs, this.getSliceTotalDurationMs(name))
  }

  getSliceTotalDurationMs(name: string) {
    const slice = this.shapeFramesMap.get(name) ?? []
    return slice.reduce((acc, cur) => {
      const duration = cur.transition?.durationMs ?? 0
      const delay = cur.transition?.delayMs ?? 0
      return acc + duration + delay
    }, 0)
  }

  hasSlice(name: string) {
    return this.shapeFramesMap.has(name)
  }

  appendKeyFrames(frameMap: Map<string, T | T[]>, prependZeroShape: boolean = true) {
    frameMap.forEach((frames, name) => {
      if (!Array.isArray(frames)) {
        frames = [frames]
      }
      frames.forEach((frame) => {
        this.appendKeyFrame(name, frame, prependZeroShape)
      })
    })
  }
  appendDefaultFrame(shape: T, prependZeroShape: boolean = true) {
    this.appendKeyFrame("default", shape, prependZeroShape)
  }

  disappear(transition?: StayShapeTransitionConfig, mode: "afterEach" | "afterAll" = "afterEach") {
    const keys = this.shapeFramesMap.keys()

    const totalDurationMs = this.totalDurationMs
    for (const key of keys) {
      const slice = this.shapeFramesMap.get(key)!
      const lastShape = slice[slice.length - 1]
      const zs = lastShape._zeroShape(this.shapeFramesMap) as T

      const _transition = {
        ...zs.transition,
        ...transition,
      }

      if (mode === "afterAll") {
        const sliceDuration = this.getSliceTotalDurationMs(key)
        _transition.delayMs += totalDurationMs - sliceDuration
      }

      zs.transition = _transition
      this.appendKeyFrame(key, zs)
    }
  }
}

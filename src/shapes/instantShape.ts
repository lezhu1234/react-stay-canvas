import { shapeUpdateEventEmitter } from "../ShapeUpdateEventEmitter"
import { StayInstantChild } from "../stay/child/stayInstantChild"
import { valueof } from "../stay/types"
import { DrawCanvasContext } from "../types"
import { SHAPE_DRAW_TYPES } from "../userConstants"
import {
  Dict,
  EasingFunction,
  ShapeDrawProps,
  ShapeProps,
  PointType,
  Font,
  Rect,
  Coordinate,
} from "../userTypes"
import { applyEasing, isRGB, isRGBA } from "../utils"
import W3Color, { RGB, RGBA, rgbaToString } from "../w3color"

export interface GetCurrentArgumentsProps {
  startArguments: Dict
  endArguments: Dict
  duration: number
  now: number
  ease?: boolean
  easeIn?: boolean
  easeOut?: boolean
}

export abstract class InstantShape {
  area: number
  color: CanvasGradient | RGBA
  gco: GlobalCompositeOperation
  lineWidth: number
  offsetX: number
  offsetY: number
  startTime: number
  state: string
  stateDrawFuncMap: Dict<(props: ShapeDrawProps) => void | boolean>
  type: valueof<typeof SHAPE_DRAW_TYPES>
  zeroPoint: PointType
  zeroPointCopy: PointType
  zoomCenter: PointType
  zoomY: number
  updateNextFrame: boolean
  hidden: boolean
  lineDash: number[]
  lineDashOffset: number
  filter: string
  layer: number
  zIndex: number
  parent?: StayInstantChild<InstantShape>

  constructor({
    color,
    lineWidth,
    type,
    gco,
    zoomCenter,
    zoomY,
    state = "default",
    hidden = false,
    stateDrawFuncMap = {},
    lineDash,
    lineDashOffset,
    filter,
    layer,
    zIndex,
  }: ShapeProps) {
    this.layer = layer ?? 0
    this.zIndex = zIndex ?? 0
    this.lineWidth = lineWidth ?? 1
    this.area = 0 // this is a placeholder for the area property that will be implemented in the subclasses
    this.type = type || SHAPE_DRAW_TYPES.STROKE // this is a placeholder for the type property that will be implemented in the subclasses
    this.zoomY = zoomY ?? 1
    this.zoomCenter = zoomCenter ?? { x: 0, y: 0 }
    this.gco = gco ?? "source-over"
    this.offsetX = 0
    this.offsetY = 0
    this.zeroPoint = { x: 0, y: 0 }
    this.zeroPointCopy = { x: 0, y: 0 }
    this.state = state
    this.lineDash = lineDash ?? []
    this.lineDashOffset = lineDashOffset ?? 0
    this.stateDrawFuncMap = {
      default: this.draw,
      ...stateDrawFuncMap,
    }
    this.filter = filter ?? "none"
    this.startTime = 0
    this.updateNextFrame = false
    this.hidden = hidden
    this.color = this.tryConvertToRGBA(color ?? "white")
  }

  tryConvertToRGBA(color: string | CanvasGradient | RGB | RGBA): RGBA | CanvasGradient {
    if (isRGBA(color)) {
      return { ...color }
    } else if (isRGB(color)) {
      return { ...color, a: 1 }
    } else if (typeof color === "string") {
      const c = new W3Color(color).toRgba()
      return { ...c }
    }
    return color as CanvasGradient
  }

  get colorStringOrCanvasGradient() {
    if (isRGBA(this.color)) {
      return rgbaToString(this.color)
    }
    return this.color
  }

  _copy() {
    return { ...this }
  }

  _draw({ context, now, width, height }: ShapeDrawProps): boolean {
    context.lineWidth = this.lineWidth
    context.globalCompositeOperation = this.gco
    context.setLineDash(this.lineDash)
    context.lineDashOffset = this.lineDashOffset
    this.setColor(context, this.color)
    context.filter = this.filter
    // this.draw({ context, canvas, now })
    if (this.updateNextFrame) {
      if (!this.hidden) {
        const drawStateResult = this.stateDrawFuncMap[this.state].bind(this)({
          context,
          now,
          width,
          height,
        })
        this.updateNextFrame = drawStateResult || false
      }
    }
    return this.updateNextFrame
  }

  _move(offsetX: number, offsetY: number): [number, number] {
    const ox = this.zeroPointCopy.x + offsetX - this.zeroPoint.x
    const oy = this.zeroPointCopy.y + offsetY - this.zeroPoint.y
    this.zeroPoint = {
      x: this.zeroPointCopy.x + offsetX,
      y: this.zeroPointCopy.y + offsetY,
    }
    return [ox, oy]
  }

  _update({
    color,
    lineWidth,
    zoomY,
    zoomCenter,
    type,
    gco,
    state,
    hidden,
    filter,
    stateDrawFuncMap,
    layer,
    zIndex,
  }: ShapeProps) {
    this.layer = layer ?? this.layer
    this.zIndex = zIndex ?? this.zIndex
    this.lineWidth = lineWidth ?? this.lineWidth
    this.zoomY = zoomY ?? this.zoomY
    this.zoomCenter = zoomCenter ?? this.zoomCenter
    this.type = type ?? this.type
    this.gco = gco ?? this.gco
    this.hidden = hidden ?? this.hidden
    this.filter = filter ?? this.filter
    this.color = this.tryConvertToRGBA(color ?? this.color)

    this.stateDrawFuncMap = stateDrawFuncMap ?? this.stateDrawFuncMap

    if (state) {
      this.switchState(state)
    }

    this.parent?.onChildShapeChange(this)
    return this
  }

  _zoom(deltaY: number, zoomCenter: PointType): number {
    const stepZoomY = 1 + deltaY * -0.001
    this.zoomY *= stepZoomY
    this.zoomCenter = zoomCenter
    this.zeroPoint = this.getZoomPoint(stepZoomY, this.zeroPoint)
    return 1 + deltaY * -0.001
  }

  pointOuterOfCanvas(canvas: HTMLCanvasElement, point: Coordinate) {
    return point.x < 0 || point.x > canvas.width || point.y < 0 || point.y > canvas.height
  }

  getInitPoint(point: PointType) {
    return {
      x: (point.x - this.zeroPoint.x) / this.zoomY,
      y: (point.y - this.zeroPoint.y) / this.zoomY,
    }
  }

  getZoomPoint(zoomScale: number, point: PointType) {
    return {
      x: (point.x - this.zoomCenter.x) * zoomScale + this.zoomCenter.x,
      y: (point.y - this.zoomCenter.y) * zoomScale + this.zoomCenter.y,
    }
  }
  moveInit() {
    this.zeroPointCopy = { ...this.zeroPoint }
  }

  screenToWorldLength(len: number, scaleRatio: number) {
    return len / scaleRatio / this.zoomY
  }

  screenToWorldPoint(point: PointType, offsetX: number, offsetY: number, scaleRatio: number) {
    const originPoint = this.getInitPoint({ x: point.x, y: point.y })
    return {
      x: (originPoint.x - offsetX) / scaleRatio,
      y: (originPoint.y - offsetY) / scaleRatio,
    }
  }

  setColor(context: DrawCanvasContext, color: CanvasGradient | RGBA) {
    this.color = color

    let c: string | CanvasGradient
    if (isRGBA(color)) {
      c = rgbaToString(color)
    } else {
      c = color
    }
    this.setContextColor(context, c, this.type)
  }

  setContextColor(
    context: DrawCanvasContext,
    color: string | CanvasGradient,
    type: valueof<typeof SHAPE_DRAW_TYPES>
  ) {
    if (type === SHAPE_DRAW_TYPES.STROKE) {
      context.strokeStyle = color
    } else if (type === SHAPE_DRAW_TYPES.FILL) {
      context.fillStyle = color
    }
  }

  switchState(state: string) {
    if (!(state in this.stateDrawFuncMap)) {
      throw new Error(`state ${state} not found`)
    }
    this.state = state
  }

  worldToScreenLength(len: number, scaleRatio: number) {
    return len * scaleRatio
  }

  worldToScreenPoint(point: PointType, offsetX: number, offsetY: number, scaleRatio: number) {
    return {
      x: point.x * scaleRatio + offsetX,
      y: point.y * scaleRatio + offsetY,
    }
  }

  abstract copy(): InstantShape

  abstract draw(props: ShapeDrawProps): void

  abstract move(offsetX: number, offsetY: number): void

  abstract update(props: { props?: ShapeProps }): this

  abstract zoom(zoomScale: number): void

  abstract getBound(): Rect

  contains(point: PointType): boolean {
    const bound = this.getBound()
    return (
      point.x > bound.x &&
      point.x < bound.x + bound.width &&
      point.y > bound.y &&
      point.y < bound.y + bound.height
    )
  }

  getCenterPoint(): Coordinate {
    const bound = this.getBound()
    return {
      x: bound.x + bound.width / 2,
      y: bound.y + bound.height / 2,
    }
  }
}

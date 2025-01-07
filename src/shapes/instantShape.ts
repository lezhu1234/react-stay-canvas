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
  CanvasStrokeProps,
  CanvasFillProps,
  CanvasGlobalProps,
} from "../userTypes"
import { applyEasing, hasIntersection, isRGB, isRGBA } from "../utils"
import W3Color, { RGB, RGBA, rgbaToString } from "../w3color"

export const ZeroColor: RGBA = { a: 0, r: 0, g: 0, b: 0 }
export const BlackColor: RGBA = { a: 1, r: 0, g: 0, b: 0 }
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
  offsetX: number
  offsetY: number
  startTime: number
  state: string
  stateDrawFuncMap: Dict<{
    commonDraw?: (props: ShapeDrawProps) => void | boolean
    stroke?: (props: ShapeDrawProps) => void | boolean
    fill?: (props: ShapeDrawProps) => void | boolean
    afterDraw?: (props: ShapeDrawProps) => void | boolean
  }>

  zeroPoint: PointType
  zeroPointCopy: PointType
  zoomCenter: PointType
  zoomY: number
  updateNextFrame: boolean

  layer: number
  zIndex: number
  parent?: StayInstantChild<InstantShape>
  strokeConfig: Required<CanvasStrokeProps>
  fillConfig: Required<CanvasFillProps>
  globalConfig: Required<CanvasGlobalProps>
  shapeStore: Map<string, any>

  constructor({
    zoomCenter,
    zoomY,
    state = "default",
    strokeConfig,
    fillConfig,
    stateDrawFuncMap = {},
    layer,
    zIndex,
    shapeStore = new Map(),
    globalConfig,
  }: ShapeProps) {
    this.layer = layer ?? 0
    this.zIndex = zIndex ?? 1
    this.area = 0 // this is a placeholder for the area property that will be implemented in the subclasses

    this.strokeConfig = {
      color: ZeroColor,
      lineWidth: 1,
      dash: [],
      dashOffset: 0,
      lineCap: "butt",
      lineJoin: "miter",
      miterLimit: 10,
      ...strokeConfig,
    }
    this.fillConfig = {
      color: ZeroColor,
      ...fillConfig,
    }
    this.globalConfig = {
      gco: "source-over",
      ...globalConfig,
    }

    this.zoomY = zoomY ?? 1
    this.zoomCenter = zoomCenter ?? { x: 0, y: 0 }

    this.offsetX = 0
    this.offsetY = 0
    this.zeroPoint = { x: 0, y: 0 }
    this.zeroPointCopy = { x: 0, y: 0 }
    this.state = state
    this.stateDrawFuncMap = {
      default: {
        commonDraw: this.commonDraw,
        stroke: this.stroke,
        fill: this.fill,
        afterDraw: this.afterDraw,
      },
      ...stateDrawFuncMap,
    }
    this.startTime = 0
    this.updateNextFrame = true
    this.shapeStore = shapeStore
  }

  isTransparent(color: RGBA) {
    return color.a === 0
  }

  shouldStroke(): boolean {
    return !this.isTransparent(this.strokeConfig.color)
  }

  shouldFill(): boolean {
    return !this.isTransparent(this.fillConfig.color)
  }

  normalizeColor(color: string | CanvasGradient | RGB | RGBA): RGBA | CanvasGradient {
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

  copyProps() {
    return {
      parent: this.parent,
      strokeConfig: this.strokeConfig,
      fillConfig: this.fillConfig,
    }
  }

  isOutOfViewport() {
    return this.parent && !hasIntersection(this.getBound(), this.parent.canvas.bound)
  }

  draw(props: ShapeDrawProps): boolean {
    if (!this.parent) {
      return true
    }
    if (this.isOutOfViewport()) {
      return true
    }

    const { context, now, width, height } = props
    // this.draw({ context, canvas, now })
    if (this.updateNextFrame) {
      const drawFunction = this.stateDrawFuncMap[this.state]

      let updateNextFrame = false

      context.globalCompositeOperation = this.globalConfig.gco

      drawFunction.commonDraw?.bind(this)(props)

      if (this.shouldStroke()) {
        this.setStroke(context, this.strokeConfig)
        updateNextFrame ||= drawFunction.stroke?.bind(this)(props) ?? false
      }
      if (this.shouldFill()) {
        this.setFill(context, this.fillConfig)
        updateNextFrame ||= drawFunction.fill?.bind(this)(props) ?? false
      }

      drawFunction.afterDraw?.bind(this)(props)

      // this.updateNextFrame = drawStateResult || false
    }
    return this.updateNextFrame
  }

  applyMove(offsetX: number, offsetY: number): [number, number] {
    const ox = this.zeroPointCopy.x + offsetX - this.zeroPoint.x
    const oy = this.zeroPointCopy.y + offsetY - this.zeroPoint.y
    this.zeroPoint = {
      x: this.zeroPointCopy.x + offsetX,
      y: this.zeroPointCopy.y + offsetY,
    }
    return [ox, oy]
  }

  applyUpdate({
    zoomY,
    zoomCenter,
    state,
    stateDrawFuncMap,
    layer,
    zIndex,
    strokeConfig,
    fillConfig,
  }: ShapeProps) {
    this.layer = layer ?? this.layer
    this.zIndex = zIndex ?? this.zIndex
    this.zoomY = zoomY ?? this.zoomY
    this.zoomCenter = zoomCenter ?? this.zoomCenter

    this.stateDrawFuncMap = stateDrawFuncMap ?? this.stateDrawFuncMap
    this.strokeConfig = {
      ...this.strokeConfig,
      ...strokeConfig,
    }
    this.fillConfig = {
      ...this.fillConfig,
      ...fillConfig,
    }

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

  isPointOutsideCanvas(canvas: HTMLCanvasElement, point: Coordinate) {
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

  abstract commonDraw(props: ShapeDrawProps): void
  abstract stroke(props: ShapeDrawProps): void
  abstract fill(props: ShapeDrawProps): void
  afterDraw(props: ShapeDrawProps) {}

  abstract move(offsetX: number, offsetY: number): void

  abstract update(props: ShapeProps): InstantShape

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

  getNonTransitionState() {
    return {
      layer: this.layer,
      zIndex: this.zIndex,
      globalConfig: this.globalConfig,
    }
  }

  getZeroConfig() {
    return {
      strokeConfig: this.zeroStroke(this.strokeConfig),
      fillConfig: this.zeroFill(this.fillConfig),
      ...this.getNonTransitionState(),
    }
  }

  setStroke(context: DrawCanvasContext, stroke: Required<CanvasStrokeProps>) {
    context.strokeStyle = rgbaToString(stroke.color)
    context.lineWidth = stroke.lineWidth
    context.lineCap = stroke.lineCap
    context.lineJoin = stroke.lineJoin
    context.miterLimit = stroke.miterLimit
    context.lineDashOffset = stroke.dashOffset
    context.setLineDash(stroke.dash)
  }

  setFill(context: DrawCanvasContext, fill: Required<CanvasFillProps>) {
    context.fillStyle = rgbaToString(fill.color)
  }

  zeroRGBA(rgba?: RGBA): RGBA {
    return {
      r: 0,
      g: 0,
      b: 0,
      ...rgba,
      a: 0,
    }
  }

  zeroStroke(stroke: CanvasStrokeProps): CanvasStrokeProps {
    return {
      ...stroke,
      color: this.zeroRGBA(stroke.color),
    }
  }

  zeroFill(fill: CanvasFillProps): CanvasFillProps {
    return {
      ...fill,
      color: this.zeroRGBA(fill.color),
    }
  }
}

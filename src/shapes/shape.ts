import { valueof } from "../stay/types"
import { SHAPE_DRAW_TYPES } from "../userConstants"
import { Dict, EasingFunction, ShapeDrawProps, ShapeProps, PointType } from "../userTypes"
import { applyEasing, isRGB, isRGBA } from "../utils"
import W3Color, { RGB, RGBA, rgbaToString } from "../w3color"
import { SimplePoint } from "./point"

export interface GetCurrentArgumentsProps {
  startArguments: Dict
  endArguments: Dict
  duration: number
  now: number
  ease?: boolean
  easeIn?: boolean
  easeOut?: boolean
}

export abstract class Shape {
  area: number
  color: string | CanvasGradient | RGB
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
  contentUpdated: boolean
  hidden: boolean
  opacity: number
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
    opacity,
  }: ShapeProps) {
    this.color = color || "white"
    this.lineWidth = lineWidth || 1
    this.area = 0 // this is a placeholder for the area property that will be implemented in the subclasses
    this.type = type || SHAPE_DRAW_TYPES.STROKE // this is a placeholder for the type property that will be implemented in the subclasses
    this.zoomY = zoomY ?? 1
    this.zoomCenter = zoomCenter ?? { x: 0, y: 0 }
    this.gco = gco || "source-over"
    this.offsetX = 0
    this.offsetY = 0
    this.zeroPoint = { x: 0, y: 0 }
    this.zeroPointCopy = { x: 0, y: 0 }
    this.state = state
    this.stateDrawFuncMap = {
      default: this.draw,
      ...stateDrawFuncMap,
    }
    this.startTime = 0
    this.updateNextFrame = false
    this.contentUpdated = true
    this.hidden = hidden
    this.opacity = opacity ?? 1
  }

  get rgba() {
    if (isRGB(this.color)) {
      return { ...this.color, a: this.opacity }
    } else if (typeof this.color === "string") {
      const w3color = new W3Color(this.color)
      return { ...w3color.toRgb(), a: this.opacity }
    }
    throw new Error("Invalid color")
  }

  get colorStringOrCanvasGradient() {
    if (isRGB(this.color)) {
      return rgbaToString(this.rgba)
    }
    return this.color
  }

  _copy() {
    return { ...this }
  }

  _draw({ context, canvas, now }: ShapeDrawProps): boolean {
    context.lineWidth = this.lineWidth
    context.globalCompositeOperation = this.gco
    this.setColor(context, this.colorStringOrCanvasGradient)
    // this.draw({ context, canvas, now })
    if (this.updateNextFrame || this.contentUpdated) {
      if (!this.hidden) {
        const drawStateResult = this.stateDrawFuncMap[this.state].bind(this)({
          context,
          canvas,
          now,
        })
        this.updateNextFrame = drawStateResult || false
      }
      this.contentUpdated = false
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
    stateDrawFuncMap,
    opacity,
  }: ShapeProps) {
    this.color = color ?? this.color
    this.lineWidth = lineWidth ?? this.lineWidth
    this.zoomY = zoomY ?? this.zoomY
    this.zoomCenter = zoomCenter ?? this.zoomCenter
    this.type = type ?? this.type
    this.gco = gco ?? this.gco
    this.hidden = hidden ?? this.hidden
    this.opacity = opacity ?? this.opacity

    this.stateDrawFuncMap = stateDrawFuncMap ?? this.stateDrawFuncMap
    this.contentUpdated = true

    if (state) {
      this.switchState(state)
    }
    return this
  }

  _zoom(deltaY: number, zoomCenter: PointType): number {
    const stepZoomY = 1 + deltaY * -0.001
    this.zoomY *= stepZoomY
    this.zoomCenter = zoomCenter
    this.zeroPoint = this.getZoomPoint(stepZoomY, this.zeroPoint)
    return 1 + deltaY * -0.001
  }

  get(key: keyof Shape) {
    return this[key] // this will return the value of the property with the given key (e.g., this.get('color') will return the color of the shape)
  }

  getCurrentArguments({
    now,
    startArguments,
    endArguments,
    duration,
    ease = false,
    easeOut = false,
    easeIn = false,
  }: GetCurrentArgumentsProps) {
    if (easeOut) {
      duration = duration * 2
    }
    const elapsed = (now - this.startTime) % duration
    const progress = ease ? 1 - Math.pow(elapsed / duration, 2) : elapsed / duration
    const currentArguments: Dict = {}
    function getCurrentValue(startValue: number, endValue: number, progress: number) {
      return startValue + (endValue - startValue) * progress
    }

    Object.keys(startArguments).forEach((key) => {
      if (key in endArguments) {
        currentArguments[key] = getCurrentValue(startArguments[key], endArguments[key], progress)
      }
    })

    return currentArguments
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

  setColor(context: CanvasRenderingContext2D, color: string | CanvasGradient) {
    this.color = color
    if (this.type === SHAPE_DRAW_TYPES.STROKE) {
      context.strokeStyle = this.color
    } else if (this.type === SHAPE_DRAW_TYPES.FILL) {
      context.fillStyle = this.color
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
  intermediateState(
    before: Shape,
    after: Shape,
    ratio: number,
    transitionType: EasingFunction
  ): Shape {
    return this
  }

  getIntermediateProps(
    before: Shape,
    after: Shape,
    ratio: number,
    transitionType: EasingFunction
  ): ShapeProps {
    return {
      ...this._copy(),
      color: this.getColorIntermediateState(before.rgba, after.rgba, ratio, transitionType),
      hidden: false,
      lineWidth: this.getNumberIntermediateState(
        before.lineWidth,
        after.lineWidth,
        ratio,
        transitionType
      ),
      opacity: this.getNumberIntermediateState(
        before.opacity,
        after.opacity,
        ratio,
        transitionType
      ),
      zoomY: this.getNumberIntermediateState(before.zoomY, after.zoomY, ratio, transitionType),
      zoomCenter: {
        x: this.getNumberIntermediateState(
          before.zoomCenter.x,
          after.zoomCenter.x,
          ratio,
          transitionType
        ),
        y: this.getNumberIntermediateState(
          before.zoomCenter.y,
          after.zoomCenter.y,
          ratio,
          transitionType
        ),
      },
    }
  }

  getNumberIntermediateState(
    before: number,
    after: number,
    ratio: number,
    transitionType: EasingFunction
  ) {
    return before + (after - before) * applyEasing(transitionType, ratio)
  }

  getColorIntermediateState(
    before: string | RGBA,
    after: string | RGBA,
    ratio: number,
    transitionType: EasingFunction
  ) {
    let beforeRgba: RGBA, afterColor: RGBA

    if (typeof before === "string") {
      beforeRgba = new W3Color(before).toRgba()
    } else {
      beforeRgba = before
    }
    if (typeof after === "string") {
      afterColor = new W3Color(after).toRgba()
    } else {
      afterColor = after
    }

    // const beforeRgba = new W3Color(before).toRgba()
    // const afterColor = new W3Color(after).toRgba()
    const rgba: RGBA = {
      r: this.getNumberIntermediateState(beforeRgba.r, afterColor.r, ratio, transitionType),
      g: this.getNumberIntermediateState(beforeRgba.g, afterColor.g, ratio, transitionType),
      b: this.getNumberIntermediateState(beforeRgba.b, afterColor.b, ratio, transitionType),
      a: this.getNumberIntermediateState(beforeRgba.a, afterColor.a, ratio, transitionType),
    }
    return rgba
  }

  awaitCopy() {
    return new Promise((resolve) => {
      resolve(this.copy())
    })
  }

  abstract contains(point: PointType, cxt?: CanvasRenderingContext2D): boolean

  abstract copy(): Shape

  abstract draw(props: ShapeDrawProps): void

  abstract move(offsetX: number, offsetY: number): void

  abstract update(props: { props?: ShapeProps }): this

  abstract zoom(zoomScale: number): void

  abstract getCenterPoint(): SimplePoint
}

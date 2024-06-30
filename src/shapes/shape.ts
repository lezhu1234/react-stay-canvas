import { valueof } from "../stay/types"
import { SHAPE_DRAW_TYPES } from "../userConstants"
import { Dict, SimplePoint } from "../userTypes"

export interface ShapeProps {
  color?: string | CanvasGradient
  lineWidth?: number
  zoomY?: number
  zoomCenter?: SimplePoint
  type?: valueof<typeof SHAPE_DRAW_TYPES>
  gco?: GlobalCompositeOperation
  stateDrawFuncMap?: Dict<(props: ShapeDrawProps) => void>
  state?: string
}

export interface ShapeDrawProps {
  context: CanvasRenderingContext2D
  canvas: HTMLCanvasElement
  now: number
}

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
  color: string | CanvasGradient
  gco: GlobalCompositeOperation
  lineWidth: number
  offsetX: number
  offsetY: number
  startTime: number
  state: string
  stateDrawFuncMap: Dict<(props: ShapeDrawProps) => void | boolean>
  type: valueof<typeof SHAPE_DRAW_TYPES>
  zeroPoint: SimplePoint
  zeroPointCopy: SimplePoint
  zoomCenter: SimplePoint
  zoomY: number
  updateNextFrame: boolean
  contentUpdated: boolean
  constructor({
    color,
    lineWidth,
    type,
    gco,
    state = "default",
    stateDrawFuncMap = {},
  }: ShapeProps) {
    this.color = color || "white"
    this.lineWidth = lineWidth || 1
    this.area = 0 // this is a placeholder for the area property that will be implemented in the subclasses
    this.type = type || SHAPE_DRAW_TYPES.STROKE // this is a placeholder for the type property that will be implemented in the subclasses
    this.zoomY = 1
    this.zoomCenter = { x: 0, y: 0 }
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
  }

  _copy() {
    return { ...this }
  }

  _draw({ context, canvas, now }: ShapeDrawProps) {
    // console.log("draw")
    context.lineWidth = this.lineWidth
    context.globalCompositeOperation = this.gco
    this.setColor(context, this.color)
    // this.draw({ context, canvas, now })
    if (this.updateNextFrame || this.contentUpdated) {
      const drawStateResult = this.stateDrawFuncMap[this.state].bind(this)({ context, canvas, now })
      this.updateNextFrame = drawStateResult || false
      this.contentUpdated = false
    }
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

  _update({ color, lineWidth, zoomY, zoomCenter, type, gco, state, stateDrawFuncMap }: ShapeProps) {
    this.color = color || this.color
    this.lineWidth = lineWidth === undefined ? this.lineWidth : lineWidth
    this.zoomY = zoomY || this.zoomY
    this.zoomCenter = zoomCenter || this.zoomCenter
    this.type = type || this.type
    this.gco = gco || this.gco

    this.stateDrawFuncMap = stateDrawFuncMap || this.stateDrawFuncMap
    this.contentUpdated = true

    if (state) {
      this.switchState(state)
    }
    return this
  }

  _zoom(deltaY: number, zoomCenter: SimplePoint): number {
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

  getInitPoint(point: SimplePoint) {
    return {
      x: (point.x - this.zeroPoint.x) / this.zoomY,
      y: (point.y - this.zeroPoint.y) / this.zoomY,
    }
  }

  getZoomPoint(zoomScale: number, point: SimplePoint) {
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

  screenToWorldPoint(point: SimplePoint, offsetX: number, offsetY: number, scaleRatio: number) {
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

  worldToScreenPoint(point: SimplePoint, offsetX: number, offsetY: number, scaleRatio: number) {
    return {
      x: point.x * scaleRatio + offsetX,
      y: point.y * scaleRatio + offsetY,
    }
  }

  abstract contains(point: SimplePoint, cxt?: CanvasRenderingContext2D): boolean

  abstract copy(): Shape

  abstract draw(props: ShapeDrawProps): void

  abstract move(offsetX: number, offsetY: number): void

  abstract update(props: any): this

  abstract zoom(zoomScale: number): void
}

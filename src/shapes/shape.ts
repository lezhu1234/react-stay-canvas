import { valueof } from "../stay/types"
import { SHAPE_DRAW_TYPES } from "../userConstants"
import { SimplePoint } from "../userTypes"

export interface ShapeProps {
  color?: string | CanvasGradient
  lineWidth?: number
  zoomY?: number
  zoomCenter?: SimplePoint
  type?: valueof<typeof SHAPE_DRAW_TYPES>
}

export abstract class Shape {
  area: number
  color: string | CanvasGradient
  lineWidth: number
  offsetX: number
  offsetY: number
  type: valueof<typeof SHAPE_DRAW_TYPES>
  zeroPoint: SimplePoint
  zeroPointCopy: SimplePoint
  zoomCenter: SimplePoint
  zoomY: number
  constructor({ color, lineWidth, type }: ShapeProps) {
    this.color = color || "white"
    this.lineWidth = lineWidth || 1
    this.area = 0 // this is a placeholder for the area property that will be implemented in the subclasses
    this.type = type || SHAPE_DRAW_TYPES.STROKE // this is a placeholder for the type property that will be implemented in the subclasses
    this.zoomY = 1
    this.zoomCenter = { x: 0, y: 0 }

    this.offsetX = 0
    this.offsetY = 0
    this.zeroPoint = { x: 0, y: 0 }
    this.zeroPointCopy = { x: 0, y: 0 }
  }

  _copy() {
    return { ...this }
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

  _update({ color, lineWidth, zoomY, zoomCenter, type }: ShapeProps) {
    this.color = color || this.color
    this.lineWidth = lineWidth || this.lineWidth
    this.zoomY = zoomY || this.zoomY
    this.zoomCenter = zoomCenter || this.zoomCenter
    this.type = type || this.type
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

  screenToWorldPoint(
    point: SimplePoint,
    offsetX: number,
    offsetY: number,
    scaleRatio: number
  ) {
    const originPoint = this.getInitPoint({ x: point.x, y: point.y })
    return {
      x: (originPoint.x - offsetX) / scaleRatio,
      y: (originPoint.y - offsetY) / scaleRatio,
    }
  }

  worldToScreenLength(len: number, scaleRatio: number) {
    return len * scaleRatio
  }

  worldToScreenPoint(
    point: SimplePoint,
    offsetX: number,
    offsetY: number,
    scaleRatio: number
  ) {
    return {
      x: point.x * scaleRatio + offsetX,
      y: point.y * scaleRatio + offsetY,
    }
  }

  abstract contains(point: SimplePoint): boolean

  abstract copy(): Shape

  abstract draw(ctx: CanvasRenderingContext2D, canvasData?: ImageData): void

  abstract move(offsetX: number, offsetY: number): void

  abstract update(props: any): any

  abstract zoom(zoomScale: number): void
}

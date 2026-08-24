import {
  AnimatedShape,
  type AnimatedShapeProps,
  type EasingFunction,
  type PointType,
  type Rect,
  type ShapeDrawProps,
} from "react-stay-canvas"

export interface MotionCapsuleProps extends AnimatedShapeProps {
  x: number
  y: number
  width: number
  height: number
}

export class MotionCapsule extends AnimatedShape {
  x: number
  y: number
  width: number
  height: number

  constructor(props: MotionCapsuleProps) {
    super(props)
    this.x = props.x
    this.y = props.y
    this.width = props.width
    this.height = props.height
    this.area = this.width * this.height
  }

  private get radius() {
    return Math.min(this.width, this.height) / 2
  }

  commonDraw({ context }: ShapeDrawProps) {
    const radius = this.radius
    const right = this.x + this.width
    const bottom = this.y + this.height
    context.beginPath()
    context.moveTo(this.x + radius, this.y)
    context.lineTo(right - radius, this.y)
    context.arcTo(right, this.y, right, this.y + radius, radius)
    context.lineTo(right, bottom - radius)
    context.arcTo(right, bottom, right - radius, bottom, radius)
    context.lineTo(this.x + radius, bottom)
    context.arcTo(this.x, bottom, this.x, bottom - radius, radius)
    context.lineTo(this.x, this.y + radius)
    context.arcTo(this.x, this.y, this.x + radius, this.y, radius)
    context.closePath()
  }

  stroke({ context }: ShapeDrawProps) {
    context.stroke()
  }

  fill({ context }: ShapeDrawProps) {
    context.fill()
  }

  getBound(): Rect {
    return { x: this.x, y: this.y, width: this.width, height: this.height }
  }

  contains(point: PointType) {
    const halfWidth = this.width / 2
    const halfHeight = this.height / 2
    const offsetX = Math.abs(point.x - (this.x + halfWidth))
    const offsetY = Math.abs(point.y - (this.y + halfHeight))
    if (offsetX > halfWidth || offsetY > halfHeight) return false

    const radius = this.radius
    if (offsetX <= halfWidth - radius || offsetY <= halfHeight - radius) return true
    return Math.hypot(
      offsetX - (halfWidth - radius),
      offsetY - (halfHeight - radius),
    ) <= radius
  }

  copy() {
    return new MotionCapsule({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      ...this.copyProps(),
    })
  }

  move(offsetX: number, offsetY: number) {
    this.update({ x: this.x + offsetX, y: this.y + offsetY })
  }

  zoom(scale: number) {
    const point = this.getZoomPoint(scale, { x: this.x, y: this.y })
    this.update({
      ...point,
      width: this.width * scale,
      height: this.height * scale,
    })
  }

  update(props: Partial<MotionCapsuleProps>) {
    this.x = props.x ?? this.x
    this.y = props.y ?? this.y
    this.width = props.width ?? this.width
    this.height = props.height ?? this.height
    this.area = this.width * this.height
    this.applyUpdate(props)
    return this
  }

  getTransProps() {
    return ["x", "y", "width", "height"]
  }

  intermediateState(
    before: MotionCapsule,
    after: MotionCapsule,
    ratio: number,
    transitionType: EasingFunction,
  ) {
    return new MotionCapsule(
      this.getIntermediateObj(before, after, ratio, transitionType) as MotionCapsuleProps,
    )
  }

  zeroShape() {
    return new MotionCapsule({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      ...this.getZeroConfig(),
    })
  }

  childSameAs(shape: MotionCapsule) {
    return this.x === shape.x
      && this.y === shape.y
      && this.width === shape.width
      && this.height === shape.height
  }
}

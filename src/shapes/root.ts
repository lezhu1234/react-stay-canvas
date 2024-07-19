import { Point } from "./point"
import { Rectangle, RectangleAttr } from "./rectangle"

export class Root extends Rectangle {
  initX: number
  initY: number
  initWidth: number
  initHeight: number
  constructor({ x, y, width, height, props = {} }: RectangleAttr) {
    super({ x, y, width, height, props })
    this.initX = x
    this.initY = y
    this.initWidth = width
    this.initHeight = height
  }
  copy() {
    return this
  }
  draw() {}

  contains(point: Point): boolean {
    return (
      point.x > this.initX &&
      point.x < this.initX + this.initWidth &&
      point.y > this.initY &&
      point.y < this.initY + this.initHeight
    )
  }
}

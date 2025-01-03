import { Point } from "./point"
import { Rectangle, RectangleAttr } from "./rectangle"

export class Root extends Rectangle {
  initX: number
  initY: number
  initWidth: number
  initHeight: number
  constructor(props: RectangleAttr) {
    super(props)
    const { x, y, width, height } = props
    this.initX = x
    this.initY = y
    this.initWidth = width
    this.initHeight = height
  }
  copy() {
    return this
  }
  draw() {}
}

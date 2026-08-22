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
    return new Root({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      ...this.copyProps(),
    })
  }
  stroke() {}
}

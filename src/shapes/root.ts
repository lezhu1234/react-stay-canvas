import { Rectangle } from "./rectangle"

export class Root extends Rectangle {
  copy() {
    return this
  }
  draw(ctx: CanvasRenderingContext2D) {}
  move() {
    return this
  }

  update() {
    return this
  }
  zoom() {
    return this
  }
}

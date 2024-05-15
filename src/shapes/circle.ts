import { SimplePoint } from "../userTypes"
import { Shape } from "./shape"

export class Circle extends Shape {
  //   constructor(props: any) {}
  contains(point: SimplePoint): boolean {
    throw new Error("Method not implemented.")
  }
  copy(): Shape {
    throw new Error("Method not implemented.")
  }
  draw(ctx: CanvasRenderingContext2D, canvasData?: ImageData): void {
    throw new Error("Method not implemented.")
  }
  move(offsetX: number, offsetY: number): void {
    throw new Error("Method not implemented.")
  }
  update(props: any) {
    throw new Error("Method not implemented.")
  }
  zoom(zoomScale: number): void {
    throw new Error("Method not implemented.")
  }
}

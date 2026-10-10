import type { EasingFunction } from "../types/animation"
import type { PointType, Rect } from "../types/geometry"
import type { AnimatedShapeProps, ShapeDrawProps } from "../types/shapes"
import { AnimatedShape } from "./animatedShape"

/** Canvas2D viewport paint with no content geometry; use a dedicated background Child. */
export class ViewportBackground extends AnimatedShape {
  constructor(props: AnimatedShapeProps = {}) { super(props) }

  commonDraw(): void {}
  stroke(): void {}
  override shouldStroke(): boolean { return false }

  fill({ context }: ShapeDrawProps): void {
    context.save()
    try {
      // The surface may be a resized backing store or a clipped region capture.
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.fillRect(0, 0, context.canvas.width, context.canvas.height)
    } finally {
      context.restore()
    }
  }

  getBound(): Rect { return { x: 0, y: 0, width: 0, height: 0 } }
  override shouldCullByBounds(): boolean { return false }
  override contains(_point: PointType): boolean { return false }
  getTransProps(): string[] { return [] }

  intermediateState(
    before: AnimatedShape,
    after: AnimatedShape,
    ratio: number,
    transitionType: EasingFunction
  ): ViewportBackground {
    return new ViewportBackground(this.getIntermediateObj(before, after, ratio, transitionType))
  }

  childSameAs(shape: AnimatedShape): boolean { return shape instanceof ViewportBackground }
  copy(): ViewportBackground { return new ViewportBackground(this.copyProps()) }
  zeroShape(): ViewportBackground { return new ViewportBackground({ ...this.getZeroConfig(), transition: this.transition }) }
  move(_offsetX: number, _offsetY: number): void {}
  zoom(_zoomScale: number): void {}
  update(props: AnimatedShapeProps): this {
    this.applyUpdate(props)
    this.transition = { ...this.transition, ...props.transition }
    return this
  }
}

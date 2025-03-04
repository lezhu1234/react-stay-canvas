import { Rectangle } from "./rectangle"

import { AnimatedShapeProps, EasingFunction, ShapeDrawProps, ShapeProps } from "../userTypes"
import { isRGBA } from "../utils"
import { DrawCanvasContext } from "../types"
import { RGBA } from "../w3color"

export interface ImageProps extends AnimatedShapeProps {
  image: HTMLImageElement
  x: number
  y: number
  width: number
  height: number
  sx?: number
  sy?: number
  swidth?: number
  sheight?: number
  imageLoaded?: (image: StayImage) => void
  opacity: number
}
type ImageLoadState = "wait" | "loading" | "loaded"

export class StayImage extends Rectangle {
  ctx: null | DrawCanvasContext
  imageLoaded?: (image: StayImage) => void
  loadState: ImageLoadState
  naturalHeight: number
  naturalWidth: number
  sheight?: number
  image: HTMLImageElement
  swidth?: number
  sx: number
  sy: number
  opacity: number
  constructor(props: ImageProps) {
    super(props)
    const {
      image,
      x,
      y,
      width,
      height,
      sx = 0,
      sy = 0,
      swidth,
      sheight,
      imageLoaded,
      opacity,
    } = props
    this.sx = sx || 0
    this.sy = sy || 0
    this.swidth = swidth
    this.sheight = sheight
    this.image = image
    this.loadState = "loaded"
    this.swidth = this.image.naturalWidth
    this.sheight = this.image.naturalHeight

    this.ctx = null
    this.imageLoaded = imageLoaded
    this.naturalWidth = 0
    this.naturalHeight = 0
    this.opacity = opacity
  }
  copy(): StayImage {
    return new StayImage({
      image: this.image,
      x: this.x,
      y: this.y,
      sx: this.sx,
      sy: this.sy,
      swidth: this.swidth,
      sheight: this.sheight,
      imageLoaded: this.imageLoaded,
      width: this.width,
      height: this.height,
      opacity: this.opacity,
      ...this.copyProps(),
    })
  }

  /**
   * 在画布上绘制图像。
   *
   * @param ctx - CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
，用于在HTML5 canvas元素上绘图的2D渲染上下文对象。
   * @param this.image - Image对象，要绘制的图像源。
   * @param this.sx - number，图像源的起始x坐标，相对于图像的左上角。
   * @param this.sy - number，图像源的起始y坐标，相对于图像的左上角。
   * @param this.swidth - number，图像源的宽度，用于裁剪图像。
   * @param this.sheight - number，图像源的高度，用于裁剪图像。
   * @param this.x - number，目标绘制的起始x坐标，相对于canvas的左上角。
   * @param this.y - number，目标绘制的起始y坐标，相对于canvas的左上角。
   * @param this.width - number，目标绘制的宽度，可以大于或小于源图像的宽度来缩放图像。
   * @param this.height - number，目标绘制的高度，可以大于或小于源图像的高度来缩放图像。
   *
   * @returns void
   */
  commonDraw({ context }: ShapeDrawProps): void {
    if (this.loadState === "loading") {
      this.ctx = context
      return
    }
    const originOpacity = context.globalAlpha
    context.globalAlpha = this.opacity
    context.drawImage(
      this.image,
      this.sx,
      this.sy,
      this.swidth as number,
      this.sheight as number,
      this.x,
      this.y,
      this.width,
      this.height
    )
    context.globalAlpha = originOpacity
  }
  fill(props: ShapeDrawProps): void {}

  stroke({ context }: ShapeDrawProps): void {}

  intermediateState(
    before: StayImage,
    after: StayImage,
    ratio: number,
    transitionType: EasingFunction
  ): StayImage {
    const obj = this.getIntermediateObj(before, after, ratio, transitionType)
    return new StayImage({
      ...obj,
      image: after.image,
    })
  }

  getTransProps() {
    return ["x", "y", "width", "height", "opacity"]
  }

  update(props: Partial<ImageProps>) {
    const { image: src, x, y, width, sx, sy, swidth, sheight, height, imageLoaded } = props
    this.image = src ?? this.image
    this.sx = sx ?? this.sx
    this.sy = sy ?? this.sy
    this.swidth = swidth ?? this.swidth
    this.sheight = sheight ?? this.sheight
    this.imageLoaded = imageLoaded ?? this.imageLoaded
    super.update({ x, y, width, height })

    if (src === undefined) {
      // do nothing
    } else if (typeof src === "string") {
      this.loadState = "loading"
      this.image.src = src
    } else {
      this.image = src
      this.loadState = "loaded"
      this.swidth = this.image.naturalWidth
      this.sheight = this.image.naturalHeight
    }
    return this
  }

  childSameAs(shape: StayImage): boolean {
    return (
      this.x === shape.x &&
      this.y === shape.y &&
      this.width === shape.width &&
      this.height === shape.height &&
      this.image === shape.image &&
      this.opacity === shape.opacity
    )
  }

  zeroShape(): StayImage {
    return new StayImage({
      image: this.image,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      sx: this.sx,
      sy: this.sy,
      swidth: this.swidth,
      sheight: this.sheight,
      ...this.copyProps(),
      opacity: 0,
    })
  }
}

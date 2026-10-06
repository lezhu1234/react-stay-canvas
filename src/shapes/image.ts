import { Rectangle } from "./rectangle"

import type { EasingFunction } from "../types/animation"
import type { DrawCanvasContext } from "../types/canvas"
import type { AnimatedShapeProps, ShapeDrawProps, ShapeProps } from "../types/shapes"
import { isRGBA } from "../utils/color"
import { RGBA } from "../vendor/w3color"

export type StayImageSource = HTMLImageElement | ImageBitmap

function imageSize(source: StayImageSource) {
  return "naturalWidth" in source
    ? { width: source.naturalWidth, height: source.naturalHeight }
    : { width: source.width, height: source.height }
}

export interface ImageProps<Source extends StayImageSource = HTMLImageElement> extends AnimatedShapeProps {
  image: Source
  x: number
  y: number
  width: number
  height: number
  sx?: number
  sy?: number
  swidth?: number
  sheight?: number
  imageLoaded?: (image: StayImage<Source>) => void
  opacity: number
}
type ImageLoadState = "wait" | "loading" | "loaded"

export class StayImage<Source extends StayImageSource = HTMLImageElement> extends Rectangle {
  ctx: null | DrawCanvasContext
  imageLoaded?: (image: StayImage<Source>) => void
  loadState: ImageLoadState
  naturalHeight: number
  naturalWidth: number
  sheight?: number
  image: Source
  swidth?: number
  sx: number
  sy: number
  opacity: number

  override shouldFill(): boolean {
    return this.opacity > 0
  }

  constructor(props: ImageProps<Source>) {
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
    this.swidth = swidth ?? imageSize(this.image).width
    this.sheight = sheight ?? imageSize(this.image).height

    this.ctx = null
    this.imageLoaded = imageLoaded
    this.naturalWidth = 0
    this.naturalHeight = 0
    this.opacity = opacity
  }
  copy(): StayImage<Source> {
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
    before: StayImage<Source>,
    after: StayImage<Source>,
    ratio: number,
    transitionType: EasingFunction
  ): StayImage<Source> {
    const obj = this.getIntermediateObj(before, after, ratio, transitionType)
    return new StayImage({
      ...obj,
      image: after.image,
    })
  }

  getTransProps() {
    return ["x", "y", "width", "height", "opacity"]
  }

  override getNonTransitionState() {
    return { ...super.getNonTransitionState(), sx: this.sx, sy: this.sy,
      swidth: this.swidth, sheight: this.sheight, imageLoaded: this.imageLoaded }
  }

  update(props: Partial<ImageProps<Source>>) {
    const { image: src, x, y, width, sx, sy, swidth, sheight, height, imageLoaded } = props
    this.image = src ?? this.image
    this.sx = sx ?? this.sx
    this.sy = sy ?? this.sy
    this.swidth = swidth ?? this.swidth
    this.sheight = sheight ?? this.sheight
    this.imageLoaded = imageLoaded ?? this.imageLoaded
    super.update({ x, y, width, height })

    if (src !== undefined) {
      this.loadState = "loaded"
      this.swidth = swidth ?? imageSize(src).width
      this.sheight = sheight ?? imageSize(src).height
    }
    return this
  }

  childSameAs(shape: StayImage<Source>): boolean {
    return (
      this.x === shape.x &&
      this.y === shape.y &&
      this.width === shape.width &&
      this.height === shape.height &&
      this.image === shape.image &&
      this.opacity === shape.opacity &&
      this.sx === shape.sx && this.sy === shape.sy &&
      this.swidth === shape.swidth && this.sheight === shape.sheight &&
      this.imageLoaded === shape.imageLoaded
    )
  }

  zeroShape(): StayImage<Source> {
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

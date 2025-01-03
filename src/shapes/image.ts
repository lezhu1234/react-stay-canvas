import { Rectangle } from "./rectangle"

import { AnimatedShapeProps, EasingFunction, ShapeDrawProps, ShapeProps } from "../userTypes"
import { isRGBA } from "../utils"
import { DrawCanvasContext } from "../types"
import { RGBA } from "../w3color"

export interface ImageProps extends AnimatedShapeProps {
  src: string | HTMLImageElement
  x: number
  y: number
  width: number
  height: number
  sx?: number
  sy?: number
  swidth?: number
  sheight?: number
  imageLoaded?: (image: StayImage) => void
  color: RGBA
}
type ImageLoadState = "wait" | "loading" | "loaded"

export class StayImage extends Rectangle {
  ctx: null | DrawCanvasContext
  image: HTMLImageElement
  imageLoaded?: (image: StayImage) => void
  loadState: ImageLoadState
  naturalHeight: number
  naturalWidth: number
  sheight?: number
  src: string | HTMLImageElement
  swidth?: number
  sx: number
  sy: number
  opacity: number
  color: RGBA
  constructor(props: ImageProps) {
    super(props)
    const { src, x, y, width, height, color, sx = 0, sy = 0, swidth, sheight, imageLoaded } = props
    this.sx = sx || 0
    this.sy = sy || 0
    this.swidth = swidth
    this.sheight = sheight
    this.src = src
    this.color = color
    if (typeof src === "string") {
      this.image = new Image()
      this.loadState = "loading"
      this.image.onload = () => {
        this.loadState = "loaded"
        this.naturalWidth = this.image.naturalWidth
        this.naturalHeight = this.image.naturalHeight
        if (this.swidth === undefined) {
          this.swidth = this.image.naturalWidth
        }
        if (this.sheight === undefined) {
          this.sheight = this.image.naturalHeight
        }
        if (this.imageLoaded) {
          this.imageLoaded(this)
        }
        this.updateNextFrame = true
      }
      this.image.src = src
    } else {
      this.image = src
      this.loadState = "loaded"
      this.swidth = this.image.naturalWidth
      this.sheight = this.image.naturalHeight
    }

    this.ctx = null
    this.imageLoaded = imageLoaded
    this.naturalWidth = 0
    this.naturalHeight = 0
    this.opacity = isRGBA(this.color) ? this.color.a : 1
  }
  copy(): StayImage {
    return new StayImage({
      src: this.src,
      x: this.x,
      y: this.y,
      sx: this.sx,
      sy: this.sy,
      swidth: this.swidth,
      sheight: this.sheight,
      imageLoaded: this.imageLoaded,
      width: this.width,
      height: this.height,
      color: this.color,
      ...this.copyProps(),
    })
  }

  awaitCopy() {
    return new Promise<StayImage>((resolve) => {
      new StayImage({
        src: this.src,
        x: this.x,
        y: this.y,
        sx: this.sx,
        sy: this.sy,
        swidth: this.swidth,
        sheight: this.sheight,
        imageLoaded: (image) => {
          if (this.imageLoaded) {
            this.imageLoaded(image)
          }
          resolve(image)
        },
        width: this.width,
        height: this.height,
        color: this.color,
        ...this.copyProps(),
      })

      if (typeof this.src !== "string") {
        resolve(this)
      }
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
  draw({ context }: ShapeDrawProps): void {
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

  // intermediateState(
  //   before: StayImage,
  //   after: StayImage,
  //   ratio: number,
  //   transitionType: EasingFunction
  // ) {
  //   return new StayImage({
  //     src: after.src,
  //     x: this.getNumberIntermediateState(before.x, after.x, ratio, transitionType),
  //     y: this.getNumberIntermediateState(before.y, after.y, ratio, transitionType),
  //     width: this.getNumberIntermediateState(before.width, after.width, ratio, transitionType),
  //     height: this.getNumberIntermediateState(before.height, after.height, ratio, transitionType),
  //     sx: this.getNumberIntermediateState(before.sx, after.sx, ratio, transitionType),
  //     sy: this.getNumberIntermediateState(before.sy, after.sy, ratio, transitionType),
  //     swidth:
  //       before.swidth && after.swidth
  //         ? this.getNumberIntermediateState(before.swidth, after.swidth, ratio, transitionType)
  //         : after.swidth,
  //     sheight:
  //       before.sheight && after.sheight
  //         ? this.getNumberIntermediateState(before.sheight, after.sheight, ratio, transitionType)
  //         : after.sheight,
  //     props: this.getIntermediateProps(before, after, ratio, transitionType),
  //   })
  // }

  update(props: Partial<ImageProps>) {
    const { src, x, y, width, sx, sy, swidth, sheight, height, imageLoaded } = props
    this.src = src ?? this.src
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

  zeroShape(): StayImage {
    return new StayImage({
      src: this.image,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      sx: this.sx,
      sy: this.sy,
      swidth: this.swidth,
      sheight: this.sheight,
      ...this.copyProps(),
      color: { ...this.color, a: 0 },
    })
  }
}

import { Rectangle } from "./rectangle"
import { Shape } from "./shape"
import { ShapeDrawProps, ShapeProps } from "../userTypes"

export interface ImageProps {
  src: string
  x: number
  y: number
  width: number
  height: number
  sx?: number
  sy?: number
  swidth?: number
  sheight?: number
  imageLoaded?: (image: StayImage) => void
  props?: ShapeProps
}
type ImageLoadState = "wait" | "loading" | "loaded"

export class StayImage extends Rectangle {
  ctx: null | CanvasRenderingContext2D
  image: HTMLImageElement
  imageLoaded?: (image: StayImage) => void
  loadState: ImageLoadState
  naturalHeight: number
  naturalWidth: number
  sheight?: number
  src: string
  swidth?: number
  sx: number
  sy: number
  constructor({
    src,
    x,
    y,
    width,
    height,
    sx = 0,
    sy = 0,
    swidth,
    sheight,
    imageLoaded,
    props,
  }: ImageProps) {
    super({ x, y, width, height, props })
    this.sx = sx || 0
    this.sy = sy || 0
    this.swidth = swidth
    this.sheight = sheight
    this.src = src
    this.image = new Image()
    this.loadState = "loading"
    this.ctx = null
    this.imageLoaded = imageLoaded
    this.naturalWidth = 0
    this.naturalHeight = 0

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
      props: this._copy(),
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
        props: this._copy(),
      })
    })
  }

  /**
   * 在画布上绘制图像。
   *
   * @param ctx - CanvasRenderingContext2D，用于在HTML5 canvas元素上绘图的2D渲染上下文对象。
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
  }

  update({
    src,
    x,
    y,
    width,
    sx,
    sy,
    swidth,
    sheight,
    height,
    imageLoaded,
    props,
  }: Partial<ImageProps>) {
    this.src = src ?? this.src
    this.sx = sx ?? this.sx
    this.sy = sy ?? this.sy
    this.swidth = swidth ?? this.swidth
    this.sheight = sheight ?? this.sheight
    this.imageLoaded = imageLoaded ?? this.imageLoaded
    super.update({ x, y, width, height, props })

    if (src !== undefined) {
      this.loadState = "loading"
      this.image.src = src
    }
    return this
  }
}

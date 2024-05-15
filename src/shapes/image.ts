import { Rectangle } from "./rectangle"
import { ShapeProps } from "./shape"

export interface ImageProps {
  src: string
  x: number
  y: number
  width: number
  height: number
  imageLoaded?: () => void
  props?: ShapeProps
}
type ImageLoadState = "wait" | "loading" | "loaded"

export class StayImage extends Rectangle {
  ctx: null | CanvasRenderingContext2D
  image: HTMLImageElement
  imageLoaded?: () => void
  loadState: ImageLoadState
  src: string
  constructor({ src, x, y, width, height, imageLoaded, props }: ImageProps) {
    super({ x, y, width, height, props })
    this.src = src
    this.image = new Image()
    this.loadState = "loading"
    this.ctx = null
    this.imageLoaded = imageLoaded
    this.image.onload = () => {
      this.loadState = "loaded"
      if (this.ctx) {
        this.draw(this.ctx)
      }
      if (imageLoaded) {
        imageLoaded()
      }
    }
    this.image.src = src
  }
  copy(): StayImage {
    return new StayImage({
      src: this.src,
      x: this.x,
      y: this.y,
      imageLoaded: this.imageLoaded,
      width: this.width,
      height: this.height,
      props: this._copy(),
    })
  }
  draw(ctx: CanvasRenderingContext2D): void {
    if (this.loadState === "loading") {
      this.ctx = ctx
      return
    }
    ctx.drawImage(this.image, this.x, this.y, this.width, this.height)
  }

  update({ src, x, y, width, height, props }: Partial<ImageProps>) {
    this.src = src || this.src
    super.update({ x, y, width, height, props })
    return this
  }
}

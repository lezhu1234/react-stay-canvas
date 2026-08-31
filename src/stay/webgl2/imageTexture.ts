export type ImageTexturePixelData = Uint8Array | Uint8ClampedArray

export interface ImageTextureProps {
  readonly width: number
  readonly height: number
  /** Row-major opaque sRGB RGBA8 pixels. The first row is sampled at v = 0. */
  readonly data: ImageTexturePixelData
}

/** @internal CPU-owned image state copied into History and GPU upload snapshots. */
export interface ImageTextureSnapshot {
  readonly width: number
  readonly height: number
  readonly data: Uint8Array
}

function positiveDimension(value: number, name: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`ImageTexture ${name} must be a positive integer`)
  }
  return value
}

function copyPixels({ width, height, data }: ImageTextureProps) {
  const copiedWidth = positiveDimension(width, "width")
  const copiedHeight = positiveDimension(height, "height")
  if (!(data instanceof Uint8Array) && !(data instanceof Uint8ClampedArray)) {
    throw new TypeError("ImageTexture data must be a Uint8Array or Uint8ClampedArray")
  }
  const pixelCount = copiedWidth * copiedHeight
  const expectedLength = pixelCount * 4
  if (!Number.isSafeInteger(pixelCount) || !Number.isSafeInteger(expectedLength)) {
    throw new RangeError("ImageTexture dimensions exceed the safe RGBA8 image range")
  }
  if (data.length !== expectedLength) {
    throw new RangeError(`ImageTexture data must contain exactly ${expectedLength} RGBA8 values`)
  }
  const copied = new Uint8Array(data)
  for (let index = 3; index < copied.length; index += 4) {
    if (copied[index] !== 255) {
      throw new RangeError("ImageTexture alpha must be 255 for every opaque pixel")
    }
  }
  return { width: copiedWidth, height: copiedHeight, data: copied }
}

/** Immutable CPU-owned opaque sRGB image data for an ImageMaterial. */
export class ImageTexture {
  readonly width: number
  readonly height: number
  readonly #data: Uint8Array

  constructor(props: ImageTextureProps) {
    const image = copyPixels(props)
    this.width = image.width
    this.height = image.height
    this.#data = image.data
    Object.freeze(this)
  }

  /** @internal Returns an owned copy only when History or a GPU upload needs it. */
  copySnapshot(): ImageTextureSnapshot {
    return {
      width: this.width,
      height: this.height,
      data: new Uint8Array(this.#data),
    }
  }
}

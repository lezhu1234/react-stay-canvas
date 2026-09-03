export type ImageTexturePixelData = Uint8Array | Uint8ClampedArray
export type ImageTextureAlphaMode = "opaque" | "straight"

export interface ImageTextureProps {
  readonly width: number
  readonly height: number
  /** Defaults to `opaque`; `straight` accepts unassociated sRGB RGBA8 pixels. */
  readonly alphaMode?: ImageTextureAlphaMode
  /** Row-major sRGB RGBA8 pixels. The first row is sampled at v = 0. */
  readonly data: ImageTexturePixelData
}

/** @internal CPU-owned image state copied into History and GPU upload snapshots. */
export interface ImageTextureSnapshot {
  readonly width: number
  readonly height: number
  readonly alphaMode: ImageTextureAlphaMode
  readonly data: Uint8Array
}

function positiveDimension(value: number, name: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`ImageTexture ${name} must be a positive integer`)
  }
  return value
}

function copyAlphaMode(value: ImageTextureAlphaMode | undefined): ImageTextureAlphaMode {
  const alphaMode = value ?? "opaque"
  if (alphaMode !== "opaque" && alphaMode !== "straight") {
    throw new TypeError("ImageTexture alphaMode must be opaque or straight")
  }
  return alphaMode
}

function copyPixels({ width, height, alphaMode: inputAlphaMode, data }: ImageTextureProps) {
  const copiedWidth = positiveDimension(width, "width")
  const copiedHeight = positiveDimension(height, "height")
  const alphaMode = copyAlphaMode(inputAlphaMode)
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
  if (alphaMode === "opaque") {
    for (let index = 3; index < copied.length; index += 4) {
      if (copied[index] !== 255) {
        throw new RangeError("ImageTexture alpha must be 255 for every opaque pixel")
      }
    }
  }
  return { width: copiedWidth, height: copiedHeight, alphaMode, data: copied }
}

/** Immutable CPU-owned sRGB RGBA8 image data for an image material. */
export class ImageTexture {
  readonly width: number
  readonly height: number
  readonly alphaMode: ImageTextureAlphaMode
  readonly #data: Uint8Array

  constructor(props: ImageTextureProps) {
    const image = copyPixels(props)
    this.width = image.width
    this.height = image.height
    this.alphaMode = image.alphaMode
    this.#data = image.data
    Object.freeze(this)
  }

  /** @internal Returns an owned copy only when History or a GPU upload needs it. */
  copySnapshot(): ImageTextureSnapshot {
    return {
      width: this.width,
      height: this.height,
      alphaMode: this.alphaMode,
      data: new Uint8Array(this.#data),
    }
  }
}

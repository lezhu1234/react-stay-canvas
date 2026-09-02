export type EnvironmentMapPixelData = Uint8Array | Uint8ClampedArray

export interface EnvironmentMapImage {
  readonly width: number
  readonly height: number
  /** Row-major equirectangular RGBA8 pixels. */
  readonly data: EnvironmentMapPixelData
}

export interface EnvironmentMapProps extends EnvironmentMapImage {
  readonly intensity?: number
}

/** @internal */
export interface EnvironmentMapImageSnapshot {
  readonly width: number
  readonly height: number
  readonly data: Uint8Array
  readonly revision: number
}

function copyIntensity(value: number) {
  if (!Number.isFinite(value)) throw new TypeError("EnvironmentMap intensity must be finite")
  if (value < 0) throw new RangeError("EnvironmentMap intensity must be greater than or equal to 0")
  const copied = Math.fround(value)
  if (!Number.isFinite(copied)) {
    throw new RangeError("EnvironmentMap intensity exceeds Float32 range")
  }
  return copied
}

function copyImage({ width, height, data }: EnvironmentMapImage) {
  if (!Number.isInteger(width) || width <= 0) {
    throw new RangeError("EnvironmentMap width must be a positive integer")
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new RangeError("EnvironmentMap height must be a positive integer")
  }
  if (width !== height * 2) {
    throw new RangeError("EnvironmentMap must use a 2:1 equirectangular image")
  }
  if (!(data instanceof Uint8Array) && !(data instanceof Uint8ClampedArray)) {
    throw new TypeError("EnvironmentMap data must be a Uint8Array or Uint8ClampedArray")
  }
  const expectedLength = width * height * 4
  if (!Number.isSafeInteger(expectedLength) || data.length !== expectedLength) {
    throw new RangeError(`EnvironmentMap data must contain exactly ${expectedLength} RGBA8 values`)
  }
  return { width, height, data: new Uint8Array(data) }
}

function pixelsEqual(first: Uint8Array, second: Uint8Array) {
  if (first.length !== second.length) return false
  for (let index = 0; index < first.length; index++) {
    if (first[index] !== second[index]) return false
  }
  return true
}

/** Layer-owned equirectangular environment radiance for reflective materials. */
export class EnvironmentMap {
  #width: number
  #height: number
  #data: Uint8Array
  #intensity: number
  #imageRevision = 0
  readonly #changeListeners = new Set<() => void>()

  constructor({ width, height, data, intensity = 1 }: EnvironmentMapProps) {
    const image = copyImage({ width, height, data })
    this.#width = image.width
    this.#height = image.height
    this.#data = image.data
    this.#intensity = copyIntensity(intensity)
  }

  setImage(image: EnvironmentMapImage) {
    const copied = copyImage(image)
    if (this.#width === copied.width
        && this.#height === copied.height
        && pixelsEqual(this.#data, copied.data)) return
    this.#width = copied.width
    this.#height = copied.height
    this.#data = copied.data
    this.#imageRevision += 1
    this.#notifyChange()
  }

  setIntensity(intensity: number) {
    const copied = copyIntensity(intensity)
    if (this.#intensity === copied) return
    this.#intensity = copied
    this.#notifyChange()
  }

  get width() {
    return this.#width
  }

  get height() {
    return this.#height
  }

  get intensity() {
    return this.#intensity
  }

  /** @internal Lets the GPU cache skip unchanged pixel uploads. */
  get imageRevision() {
    return this.#imageRevision
  }

  /** @internal Returns an owned upload snapshot only when the GPU cache needs it. */
  copyImageSnapshot(): EnvironmentMapImageSnapshot {
    return {
      width: this.#width,
      height: this.#height,
      data: new Uint8Array(this.#data),
      revision: this.#imageRevision,
    }
  }

  /** @internal Lets the owning layer translate environment changes into dirtiness. */
  subscribeChanges(listener: () => void) {
    this.#changeListeners.add(listener)
    return () => this.#changeListeners.delete(listener)
  }

  #notifyChange() {
    this.#changeListeners.forEach((listener) => listener())
  }
}

import type { Vector3 } from "./math3D"

export type LightColor = readonly [number, number, number]
/** @internal Current opaque forward-pipeline capacity. */
export const webGL2DirectionalLightLimit = 4

export interface AmbientLightProps {
  readonly color?: LightColor
  readonly intensity?: number
}

export interface DirectionalLightProps extends AmbientLightProps {
  readonly directionToLight: Vector3
}

function copyColor(color: LightColor = [1, 1, 1], name: string): LightColor {
  const copied: [number, number, number] = [color[0], color[1], color[2]]
  copied.forEach((value, index) => {
    if (!Number.isFinite(value)) throw new TypeError(`${name}[${index}] must be finite`)
    if (value < 0 || value > 1) throw new RangeError(`${name} must be between 0 and 1`)
  })
  return copied
}

function copyIntensity(intensity = 1, name: string) {
  if (!Number.isFinite(intensity)) throw new TypeError(`${name} must be finite`)
  if (intensity < 0) throw new RangeError(`${name} must not be negative`)
  const copied = Math.fround(intensity)
  if (!Number.isFinite(copied)) throw new RangeError(`${name} exceeds Float32 range`)
  return copied
}

function copyDirection(direction: Vector3): Vector3 {
  const length = Math.hypot(direction[0], direction[1], direction[2])
  if (!Number.isFinite(length) || length === 0) {
    throw new RangeError("DirectionalLight directionToLight must have a finite non-zero length")
  }
  return [direction[0] / length, direction[1] / length, direction[2] / length]
}

function valuesEqual(first: ArrayLike<number>, second: ArrayLike<number>) {
  if (first.length !== second.length) return false
  for (let index = 0; index < first.length; index++) {
    if (first[index] !== second[index]) return false
  }
  return true
}

abstract class ObservableLight {
  readonly #changeListeners = new Set<() => void>()

  /** @internal Lets the owning layer translate light mutations into dirtiness. */
  subscribeChanges(listener: () => void) {
    this.#changeListeners.add(listener)
    return () => this.#changeListeners.delete(listener)
  }

  protected notifyChange() {
    this.#changeListeners.forEach((listener) => listener())
  }
}

/** Layer-owned uniform ambient illumination. */
export class AmbientLight extends ObservableLight {
  readonly kind = "ambient"
  #color: LightColor
  #intensity: number

  constructor({ color, intensity }: AmbientLightProps = {}) {
    super()
    this.#color = copyColor(color, "AmbientLight color")
    this.#intensity = copyIntensity(intensity, "AmbientLight intensity")
  }

  setColor(color: LightColor) {
    const next = copyColor(color, "AmbientLight color")
    if (valuesEqual(this.#color, next)) return
    this.#color = next
    this.notifyChange()
  }

  setIntensity(intensity: number) {
    const next = copyIntensity(intensity, "AmbientLight intensity")
    if (this.#intensity === next) return
    this.#intensity = next
    this.notifyChange()
  }

  getColor(): LightColor {
    return [...this.#color]
  }

  get intensity() {
    return this.#intensity
  }
}

/** Layer-owned directional illumination expressed as a normalized world-space direction to the light. */
export class DirectionalLight extends ObservableLight {
  readonly kind = "directional"
  #directionToLight: Vector3
  #color: LightColor
  #intensity: number

  constructor({ directionToLight, color, intensity }: DirectionalLightProps) {
    super()
    this.#directionToLight = copyDirection(directionToLight)
    this.#color = copyColor(color, "DirectionalLight color")
    this.#intensity = copyIntensity(intensity, "DirectionalLight intensity")
  }

  setDirectionToLight(directionToLight: Vector3) {
    const next = copyDirection(directionToLight)
    if (valuesEqual(this.#directionToLight, next)) return
    this.#directionToLight = next
    this.notifyChange()
  }

  setColor(color: LightColor) {
    const next = copyColor(color, "DirectionalLight color")
    if (valuesEqual(this.#color, next)) return
    this.#color = next
    this.notifyChange()
  }

  setIntensity(intensity: number) {
    const next = copyIntensity(intensity, "DirectionalLight intensity")
    if (this.#intensity === next) return
    this.#intensity = next
    this.notifyChange()
  }

  getDirectionToLight(): Vector3 {
    return [...this.#directionToLight]
  }

  getColor(): LightColor {
    return [...this.#color]
  }

  get intensity() {
    return this.#intensity
  }
}

export type WebGLLight = AmbientLight | DirectionalLight

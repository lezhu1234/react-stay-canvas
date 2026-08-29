import {
  lookAtMatrix4,
  multiplyMatrix4,
  orthographicMatrix4,
  type Matrix4,
  type Vector3,
} from "./math3D"

export type LightColor = readonly [number, number, number]
/** @internal Current opaque forward-pipeline capacity. */
export const webGL2DirectionalLightLimit = 4

export interface AmbientLightProps {
  readonly color?: LightColor
  readonly intensity?: number
}

export interface DirectionalLightProps extends AmbientLightProps {
  readonly directionToLight: Vector3
  readonly shadow?: DirectionalShadowProps
}

export interface DirectionalShadowProps {
  readonly target?: Vector3
  readonly up?: Vector3
  readonly distance?: number
  readonly width?: number
  readonly height?: number
  readonly near?: number
  readonly far?: number
  readonly mapSize?: number
  readonly bias?: number
  /** Fixed PCF tap radius in shadow-map texels. Zero collapses taps to one hardware-PCF footprint. */
  readonly filterRadius?: number
}

export interface DirectionalShadow {
  readonly target: Vector3
  readonly up: Vector3
  readonly distance: number
  readonly width: number
  readonly height: number
  readonly near: number
  readonly far: number
  readonly mapSize: number
  readonly bias: number
  readonly filterRadius: number
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

function copyVector(vector: Vector3, name: string): Vector3 {
  const copied: Vector3 = [vector[0], vector[1], vector[2]]
  copied.forEach((value, index) => finite(value, `${name}[${index}]`))
  return copied
}

function finite(value: number, name: string) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`)
  return value
}

function positive(value: number, name: string) {
  finite(value, name)
  if (value <= 0) throw new RangeError(`${name} must be greater than 0`)
  const copied = Math.fround(value)
  if (!Number.isFinite(copied) || copied <= 0) {
    throw new RangeError(`${name} exceeds Float32 range`)
  }
  return copied
}

function nonNegative(value: number, name: string) {
  finite(value, name)
  if (value < 0) throw new RangeError(`${name} must not be negative`)
  const copied = Math.fround(value)
  if (!Number.isFinite(copied)) throw new RangeError(`${name} exceeds Float32 range`)
  return copied
}

function defaultShadowUp(directionToLight: Vector3): Vector3 {
  return Math.abs(directionToLight[1]) > 0.999 ? [0, 0, 1] : [0, 1, 0]
}

function copyShadow(
  shadow: DirectionalShadowProps,
  directionToLight: Vector3
): DirectionalShadow {
  const target = copyVector(shadow.target ?? [0, 0, 0], "DirectionalLight shadow target")
  const up = copyVector(
    shadow.up ?? defaultShadowUp(directionToLight),
    "DirectionalLight shadow up"
  )
  const distance = positive(shadow.distance ?? 10, "DirectionalLight shadow distance")
  const width = positive(shadow.width ?? 10, "DirectionalLight shadow width")
  const height = positive(shadow.height ?? 10, "DirectionalLight shadow height")
  const near = positive(shadow.near ?? 0.1, "DirectionalLight shadow near")
  const far = positive(shadow.far ?? 30, "DirectionalLight shadow far")
  if (far <= near) {
    throw new RangeError("DirectionalLight shadow far must be greater than near")
  }
  const mapSize = shadow.mapSize ?? 1024
  if (!Number.isInteger(mapSize) || mapSize <= 0) {
    throw new RangeError("DirectionalLight shadow mapSize must be a positive integer")
  }
  const bias = shadow.bias ?? 0.001
  finite(bias, "DirectionalLight shadow bias")
  if (bias < 0 || bias > 1) {
    throw new RangeError("DirectionalLight shadow bias must be between 0 and 1")
  }
  const filterRadius = nonNegative(
    shadow.filterRadius ?? 1,
    "DirectionalLight shadow filterRadius",
  )
  const copied: DirectionalShadow = {
    target,
    up,
    distance,
    width,
    height,
    near,
    far,
    mapSize,
    bias: Math.fround(bias),
    filterRadius,
  }
  shadowViewProjection(directionToLight, copied)
  return copied
}

function shadowViewProjection(
  directionToLight: Vector3,
  shadow: DirectionalShadow
): Matrix4 {
  const position: Vector3 = [
    shadow.target[0] + directionToLight[0] * shadow.distance,
    shadow.target[1] + directionToLight[1] * shadow.distance,
    shadow.target[2] + directionToLight[2] * shadow.distance,
  ]
  return multiplyMatrix4(
    orthographicMatrix4(shadow.width, shadow.height, shadow.near, shadow.far),
    lookAtMatrix4(position, shadow.target, shadow.up)
  )
}

function shadowsEqual(first?: DirectionalShadow, second?: DirectionalShadow) {
  return first === second || Boolean(first && second
    && valuesEqual(first.target, second.target)
    && valuesEqual(first.up, second.up)
    && first.distance === second.distance
    && first.width === second.width
    && first.height === second.height
    && first.near === second.near
    && first.far === second.far
    && first.mapSize === second.mapSize
    && first.bias === second.bias
    && first.filterRadius === second.filterRadius)
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
  #shadow?: DirectionalShadow
  #shadowUsesDefaultUp = false

  constructor({ directionToLight, color, intensity, shadow }: DirectionalLightProps) {
    super()
    this.#directionToLight = copyDirection(directionToLight)
    this.#color = copyColor(color, "DirectionalLight color")
    this.#intensity = copyIntensity(intensity, "DirectionalLight intensity")
    this.#shadow = shadow ? copyShadow(shadow, this.#directionToLight) : undefined
    this.#shadowUsesDefaultUp = shadow !== undefined && shadow.up === undefined
  }

  setDirectionToLight(directionToLight: Vector3) {
    const next = copyDirection(directionToLight)
    if (valuesEqual(this.#directionToLight, next)) return
    const nextShadow = this.#shadowUsesDefaultUp && this.#shadow
      ? copyShadow({ ...this.#shadow, up: undefined }, next)
      : this.#shadow
    if (nextShadow) shadowViewProjection(next, nextShadow)
    this.#directionToLight = next
    this.#shadow = nextShadow
    this.notifyChange()
  }

  setShadow(shadow?: DirectionalShadowProps) {
    const next = shadow ? copyShadow(shadow, this.#directionToLight) : undefined
    const usesDefaultUp = shadow !== undefined && shadow.up === undefined
    if (shadowsEqual(this.#shadow, next)
        && this.#shadowUsesDefaultUp === usesDefaultUp) return
    this.#shadow = next
    this.#shadowUsesDefaultUp = usesDefaultUp
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

  getShadow(): DirectionalShadow | undefined {
    if (!this.#shadow) return undefined
    return {
      ...this.#shadow,
      target: [...this.#shadow.target],
      up: [...this.#shadow.up],
    }
  }

}

/** @internal Keeps derived shadow matrices out of the public Light state surface. */
export function directionalLightShadowViewProjection(
  light: DirectionalLight
): Matrix4 | undefined {
  const shadow = light.getShadow()
  return shadow
    ? shadowViewProjection(light.getDirectionToLight(), shadow)
    : undefined
}

export type WebGLLight = AmbientLight | DirectionalLight

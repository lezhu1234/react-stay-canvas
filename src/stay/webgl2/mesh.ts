import {
  copyMatrix4,
  identityMatrix4,
  normalMatrix3FromMatrix4,
  type Matrix4,
} from "./math3D"
import {
  copyMeshMaterial,
  GlassMaterial,
  ImageMaterial,
  LambertMaterial,
  meshMaterialUsesLighting,
  StandardMaterial,
  TransparentImageMaterial,
  UnlitMaterial,
  type MeshMaterial,
} from "./material"

export interface PlanarReflectionPlane {
  readonly point: readonly [number, number, number]
  readonly normal: readonly [number, number, number]
}

export interface PlanarReflectionProps {
  readonly localPlane: PlanarReflectionPlane
  readonly resolutionScale?: number
}

export interface PlanarReflection {
  readonly localPlane: PlanarReflectionPlane
  readonly resolutionScale: number
}

export interface MeshGeometryInput {
  readonly positions: ArrayLike<number>
  readonly normals?: ArrayLike<number>
  /** One top-origin uv pair per vertex. */
  readonly uvs?: ArrayLike<number>
  readonly indices: ArrayLike<number>
}

export interface MeshGeometrySnapshot {
  readonly positions: Float32Array
  readonly normals?: Float32Array
  readonly uvs?: Float32Array
  readonly indices: Uint16Array
  readonly revision: number
}

function finite(value: number, name: string) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`)
  return value
}

function copyVector3(
  value: readonly [number, number, number],
  name: string,
): readonly [number, number, number] {
  return [
    finite(value[0], `${name}[0]`),
    finite(value[1], `${name}[1]`),
    finite(value[2], `${name}[2]`),
  ]
}

function copyPlanarReflection(
  value: PlanarReflectionProps | PlanarReflection,
): PlanarReflection {
  const point = copyVector3(value.localPlane.point, "Planar reflection point")
  const inputNormal = copyVector3(value.localPlane.normal, "Planar reflection normal")
  const length = Math.hypot(...inputNormal)
  if (!Number.isFinite(length) || length === 0) {
    throw new RangeError("Planar reflection normal must have a finite non-zero length")
  }
  const normal: readonly [number, number, number] = [
    inputNormal[0] / length,
    inputNormal[1] / length,
    inputNormal[2] / length,
  ]
  const resolutionScale = finite(
    value.resolutionScale ?? 0.5,
    "Planar reflection resolutionScale",
  )
  if (resolutionScale <= 0 || resolutionScale > 1) {
    throw new RangeError("Planar reflection resolutionScale must be greater than 0 and at most 1")
  }
  return { localPlane: { point, normal }, resolutionScale }
}

function planarReflectionsEqual(
  first: PlanarReflection | undefined,
  second: PlanarReflection | undefined,
) {
  return first === second || Boolean(first && second
    && arrayValuesEqual(first.localPlane.point, second.localPlane.point)
    && arrayValuesEqual(first.localPlane.normal, second.localPlane.normal)
    && first.resolutionScale === second.resolutionScale)
}

function copyGeometry(input: MeshGeometryInput) {
  if (input.positions.length < 9 || input.positions.length % 3 !== 0) {
    throw new RangeError("Mesh positions must contain at least three xyz vertices")
  }
  if (input.indices.length < 3 || input.indices.length % 3 !== 0) {
    throw new RangeError("Mesh indices must contain complete triangles")
  }
  const positions = new Float32Array(input.positions.length)
  for (let index = 0; index < input.positions.length; index++) {
    positions[index] = finite(input.positions[index], `Mesh position ${index}`)
    if (!Number.isFinite(positions[index])) {
      throw new RangeError(`Mesh position ${index} exceeds Float32 range`)
    }
  }
  let normals: Float32Array | undefined
  if (input.normals !== undefined) {
    if (input.normals.length !== input.positions.length) {
      throw new RangeError("Mesh normals must contain one xyz normal per vertex")
    }
    normals = new Float32Array(input.normals.length)
    for (let index = 0; index < input.normals.length; index += 3) {
      const x = finite(input.normals[index], `Mesh normal ${index}`)
      const y = finite(input.normals[index + 1], `Mesh normal ${index + 1}`)
      const z = finite(input.normals[index + 2], `Mesh normal ${index + 2}`)
      const length = Math.hypot(x, y, z)
      if (!Number.isFinite(length) || length === 0) {
        throw new RangeError(`Mesh normal ${index / 3} must have a finite non-zero length`)
      }
      normals[index] = x
      normals[index + 1] = y
      normals[index + 2] = z
      if (![normals[index], normals[index + 1], normals[index + 2]].every(Number.isFinite)) {
        throw new RangeError(`Mesh normal ${index / 3} exceeds Float32 range`)
      }
      if (Math.hypot(normals[index], normals[index + 1], normals[index + 2]) === 0) {
        throw new RangeError(
          `Mesh normal ${index / 3} must remain non-zero in Float32 range`
        )
      }
    }
  }
  const vertexCount = positions.length / 3
  let uvs: Float32Array | undefined
  if (input.uvs !== undefined) {
    if (input.uvs.length !== vertexCount * 2) {
      throw new RangeError("Mesh uvs must contain one uv pair per vertex")
    }
    uvs = new Float32Array(input.uvs.length)
    for (let index = 0; index < input.uvs.length; index++) {
      uvs[index] = finite(input.uvs[index], `Mesh uv ${index}`)
      if (!Number.isFinite(uvs[index])) {
        throw new RangeError(`Mesh uv ${index} exceeds Float32 range`)
      }
    }
  }
  const indices = new Uint16Array(input.indices.length)
  for (let index = 0; index < input.indices.length; index++) {
    const value = input.indices[index]
    if (!Number.isInteger(value) || value < 0 || value >= vertexCount || value > 0xffff) {
      throw new RangeError(`Mesh index ${index} is outside its vertex range`)
    }
    indices[index] = value
  }
  return { positions, normals, uvs, indices, localBoundsCenter: geometryBoundsCenter(positions) }
}

function geometryBoundsCenter(positions: Float32Array) {
  let minimumX = positions[0]
  let minimumY = positions[1]
  let minimumZ = positions[2]
  let maximumX = positions[0]
  let maximumY = positions[1]
  let maximumZ = positions[2]
  for (let index = 3; index < positions.length; index += 3) {
    minimumX = Math.min(minimumX, positions[index])
    minimumY = Math.min(minimumY, positions[index + 1])
    minimumZ = Math.min(minimumZ, positions[index + 2])
    maximumX = Math.max(maximumX, positions[index])
    maximumY = Math.max(maximumY, positions[index + 1])
    maximumZ = Math.max(maximumZ, positions[index + 2])
  }
  return new Float32Array([
    (minimumX + maximumX) / 2,
    (minimumY + maximumY) / 2,
    (minimumZ + maximumZ) / 2,
  ])
}

function arrayValuesEqual(
  first: ArrayLike<number>,
  second: ArrayLike<number>
) {
  if (first.length !== second.length) return false
  for (let index = 0; index < first.length; index++) {
    if (first[index] !== second[index]) return false
  }
  return true
}

/** CPU-authoritative geometry and draw state for one WebGL2 mesh. */
export class Mesh {
  #positions: Float32Array
  #normals?: Float32Array
  #uvs?: Float32Array
  #indices: Uint16Array
  #localBoundsCenter: Float32Array
  #geometryRevision = 0
  #modelMatrix: Matrix4
  #material: MeshMaterial
  #castShadow: boolean
  #receiveShadow: boolean
  #planarReflection?: PlanarReflection
  readonly #changeListeners = new Set<() => void>()

  constructor({
    geometry,
    modelMatrix = identityMatrix4(),
    material,
    castShadow = false,
    receiveShadow = false,
    planarReflection,
  }: {
    geometry: MeshGeometryInput
    modelMatrix?: ArrayLike<number>
    material?: MeshMaterial
    castShadow?: boolean
    receiveShadow?: boolean
    planarReflection?: PlanarReflectionProps
  }) {
    const copied = copyGeometry(geometry)
    const copiedMaterial = copyMeshMaterial(material ?? new UnlitMaterial())
    const copiedModelMatrix = copyMatrix4(modelMatrix, "Mesh model matrix")
    const copiedPlanarReflection = planarReflection
      ? copyPlanarReflection(planarReflection)
      : undefined
    const copiedCastShadow = copyBoolean(castShadow, "Mesh castShadow")
    assertMeshState(
      copied,
      copiedModelMatrix,
      copiedMaterial,
      copiedPlanarReflection,
      copiedCastShadow,
    )
    this.#positions = copied.positions
    this.#normals = copied.normals
    this.#uvs = copied.uvs
    this.#indices = copied.indices
    this.#localBoundsCenter = copied.localBoundsCenter
    this.#modelMatrix = copiedModelMatrix
    this.#material = copiedMaterial
    this.#castShadow = copiedCastShadow
    this.#receiveShadow = copyBoolean(receiveShadow, "Mesh receiveShadow")
    this.#planarReflection = copiedPlanarReflection
  }

  setGeometry(geometry: MeshGeometryInput) {
    if (
      float32ValuesEqual(this.#positions, geometry.positions)
      && optionalFloat32ValuesEqual(this.#normals, geometry.normals)
      && optionalFloat32ValuesEqual(this.#uvs, geometry.uvs)
      && arrayValuesEqual(this.#indices, geometry.indices)
    ) return
    const copied = copyGeometry(geometry)
    assertMeshState(
      copied,
      this.#modelMatrix,
      this.#material,
      this.#planarReflection,
      this.#castShadow,
    )
    if (
      arrayValuesEqual(this.#positions, copied.positions)
      && optionalArrayValuesEqual(this.#normals, copied.normals)
      && optionalArrayValuesEqual(this.#uvs, copied.uvs)
      && arrayValuesEqual(this.#indices, copied.indices)
    ) return
    this.#positions = copied.positions
    this.#normals = copied.normals
    this.#uvs = copied.uvs
    this.#indices = copied.indices
    this.#localBoundsCenter = copied.localBoundsCenter
    this.#geometryRevision += 1
    this.#notifyChange()
  }

  setModelMatrix(modelMatrix: ArrayLike<number>) {
    if (float32ValuesEqual(this.#modelMatrix, modelMatrix)) return
    const copied = copyMatrix4(modelMatrix, "Mesh model matrix")
    assertMeshState(
      this.#geometryState(),
      copied,
      this.#material,
      this.#planarReflection,
      this.#castShadow,
    )
    if (arrayValuesEqual(this.#modelMatrix, copied)) return
    this.#modelMatrix = copied
    this.#notifyChange()
  }

  setMaterial(material: MeshMaterial) {
    if (!(material instanceof UnlitMaterial)
        && !(material instanceof ImageMaterial)
        && !(material instanceof TransparentImageMaterial)
        && !(material instanceof LambertMaterial)
        && !(material instanceof StandardMaterial)
        && !(material instanceof GlassMaterial)) {
      throw new TypeError(
        "Mesh material must be an UnlitMaterial, ImageMaterial, TransparentImageMaterial, LambertMaterial, StandardMaterial, or GlassMaterial"
      )
    }
    if (materialsEqual(this.#material, material)) return
    const copied = copyMeshMaterial(material)
    assertMeshState(
      this.#geometryState(),
      this.#modelMatrix,
      copied,
      this.#planarReflection,
      this.#castShadow,
    )
    if (materialsEqual(this.#material, copied)) return
    this.#material = copied
    this.#notifyChange()
  }

  setCastShadow(castShadow: boolean) {
    const next = copyBoolean(castShadow, "Mesh castShadow")
    if (this.#castShadow === next) return
    assertTransparentImageDoesNotCastShadow(this.#material, next)
    this.#castShadow = next
    this.#notifyChange()
  }

  setReceiveShadow(receiveShadow: boolean) {
    const next = copyBoolean(receiveShadow, "Mesh receiveShadow")
    if (this.#receiveShadow === next) return
    this.#receiveShadow = next
    this.#notifyChange()
  }

  setPlanarReflection(planarReflection?: PlanarReflectionProps) {
    const copied = planarReflection ? copyPlanarReflection(planarReflection) : undefined
    assertPlanarReflectionMaterial(this.#material, copied)
    if (planarReflectionsEqual(this.#planarReflection, copied)) return
    this.#planarReflection = copied
    this.#notifyChange()
  }

  get castShadow() {
    return this.#castShadow
  }

  get receiveShadow() {
    return this.#receiveShadow
  }

  getPlanarReflection(): PlanarReflection | undefined {
    const value = this.#planarReflection
    return value ? copyPlanarReflection(value) : undefined
  }

  get geometryRevision() {
    return this.#geometryRevision
  }

  /** @internal Copies CPU geometry only when a GPU upload is actually required. */
  copyGeometrySnapshot(): MeshGeometrySnapshot {
    return {
      positions: this.#positions.slice(),
      normals: this.#normals?.slice(),
      uvs: this.#uvs?.slice(),
      indices: this.#indices.slice(),
      revision: this.#geometryRevision,
    }
  }

  getModelMatrix(): Matrix4 {
    return this.#modelMatrix.slice()
  }

  getMaterial(): MeshMaterial {
    return copyMeshMaterial(this.#material)
  }

  /** @internal Returns the model-transformed local AABB center used for object sorting. */
  getWorldBoundsCenter(): readonly [number, number, number] {
    const [x, y, z] = this.#localBoundsCenter
    const matrix = this.#modelMatrix
    return [
      matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
      matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
      matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
    ]
  }

  /** @internal Lets the owning Child translate CPU mutations into layer dirtiness. */
  subscribeChanges(listener: () => void) {
    this.#changeListeners.add(listener)
    return () => this.#changeListeners.delete(listener)
  }

  #notifyChange() {
    this.#changeListeners.forEach((listener) => listener())
  }

  #geometryState() {
    return {
      positions: this.#positions,
      normals: this.#normals,
      uvs: this.#uvs,
      indices: this.#indices,
    }
  }
}

function copyBoolean(value: boolean, name: string) {
  if (typeof value !== "boolean") throw new TypeError(`${name} must be a boolean`)
  return value
}

function optionalArrayValuesEqual(
  first: ArrayLike<number> | undefined,
  second: ArrayLike<number> | undefined
) {
  if (!first || !second) return first === second
  return arrayValuesEqual(first, second)
}

function float32ValuesEqual(first: ArrayLike<number>, second: ArrayLike<number>) {
  if (first.length !== second.length) return false
  for (let index = 0; index < first.length; index++) {
    if (first[index] !== Math.fround(second[index])) return false
  }
  return true
}

function optionalFloat32ValuesEqual(
  first: ArrayLike<number> | undefined,
  second: ArrayLike<number> | undefined
) {
  if (!first || !second) return first === second
  return float32ValuesEqual(first, second)
}

function materialsEqual(first: MeshMaterial, second: MeshMaterial) {
  if (first.kind !== second.kind) return false
  if (first instanceof ImageMaterial && second instanceof ImageMaterial) {
    return first.texture === second.texture
  }
  if (first instanceof TransparentImageMaterial
      && second instanceof TransparentImageMaterial) {
    return first.texture === second.texture
  }
  if (first instanceof ImageMaterial || second instanceof ImageMaterial
      || first instanceof TransparentImageMaterial
      || second instanceof TransparentImageMaterial) return false
  if (!arrayValuesEqual(first.color, second.color)) return false
  if (first instanceof StandardMaterial && second instanceof StandardMaterial) {
    return first.metallic === second.metallic
      && first.roughness === second.roughness
  }
  if (first instanceof GlassMaterial && second instanceof GlassMaterial) {
    return arrayValuesEqual(first.attenuationColor, second.attenuationColor)
      && first.attenuationDistance === second.attenuationDistance
      && first.ior === second.ior
      && first.roughness === second.roughness
      && first.thickness === second.thickness
  }
  return true
}

function assertPlanarReflectionMaterial(
  material: MeshMaterial,
  planarReflection: PlanarReflection | undefined,
) {
  if (planarReflection && !(material instanceof StandardMaterial)) {
    throw new RangeError("Planar reflection requires a StandardMaterial receiver")
  }
}

function assertMeshState(
  geometry: { readonly normals?: ArrayLike<number>; readonly uvs?: ArrayLike<number> },
  modelMatrix: Matrix4,
  material: MeshMaterial,
  planarReflection: PlanarReflection | undefined,
  castShadow: boolean,
) {
  if ((material instanceof ImageMaterial || material instanceof TransparentImageMaterial)
      && !geometry.uvs) {
    throw new RangeError(`${material.constructor.name} Mesh geometry requires uvs`)
  }
  if (meshMaterialUsesLighting(material)) {
    if (!geometry.normals) throw new RangeError("Lit Mesh geometry requires normals")
    normalMatrix3FromMatrix4(modelMatrix)
  }
  assertPlanarReflectionMaterial(material, planarReflection)
  assertTransparentImageDoesNotCastShadow(material, castShadow)
}

function assertTransparentImageDoesNotCastShadow(
  material: MeshMaterial,
  castShadow: boolean,
) {
  if (castShadow && material instanceof TransparentImageMaterial) {
    throw new RangeError("TransparentImageMaterial Mesh cannot cast shadows")
  }
}

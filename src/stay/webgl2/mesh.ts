import {
  copyMatrix4,
  identityMatrix4,
  normalMatrix3FromMatrix4,
  type Matrix4,
} from "./math3D"
import {
  copyMeshMaterial,
  GlassMaterial,
  LambertMaterial,
  meshMaterialUsesLighting,
  UnlitMaterial,
  type MeshMaterial,
} from "./material"

export interface MeshGeometryInput {
  readonly positions: ArrayLike<number>
  readonly normals?: ArrayLike<number>
  readonly indices: ArrayLike<number>
}

export interface MeshGeometrySnapshot {
  readonly positions: Float32Array
  readonly normals?: Float32Array
  readonly indices: Uint16Array
  readonly revision: number
}

function finite(value: number, name: string) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`)
  return value
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
  const indices = new Uint16Array(input.indices.length)
  for (let index = 0; index < input.indices.length; index++) {
    const value = input.indices[index]
    if (!Number.isInteger(value) || value < 0 || value >= vertexCount || value > 0xffff) {
      throw new RangeError(`Mesh index ${index} is outside its vertex range`)
    }
    indices[index] = value
  }
  return { positions, normals, indices, localBoundsCenter: geometryBoundsCenter(positions) }
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
  #indices: Uint16Array
  #localBoundsCenter: Float32Array
  #geometryRevision = 0
  #modelMatrix: Matrix4
  #material: MeshMaterial
  #castShadow: boolean
  #receiveShadow: boolean
  readonly #changeListeners = new Set<() => void>()

  constructor({
    geometry,
    modelMatrix = identityMatrix4(),
    material,
    castShadow = false,
    receiveShadow = false,
  }: {
    geometry: MeshGeometryInput
    modelMatrix?: ArrayLike<number>
    material?: MeshMaterial
    castShadow?: boolean
    receiveShadow?: boolean
  }) {
    const copied = copyGeometry(geometry)
    const copiedMaterial = copyMeshMaterial(material ?? new UnlitMaterial())
    const copiedModelMatrix = copyMatrix4(modelMatrix, "Mesh model matrix")
    assertLitMeshState(copied, copiedModelMatrix, copiedMaterial)
    this.#positions = copied.positions
    this.#normals = copied.normals
    this.#indices = copied.indices
    this.#localBoundsCenter = copied.localBoundsCenter
    this.#modelMatrix = copiedModelMatrix
    this.#material = copiedMaterial
    this.#castShadow = copyBoolean(castShadow, "Mesh castShadow")
    this.#receiveShadow = copyBoolean(receiveShadow, "Mesh receiveShadow")
  }

  setGeometry(geometry: MeshGeometryInput) {
    if (
      float32ValuesEqual(this.#positions, geometry.positions)
      && optionalFloat32ValuesEqual(this.#normals, geometry.normals)
      && arrayValuesEqual(this.#indices, geometry.indices)
    ) return
    const copied = copyGeometry(geometry)
    assertLitMeshState(copied, this.#modelMatrix, this.#material)
    if (
      arrayValuesEqual(this.#positions, copied.positions)
      && optionalArrayValuesEqual(this.#normals, copied.normals)
      && arrayValuesEqual(this.#indices, copied.indices)
    ) return
    this.#positions = copied.positions
    this.#normals = copied.normals
    this.#indices = copied.indices
    this.#localBoundsCenter = copied.localBoundsCenter
    this.#geometryRevision += 1
    this.#notifyChange()
  }

  setModelMatrix(modelMatrix: ArrayLike<number>) {
    if (float32ValuesEqual(this.#modelMatrix, modelMatrix)) return
    const copied = copyMatrix4(modelMatrix, "Mesh model matrix")
    assertLitMeshState(this.#geometryState(), copied, this.#material)
    if (arrayValuesEqual(this.#modelMatrix, copied)) return
    this.#modelMatrix = copied
    this.#notifyChange()
  }

  setMaterial(material: MeshMaterial) {
    if (!(material instanceof UnlitMaterial)
        && !(material instanceof LambertMaterial)
        && !(material instanceof GlassMaterial)) {
      throw new TypeError(
        "Mesh material must be an UnlitMaterial, LambertMaterial, or GlassMaterial"
      )
    }
    if (materialsEqual(this.#material, material)) return
    const copied = copyMeshMaterial(material)
    assertLitMeshState(this.#geometryState(), this.#modelMatrix, copied)
    if (materialsEqual(this.#material, copied)) return
    this.#material = copied
    this.#notifyChange()
  }

  setCastShadow(castShadow: boolean) {
    const next = copyBoolean(castShadow, "Mesh castShadow")
    if (this.#castShadow === next) return
    this.#castShadow = next
    this.#notifyChange()
  }

  setReceiveShadow(receiveShadow: boolean) {
    const next = copyBoolean(receiveShadow, "Mesh receiveShadow")
    if (this.#receiveShadow === next) return
    this.#receiveShadow = next
    this.#notifyChange()
  }

  get castShadow() {
    return this.#castShadow
  }

  get receiveShadow() {
    return this.#receiveShadow
  }

  get geometryRevision() {
    return this.#geometryRevision
  }

  /** @internal Copies CPU geometry only when a GPU upload is actually required. */
  copyGeometrySnapshot(): MeshGeometrySnapshot {
    return {
      positions: this.#positions.slice(),
      normals: this.#normals?.slice(),
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
  if (first.kind !== second.kind || !arrayValuesEqual(first.color, second.color)) return false
  if (first instanceof GlassMaterial && second instanceof GlassMaterial) {
    return first.ior === second.ior && first.thickness === second.thickness
  }
  return true
}

function assertLitMeshState(
  geometry: { readonly normals?: ArrayLike<number> },
  modelMatrix: Matrix4,
  material: MeshMaterial
) {
  if (!meshMaterialUsesLighting(material)) return
  if (!geometry.normals) throw new RangeError("Lit Mesh geometry requires normals")
  normalMatrix3FromMatrix4(modelMatrix)
}

import {
  copyMatrix4,
  identityMatrix4,
  type Matrix4,
} from "./math3D"

export type MeshColor = readonly [number, number, number, number]

export interface MeshGeometryInput {
  readonly positions: ArrayLike<number>
  readonly indices: ArrayLike<number>
}

export interface MeshGeometrySnapshot {
  readonly positions: Float32Array
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
  const vertexCount = positions.length / 3
  const indices = new Uint16Array(input.indices.length)
  for (let index = 0; index < input.indices.length; index++) {
    const value = input.indices[index]
    if (!Number.isInteger(value) || value < 0 || value >= vertexCount || value > 0xffff) {
      throw new RangeError(`Mesh index ${index} is outside its vertex range`)
    }
    indices[index] = value
  }
  return { positions, indices }
}

function copyColor(color: MeshColor): MeshColor {
  const copied: [number, number, number, number] = [
    color[0], color[1], color[2], color[3],
  ]
  copied.forEach((value, index) => {
    finite(value, `Mesh color ${index}`)
    if (value < 0 || value > 1) throw new RangeError("Mesh color must be between 0 and 1")
  })
  return copied
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
  #indices: Uint16Array
  #geometryRevision = 0
  #modelMatrix: Matrix4
  #color: MeshColor
  readonly #changeListeners = new Set<() => void>()

  constructor({
    geometry,
    modelMatrix = identityMatrix4(),
    color = [1, 1, 1, 1],
  }: {
    geometry: MeshGeometryInput
    modelMatrix?: ArrayLike<number>
    color?: MeshColor
  }) {
    const copied = copyGeometry(geometry)
    this.#positions = copied.positions
    this.#indices = copied.indices
    this.#modelMatrix = copyMatrix4(modelMatrix, "Mesh model matrix")
    this.#color = copyColor(color)
  }

  setGeometry(geometry: MeshGeometryInput) {
    const copied = copyGeometry(geometry)
    if (
      arrayValuesEqual(this.#positions, copied.positions)
      && arrayValuesEqual(this.#indices, copied.indices)
    ) return
    this.#positions = copied.positions
    this.#indices = copied.indices
    this.#geometryRevision += 1
    this.#notifyChange()
  }

  setModelMatrix(modelMatrix: ArrayLike<number>) {
    const copied = copyMatrix4(modelMatrix, "Mesh model matrix")
    if (arrayValuesEqual(this.#modelMatrix, copied)) return
    this.#modelMatrix = copied
    this.#notifyChange()
  }

  setColor(color: MeshColor) {
    const copied = copyColor(color)
    if (arrayValuesEqual(this.#color, copied)) return
    this.#color = copied
    this.#notifyChange()
  }

  get geometryRevision() {
    return this.#geometryRevision
  }

  /** @internal Copies CPU geometry only when a GPU upload is actually required. */
  copyGeometrySnapshot(): MeshGeometrySnapshot {
    return {
      positions: this.#positions.slice(),
      indices: this.#indices.slice(),
      revision: this.#geometryRevision,
    }
  }

  getModelMatrix(): Matrix4 {
    return this.#modelMatrix.slice()
  }

  getColor(): MeshColor {
    return [...this.#color]
  }

  /** @internal Lets the owning Child translate CPU mutations into layer dirtiness. */
  subscribeChanges(listener: () => void) {
    this.#changeListeners.add(listener)
    return () => this.#changeListeners.delete(listener)
  }

  #notifyChange() {
    this.#changeListeners.forEach((listener) => listener())
  }
}

export type Vector3 = readonly [number, number, number]
export type Matrix4 = Float32Array

function finite(value: number, name: string) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`)
  return value
}

export function copyMatrix4(matrix: ArrayLike<number>, name = "matrix"): Matrix4 {
  if (matrix.length !== 16) throw new RangeError(`${name} must contain 16 values`)
  const copied = new Float32Array(16)
  for (let index = 0; index < matrix.length; index++) {
    copied[index] = finite(matrix[index], `${name}[${index}]`)
    if (!Number.isFinite(copied[index])) {
      throw new RangeError(`${name}[${index}] exceeds Float32 range`)
    }
  }
  return copied
}

export function identityMatrix4(): Matrix4 {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ])
}

export function translationMatrix4(x: number, y: number, z: number): Matrix4 {
  const matrix = identityMatrix4()
  matrix[12] = finite(x, "translation x")
  matrix[13] = finite(y, "translation y")
  matrix[14] = finite(z, "translation z")
  if (![matrix[12], matrix[13], matrix[14]].every(Number.isFinite)) {
    throw new RangeError("translation exceeds Float32 range")
  }
  return matrix
}

export function multiplyMatrix4(first: Matrix4, second: Matrix4): Matrix4 {
  const result = new Float32Array(16)
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let value = 0
      for (let index = 0; index < 4; index++) {
        value += first[index * 4 + row] * second[column * 4 + index]
      }
      finite(value, `matrix product ${column},${row}`)
      result[column * 4 + row] = value
      if (!Number.isFinite(result[column * 4 + row])) {
        throw new RangeError(`matrix product ${column},${row} exceeds Float32 range`)
      }
    }
  }
  return result
}

export function perspectiveMatrix4(
  verticalFieldOfView: number,
  aspect: number,
  near: number,
  far: number
): Matrix4 {
  finite(verticalFieldOfView, "camera vertical field of view")
  finite(aspect, "camera aspect")
  finite(near, "camera near plane")
  finite(far, "camera far plane")
  if (verticalFieldOfView <= 0 || verticalFieldOfView >= Math.PI) {
    throw new RangeError("camera vertical field of view must be between 0 and PI")
  }
  if (aspect <= 0) throw new RangeError("camera aspect must be greater than 0")
  if (near <= 0 || far <= near) {
    throw new RangeError("camera far plane must be greater than its positive near plane")
  }

  const focalLength = 1 / Math.tan(verticalFieldOfView / 2)
  const depth = near - far
  return copyMatrix4([
    focalLength / aspect, 0, 0, 0,
    0, focalLength, 0, 0,
    0, 0, (far + near) / depth, -1,
    0, 0, 2 * far * near / depth, 0,
  ], "camera perspective matrix")
}

function subtract(first: Vector3, second: Vector3): Vector3 {
  return [first[0] - second[0], first[1] - second[1], first[2] - second[2]]
}

function dot(first: Vector3, second: Vector3) {
  return first[0] * second[0] + first[1] * second[1] + first[2] * second[2]
}

function cross(first: Vector3, second: Vector3): Vector3 {
  return [
    first[1] * second[2] - first[2] * second[1],
    first[2] * second[0] - first[0] * second[2],
    first[0] * second[1] - first[1] * second[0],
  ]
}

function normalize(vector: Vector3, name: string): Vector3 {
  const length = Math.hypot(...vector)
  if (!Number.isFinite(length) || length === 0) {
    throw new RangeError(`${name} must have a finite non-zero length`)
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length]
}

export function lookAtMatrix4(
  position: Vector3,
  target: Vector3,
  up: Vector3
): Matrix4 {
  const backward = normalize(subtract(position, target), "camera view direction")
  const right = normalize(cross(up, backward), "camera up direction")
  const correctedUp = cross(backward, right)
  return copyMatrix4([
    right[0], correctedUp[0], backward[0], 0,
    right[1], correctedUp[1], backward[1], 0,
    right[2], correctedUp[2], backward[2], 0,
    -dot(right, position),
    -dot(correctedUp, position),
    -dot(backward, position),
    1,
  ], "camera view matrix")
}

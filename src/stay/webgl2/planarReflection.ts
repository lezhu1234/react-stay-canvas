import {
  lookAtMatrix4,
  multiplyMatrix4,
  normalMatrix3FromMatrix4,
  type Matrix4,
  type Vector3,
} from "./math3D"
import { Mesh, type PlanarReflection } from "./mesh"
import { PerspectiveCamera } from "./perspectiveCamera"

export interface WorldReflectionPlane {
  readonly point: Vector3
  readonly normal: Vector3
  readonly cameraSide: number
}

export interface ReflectionCameraFrame {
  readonly position: Vector3
  readonly view: Matrix4
  readonly projection: Matrix4
  readonly viewProjection: Matrix4
}

function normalize(vector: Vector3, name: string): Vector3 {
  const length = Math.hypot(...vector)
  if (!Number.isFinite(length) || length === 0) {
    throw new RangeError(`${name} must have a finite non-zero length`)
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length]
}

function dot(first: Vector3, second: Vector3) {
  return first[0] * second[0] + first[1] * second[1] + first[2] * second[2]
}

function subtract(first: Vector3, second: Vector3): Vector3 {
  return [first[0] - second[0], first[1] - second[1], first[2] - second[2]]
}

function add(first: Vector3, second: Vector3): Vector3 {
  return [first[0] + second[0], first[1] + second[1], first[2] + second[2]]
}

function scale(vector: Vector3, scalar: number): Vector3 {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar]
}

function transformPoint(matrix: Matrix4, point: Vector3): Vector3 {
  return [
    matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12],
    matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13],
    matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14],
  ]
}

function transformNormal(matrix: Matrix4, normal: Vector3): Vector3 {
  const normalMatrix = normalMatrix3FromMatrix4(matrix)
  return normalize([
    normalMatrix[0] * normal[0] + normalMatrix[3] * normal[1] + normalMatrix[6] * normal[2],
    normalMatrix[1] * normal[0] + normalMatrix[4] * normal[1] + normalMatrix[7] * normal[2],
    normalMatrix[2] * normal[0] + normalMatrix[5] * normal[1] + normalMatrix[8] * normal[2],
  ], "Planar reflection world normal")
}

function reflectVector(vector: Vector3, normal: Vector3): Vector3 {
  return subtract(vector, scale(normal, 2 * dot(vector, normal)))
}

function reflectPoint(point: Vector3, plane: WorldReflectionPlane): Vector3 {
  return subtract(point, scale(
    plane.normal,
    2 * dot(subtract(point, plane.point), plane.normal),
  ))
}

export function findPlanarReflectionReceiver(meshes: readonly Mesh[]) {
  const receivers = meshes.filter((mesh) => mesh.getPlanarReflection() !== undefined)
  if (receivers.length > 1) {
    throw new RangeError("WebGL2 rendering supports at most one planar reflection receiver per layer")
  }
  return receivers[0]
}

export function worldReflectionPlane(
  mesh: Mesh,
  reflection: PlanarReflection,
  cameraPosition: Vector3,
): WorldReflectionPlane {
  const model = mesh.getModelMatrix()
  const point = transformPoint(model, reflection.localPlane.point)
  const normal = transformNormal(model, reflection.localPlane.normal)
  const signedCameraDistance = dot(subtract(cameraPosition, point), normal)
  if (Math.abs(signedCameraDistance) < 1e-6) {
    throw new RangeError("Planar reflection camera must not lie on the reflection plane")
  }
  return { point, normal, cameraSide: Math.sign(signedCameraDistance) }
}

export function reflectionCameraFrame(
  camera: PerspectiveCamera,
  plane: WorldReflectionPlane,
  aspect: number,
): ReflectionCameraFrame {
  const sourceView = camera.getViewMatrix()
  const sourcePosition = camera.getPosition()
  const sourceForward: Vector3 = [-sourceView[2], -sourceView[6], -sourceView[10]]
  const sourceUp: Vector3 = [sourceView[1], sourceView[5], sourceView[9]]
  const position = reflectPoint(sourcePosition, plane)
  const forward = normalize(reflectVector(sourceForward, plane.normal), "Reflected camera direction")
  const up = normalize(reflectVector(sourceUp, plane.normal), "Reflected camera up")
  const view = lookAtMatrix4(position, add(position, forward), up)
  const projection = camera.getProjectionMatrix(aspect)
  return {
    position,
    view,
    projection,
    viewProjection: multiplyMatrix4(projection, view),
  }
}

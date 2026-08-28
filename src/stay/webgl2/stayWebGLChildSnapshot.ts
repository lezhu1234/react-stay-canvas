import type { Matrix4 } from "./math3D"
import { Mesh, type MeshColor } from "./mesh"
import { StayWebGLChild } from "./stayWebGLChild"

export interface WebGLMeshSnapshot {
  readonly positions: Float32Array
  readonly indices: Uint16Array
  readonly modelMatrix: Matrix4
  readonly color: MeshColor
}

export interface StayWebGLChildSnapshot {
  readonly id: string
  readonly className: string
  readonly layer: number
  readonly meshes: readonly WebGLMeshSnapshot[]
}

export interface StayWebGLSceneChildFragment {
  readonly sourceId: string
  readonly className: string
  readonly layer: number
  readonly meshes: readonly WebGLMeshSnapshot[]
}

function captureMesh(mesh: Mesh): WebGLMeshSnapshot {
  const geometry = mesh.copyGeometrySnapshot()
  return {
    positions: geometry.positions,
    indices: geometry.indices,
    modelMatrix: mesh.getModelMatrix(),
    color: mesh.getColor(),
  }
}

function materializeMesh(snapshot: WebGLMeshSnapshot) {
  return new Mesh({
    geometry: {
      positions: snapshot.positions,
      indices: snapshot.indices,
    },
    modelMatrix: snapshot.modelMatrix,
    color: snapshot.color,
  })
}

export function captureStayWebGLChildSnapshot(
  child: StayWebGLChild
): StayWebGLChildSnapshot {
  return {
    id: child.id,
    className: child.className,
    layer: child.layer,
    meshes: child.meshes.map(captureMesh),
  }
}

export function restoreStayWebGLChildSnapshot(
  snapshot: StayWebGLChildSnapshot,
  onChange?: (childId: string) => void
) {
  return new StayWebGLChild({
    id: snapshot.id,
    className: snapshot.className,
    layer: snapshot.layer,
    meshes: snapshot.meshes.map(materializeMesh),
    onChange,
  })
}

export function captureStayWebGLSceneChild(
  child: StayWebGLChild
): StayWebGLSceneChildFragment {
  const snapshot = captureStayWebGLChildSnapshot(child)
  return {
    sourceId: snapshot.id,
    className: snapshot.className,
    layer: snapshot.layer,
    meshes: snapshot.meshes,
  }
}

export function materializeStayWebGLSceneChild(
  fragment: StayWebGLSceneChildFragment,
  onChange?: (childId: string) => void
) {
  return new StayWebGLChild({
    className: fragment.className,
    layer: fragment.layer,
    meshes: fragment.meshes.map(materializeMesh),
    onChange,
  })
}

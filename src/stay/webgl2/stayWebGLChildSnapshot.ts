import type { Matrix4 } from "./math3D"
import { Mesh } from "./mesh"
import {
  captureMeshMaterial,
  materializeMeshMaterial,
  type MeshMaterialSnapshot,
} from "./material"
import { StayWebGLChild } from "./stayWebGLChild"

export interface WebGLMeshSnapshot {
  readonly positions: Float32Array
  readonly normals?: Float32Array
  readonly uvs?: Float32Array
  readonly indices: Uint16Array
  readonly modelMatrix: Matrix4
  readonly material: MeshMaterialSnapshot
  readonly castShadow: boolean
  readonly receiveShadow: boolean
}

export interface StayWebGLChildSnapshot {
  readonly kind: "webgl2"
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

export interface StayWebGLSceneFragment {
  readonly children: readonly StayWebGLSceneChildFragment[]
}

function captureMesh(mesh: Mesh): WebGLMeshSnapshot {
  const geometry = mesh.copyGeometrySnapshot()
  return {
    positions: geometry.positions,
    normals: geometry.normals,
    uvs: geometry.uvs,
    indices: geometry.indices,
    modelMatrix: mesh.getModelMatrix(),
    material: captureMeshMaterial(mesh.getMaterial()),
    castShadow: mesh.castShadow,
    receiveShadow: mesh.receiveShadow,
  }
}

function materializeMesh(snapshot: WebGLMeshSnapshot) {
  return new Mesh({
    geometry: {
      positions: snapshot.positions,
      normals: snapshot.normals,
      uvs: snapshot.uvs,
      indices: snapshot.indices,
    },
    modelMatrix: snapshot.modelMatrix,
    material: materializeMeshMaterial(snapshot.material),
    castShadow: snapshot.castShadow,
    receiveShadow: snapshot.receiveShadow,
  })
}

export function materializeWebGLSnapshotMeshes(
  snapshots: readonly WebGLMeshSnapshot[]
) {
  return snapshots.map(materializeMesh)
}

export function captureStayWebGLChildSnapshot(
  child: StayWebGLChild
): StayWebGLChildSnapshot {
  return {
    kind: "webgl2",
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
  const child = new StayWebGLChild({
    id: snapshot.id,
    className: snapshot.className,
    layer: snapshot.layer,
    meshes: materializeWebGLSnapshotMeshes(snapshot.meshes),
  })
  if (onChange) child.installRuntime({ onChange })
  return child
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

export function captureStayWebGLScene(
  children: readonly StayWebGLChild[]
): StayWebGLSceneFragment {
  return { children: children.map(captureStayWebGLSceneChild) }
}

export function materializeStayWebGLSceneChild(
  fragment: StayWebGLSceneChildFragment,
  onChange?: (childId: string) => void
) {
  const child = new StayWebGLChild({
    className: fragment.className,
    layer: fragment.layer,
    meshes: materializeWebGLSnapshotMeshes(fragment.meshes),
  })
  if (onChange) child.installRuntime({ onChange })
  return child
}

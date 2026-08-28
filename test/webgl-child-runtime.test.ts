import { describe, expect, it, vi } from "vitest"

import { ChildrenStore } from "../src/stay/children/childrenStore"
import { captureChildHistory } from "../src/stay/historySnapshot"
import { identityMatrix4, translationMatrix4 } from "../src/stay/webgl2/math3D"
import { Mesh } from "../src/stay/webgl2/mesh"
import { StayWebGLChild } from "../src/stay/webgl2/stayWebGLChild"
import {
  stayWebGLChildHistory,
  stayWebGLChildLayers,
} from "../src/stay/webgl2/stayWebGLChildRuntime"
import {
  captureStayWebGLChildSnapshot,
  captureStayWebGLSceneChild,
  materializeStayWebGLSceneChild,
  restoreStayWebGLChildSnapshot,
} from "../src/stay/webgl2/stayWebGLChildSnapshot"

const triangle = (z = 0) => ({
  positions: [
    -0.8, -0.8, z,
    0.8, -0.8, z,
    0, 0.8, z,
  ],
  indices: [0, 1, 2],
})

const mesh = (z = 0) => new Mesh({
  geometry: triangle(z),
  color: [0.1, 0.2, 0.3, 1],
})

describe("internal Stay WebGL Child runtime", () => {
  it("uses the shared selector store with WebGL Child identity", () => {
    const store = new ChildrenStore<StayWebGLChild>()
    const first = new StayWebGLChild({
      id: "mesh-a",
      className: "plane:active",
      layer: 0,
      meshes: [mesh()],
    })
    const second = new StayWebGLChild({
      id: "mesh-b",
      className: "plane",
      layer: 1,
      meshes: [mesh(-0.2)],
    })
    store.add(first)
    store.add(second)

    expect(store.bySelector(".plane")).toEqual([first, second])
    expect(store.bySelector("#mesh-b")).toEqual([second])
    expect(store.bySelector((child) => child.layer === 0)).toEqual([first])
    first.destroy()
    second.destroy()
  })

  it("maps Mesh mutation and layer moves onto backend-owned dirtiness", () => {
    const firstMesh = mesh()
    const secondMesh = mesh(-0.3)
    const onChange = vi.fn()
    const child = new StayWebGLChild({
      id: "mesh-child",
      className: "plane",
      layer: 1,
      meshes: [firstMesh],
    })
    child.installRuntime({ onChange })

    expect([...stayWebGLChildLayers.dirtyLayers(child)]).toEqual([1])
    stayWebGLChildLayers.drawn(child, 1)
    firstMesh.setModelMatrix(translationMatrix4(0.2, 0, 0))
    expect([...stayWebGLChildLayers.dirtyLayers(child)]).toEqual([1])
    expect(onChange).toHaveBeenLastCalledWith("mesh-child")

    stayWebGLChildLayers.drawn(child, 1)
    child.setClassName("plane:selected")
    expect([...stayWebGLChildLayers.dirtyLayers(child)]).toEqual([])
    child.setLayer(3)
    expect([...stayWebGLChildLayers.dirtyLayers(child)]).toEqual([1, 3])
    expect([...stayWebGLChildLayers.occupiedLayers(child)]).toEqual([3])

    stayWebGLChildLayers.drawn(child, 1)
    stayWebGLChildLayers.drawn(child, 3)
    child.setMeshes([secondMesh])
    firstMesh.setColor([1, 0, 0, 1])
    expect([...stayWebGLChildLayers.dirtyLayers(child)]).toEqual([3])
    onChange.mockClear()
    child.destroy()
    secondMesh.setColor([0, 1, 0, 1])
    expect(onChange).not.toHaveBeenCalled()
  })

  it("captures and restores owned History snapshots", () => {
    const originalMesh = mesh()
    const child = new StayWebGLChild({
      id: "history-mesh",
      className: "plane",
      layer: 2,
      meshes: [originalMesh],
    })
    const captured = captureChildHistory([child], stayWebGLChildHistory)
    const snapshot = captured.get(child.id)!

    originalMesh.setGeometry(triangle(-0.5))
    originalMesh.setModelMatrix(translationMatrix4(3, 4, 5))
    originalMesh.setColor([1, 0, 0, 1])
    child.setLayer(4)

    expect(snapshot.layer).toBe(2)
    expect(snapshot.meshes[0].positions).toEqual(new Float32Array(triangle().positions))
    expect(snapshot.meshes[0].modelMatrix).toEqual(identityMatrix4())
    expect(snapshot.meshes[0].color).toEqual([0.1, 0.2, 0.3, 1])

    const onChange = vi.fn()
    const restored = restoreStayWebGLChildSnapshot(snapshot, onChange)
    expect(captureStayWebGLChildSnapshot(restored)).toEqual(snapshot)
    restored.meshes[0].setColor([0, 1, 0, 1])
    expect(onChange).toHaveBeenCalledWith("history-mesh")
    child.destroy()
    restored.destroy()
  })

  it("materializes scene transfer as a new Child without sharing Mesh state", () => {
    const original = new StayWebGLChild({
      id: "source-child",
      className: "transferred-plane",
      layer: 2,
      meshes: [mesh()],
    })
    const fragment = captureStayWebGLSceneChild(original)
    const imported = materializeStayWebGLSceneChild(fragment)

    expect(fragment.sourceId).toBe(original.id)
    expect(imported.id).not.toBe(original.id)
    expect(imported.className).toBe(original.className)
    expect(imported.layer).toBe(original.layer)
    expect(captureStayWebGLChildSnapshot(imported).meshes)
      .toEqual(captureStayWebGLChildSnapshot(original).meshes)

    imported.meshes[0].setColor([0, 1, 0, 1])
    expect(original.meshes[0].getColor()).toEqual([0.1, 0.2, 0.3, 1])
    original.destroy()
    imported.destroy()
  })

  it("rejects invalid ownership inputs before subscribing to Mesh state", () => {
    const shared = mesh()
    expect(() => new StayWebGLChild({
      className: "invalid-layer",
      layer: -1,
      meshes: [shared],
    })).toThrow("non-negative integer")
    expect(() => new StayWebGLChild({
      className: "duplicate-mesh",
      layer: 0,
      meshes: [shared, shared],
    })).toThrow("duplicate instances")
  })
})

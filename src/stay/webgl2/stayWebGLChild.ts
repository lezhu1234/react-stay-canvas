import { uuid4 } from "../../utils/identifiers"
import type { ChildIdentity } from "../children/runtimeContracts"
import { Mesh } from "./mesh"

export interface StayWebGLChildProps {
  readonly id?: string
  readonly className: string
  readonly layer: number
  readonly meshes?: readonly Mesh[]
  readonly onChange?: (childId: string) => void
}

function layerIndex(value: number) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError("WebGL Child layer must be a non-negative integer")
  }
  return value
}

function ownMeshList(meshes: readonly Mesh[]) {
  const copied = [...meshes]
  if (new Set(copied).size !== copied.length) {
    throw new RangeError("WebGL Child meshes must not contain duplicate instances")
  }
  return copied
}

/**
 * @internal CPU scene owner for a set of Meshes rendered on one WebGL2 layer.
 * Mesh mutations invalidate the layer through the shared Child runtime seam;
 * browser GPU handles remain owned exclusively by WebGL2SceneRuntime.
 */
export class StayWebGLChild implements ChildIdentity {
  readonly id: string
  className: string
  #layer: number
  #meshes: Mesh[] = []
  readonly #dirtyLayers = new Set<number>()
  readonly #unsubscribeMeshChanges = new Map<Mesh, () => void>()
  readonly #onChange?: (childId: string) => void

  constructor({
    id = uuid4(),
    className,
    layer,
    meshes = [],
    onChange,
  }: StayWebGLChildProps) {
    this.id = id
    this.className = className
    this.#layer = layerIndex(layer)
    this.#onChange = onChange
    this.#replaceMeshes(ownMeshList(meshes))
    this.#dirtyLayers.add(this.#layer)
  }

  get layer() {
    return this.#layer
  }

  get meshes(): readonly Mesh[] {
    return [...this.#meshes]
  }

  setClassName(className: string) {
    if (className === this.className) return
    this.className = className
    this.#changed(false)
  }

  setLayer(layer: number) {
    const nextLayer = layerIndex(layer)
    if (nextLayer === this.#layer) return
    const previousLayer = this.#layer
    this.#layer = nextLayer
    this.#dirtyLayers.add(previousLayer)
    this.#changed()
  }

  setMeshes(meshes: readonly Mesh[]) {
    const nextMeshes = ownMeshList(meshes)
    if (nextMeshes.length === this.#meshes.length &&
        nextMeshes.every((mesh, index) => mesh === this.#meshes[index])) {
      return
    }
    this.#replaceMeshes(nextMeshes)
    this.#changed()
  }

  getUpdatedLayers(): ReadonlySet<number> {
    return this.#dirtyLayers
  }

  getLayers(): ReadonlySet<number> {
    return new Set([this.#layer])
  }

  layerDrawn(layer: number) {
    this.#dirtyLayers.delete(layer)
  }

  destroy() {
    this.#unsubscribeMeshChanges.forEach((unsubscribe) => unsubscribe())
    this.#unsubscribeMeshChanges.clear()
    this.#meshes = []
  }

  #replaceMeshes(meshes: Mesh[]) {
    this.#unsubscribeMeshChanges.forEach((unsubscribe) => unsubscribe())
    this.#unsubscribeMeshChanges.clear()
    this.#meshes = meshes
    meshes.forEach((mesh) => {
      this.#unsubscribeMeshChanges.set(mesh, mesh.subscribeChanges(() => this.#changed()))
    })
  }

  #changed(invalidateLayer = true) {
    if (invalidateLayer) this.#dirtyLayers.add(this.#layer)
    this.#onChange?.(this.id)
  }
}

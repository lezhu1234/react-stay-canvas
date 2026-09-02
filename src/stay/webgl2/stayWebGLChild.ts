import { uuid4 } from "../../utils/identifiers"
import type { ChildIdentity } from "../children/runtimeContracts"
import { Mesh } from "./mesh"

export interface StayWebGLChildProps {
  readonly id?: string
  readonly className: string
  readonly layer: number
  readonly meshes?: readonly Mesh[]
}

/** @internal Hooks installed when a Child joins an owning Stay runtime. */
export interface StayWebGLChildRuntime {
  readonly onChange?: (childId: string) => void
  readonly validateLayer?: (layer: number) => void
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
 * CPU scene owner for a set of Meshes rendered on one WebGL2 layer.
 * Mesh mutations invalidate the layer through the shared Child runtime seam;
 * browser GPU handles remain owned exclusively by WebGL2SceneRuntime.
 */
export class StayWebGLChild implements ChildIdentity {
  readonly id: string
  #className: string
  #layer: number
  #meshes: Mesh[] = []
  readonly #dirtyLayers = new Set<number>()
  readonly #unsubscribeMeshChanges = new Map<Mesh, () => void>()
  #onChange?: (childId: string) => void
  #validateLayer?: (layer: number) => void
  #runtimeInstalled = false

  constructor({
    id = uuid4(),
    className,
    layer,
    meshes = [],
  }: StayWebGLChildProps) {
    this.id = id
    this.#className = className
    this.#layer = layerIndex(layer)
    this.#replaceMeshes(ownMeshList(meshes))
    this.#dirtyLayers.add(this.#layer)
  }

  /** @internal Connects this public CPU object to one owning Stay runtime. */
  installRuntime({ onChange, validateLayer }: StayWebGLChildRuntime) {
    if (this.#runtimeInstalled) throw new Error("WebGL Child already belongs to a Stay runtime")
    validateLayer?.(this.#layer)
    this.#runtimeInstalled = true
    this.#onChange = onChange
    this.#validateLayer = validateLayer
  }

  get layer() {
    return this.#layer
  }

  get className() {
    return this.#className
  }

  get meshes(): readonly Mesh[] {
    return [...this.#meshes]
  }

  setClassName(className: string) {
    if (className === this.#className) return
    this.#className = className
    this.#changed(false)
  }

  setLayer(layer: number) {
    const nextLayer = layerIndex(layer)
    if (nextLayer === this.#layer) return
    this.#validateLayer?.(nextLayer)
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

  /** @internal Shared dirty-layer scheduler input. */
  getUpdatedLayers(): ReadonlySet<number> {
    return this.#dirtyLayers
  }

  /** @internal Shared dirty-layer scheduler occupancy. */
  getLayers(): ReadonlySet<number> {
    return new Set([this.#layer])
  }

  /** @internal Shared dirty-layer scheduler acknowledgement. */
  layerDrawn(layer: number) {
    this.#dirtyLayers.delete(layer)
  }

  /** @internal Released by the owning Stay runtime. */
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

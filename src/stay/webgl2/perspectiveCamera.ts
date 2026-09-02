import {
  lookAtMatrix4,
  multiplyMatrix4,
  perspectiveMatrix4,
  type Matrix4,
  type Vector3,
} from "./math3D"

function copyVector(vector: Vector3, name: string): Vector3 {
  const copied: [number, number, number] = [vector[0], vector[1], vector[2]]
  copied.forEach((value, index) => {
    if (!Number.isFinite(value)) throw new TypeError(`${name}[${index}] must be finite`)
  })
  return copied
}

/** CPU-authoritative perspective camera for a WebGL2 layer. */
export class PerspectiveCamera {
  #position: Vector3
  #target: Vector3
  #up: Vector3
  #verticalFieldOfView: number
  #near: number
  #far: number
  readonly #changeListeners = new Set<() => void>()

  constructor({
    position,
    target,
    up = [0, 1, 0],
    verticalFieldOfView = Math.PI / 3,
    near = 0.1,
    far = 1000,
  }: {
    position: Vector3
    target: Vector3
    up?: Vector3
    verticalFieldOfView?: number
    near?: number
    far?: number
  }) {
    this.#position = copyVector(position, "camera position")
    this.#target = copyVector(target, "camera target")
    this.#up = copyVector(up, "camera up")
    this.#verticalFieldOfView = verticalFieldOfView
    this.#near = near
    this.#far = far
    this.getViewProjection(1)
  }

  setPose(position: Vector3, target: Vector3, up: Vector3 = this.#up) {
    const nextPosition = copyVector(position, "camera position")
    const nextTarget = copyVector(target, "camera target")
    const nextUp = copyVector(up, "camera up")
    lookAtMatrix4(nextPosition, nextTarget, nextUp)
    this.#position = nextPosition
    this.#target = nextTarget
    this.#up = nextUp
    this.#notifyChange()
  }

  setProjection(verticalFieldOfView: number, near: number, far: number) {
    perspectiveMatrix4(verticalFieldOfView, 1, near, far)
    this.#verticalFieldOfView = verticalFieldOfView
    this.#near = near
    this.#far = far
    this.#notifyChange()
  }

  getViewProjection(aspect: number): Matrix4 {
    const projection = this.getProjectionMatrix(aspect)
    const view = this.getViewMatrix()
    return multiplyMatrix4(projection, view)
  }

  /** @internal Provides the projection matrix to view-dependent materials. */
  getProjectionMatrix(aspect: number): Matrix4 {
    return perspectiveMatrix4(
      this.#verticalFieldOfView,
      aspect,
      this.#near,
      this.#far
    )
  }

  /** @internal Provides one view matrix for transparent sorting during a frame. */
  getViewMatrix(): Matrix4 {
    return lookAtMatrix4(this.#position, this.#target, this.#up)
  }

  /** @internal Provides the camera world position to view-dependent materials. */
  getPosition(): Vector3 {
    return [...this.#position]
  }

  /** @internal Lets the owning layer translate camera mutations into dirtiness. */
  subscribeChanges(listener: () => void) {
    this.#changeListeners.add(listener)
    return () => this.#changeListeners.delete(listener)
  }

  #notifyChange() {
    this.#changeListeners.forEach((listener) => listener())
  }
}

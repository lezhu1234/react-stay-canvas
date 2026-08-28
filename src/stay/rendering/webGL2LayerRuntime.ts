import type {
  WebGL2ContextLayerSetFunction,
  WebGL2LayerConfig,
} from "../../types/canvas"
import type { Mesh } from "../webgl2/mesh"
import { WebGL2SceneRuntime } from "../webgl2/sceneRuntime"
import { resizeLayerSurface } from "./layerSurface"

const defaultWebGL2Context: WebGL2ContextLayerSetFunction = (canvas) =>
  canvas.getContext("webgl2", { alpha: true, depth: true })

/** @internal Owns one WebGL2 layer's context, camera, GPU cache, and lifecycle. */
export class WebGL2LayerRuntime {
  readonly backend = "webgl2"
  context!: WebGL2RenderingContext
  #scene?: WebGL2SceneRuntime
  #contextLost = false
  readonly #unsubscribeCameraChanges: () => void

  constructor(
    readonly element: HTMLCanvasElement,
    private readonly config: WebGL2LayerConfig,
    private readonly index: number,
    private readonly invalidate: () => void
  ) {
    this.element.addEventListener("webglcontextlost", this.#handleContextLost)
    this.element.addEventListener("webglcontextrestored", this.#handleContextRestored)
    this.#unsubscribeCameraChanges = this.config.camera.subscribeChanges(this.invalidate)
  }

  resizeBackingStore(width: number, height: number) {
    resizeLayerSurface(this.element, width, height)
  }

  resolveContext() {
    const context = (this.config.context ?? defaultWebGL2Context)(this.element)
    if (!context) {
      throw new Error(`Unable to get WebGL2 context for layer ${this.index}`)
    }
    const previousContext = this.context
    this.context = context
    this.#contextLost = context.isContextLost()
    if (!this.#scene) {
      this.#scene = new WebGL2SceneRuntime(context)
    } else if (previousContext !== context) {
      this.#scene.restoreContext(context)
    }
    return context
  }

  render(meshes: readonly Mesh[]) {
    if (!this.#scene) throw new Error(`WebGL2 layer ${this.index} is not initialized`)
    this.#scene.render(meshes, this.config.camera)
  }

  isDrawable() {
    return !this.#contextLost && !this.context.isContextLost()
  }

  destroy() {
    this.#unsubscribeCameraChanges()
    this.element.removeEventListener("webglcontextlost", this.#handleContextLost)
    this.element.removeEventListener("webglcontextrestored", this.#handleContextRestored)
    this.#scene?.dispose()
    this.#scene = undefined
  }

  readonly #handleContextLost = (event: Event) => {
    event.preventDefault()
    this.#contextLost = true
    this.config.onContextLost?.(event as WebGLContextEvent)
  }

  readonly #handleContextRestored = (event: Event) => {
    const context = (this.config.context ?? defaultWebGL2Context)(this.element)
    if (!context) {
      throw new Error(`Unable to get WebGL2 context for layer ${this.index}`)
    }
    this.#scene?.restoreContext(context)
    this.context = context
    this.#contextLost = false
    this.invalidate()
    this.config.onContextRestored?.(event as WebGLContextEvent)
  }
}

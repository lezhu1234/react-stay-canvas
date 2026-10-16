import type {
  OffscreenWebGL2LayerConfig,
  WebGL2LayerConfig,
} from "../../types/canvas"
import type { Mesh } from "../webgl2/mesh"
import type { EnvironmentMap } from "../webgl2/environmentMap"
import {
  webGL2DirectionalLightLimit,
  webGL2PointLightLimit,
  type WebGLLight,
} from "../webgl2/light"
import { WebGL2SceneRuntime } from "../webgl2/sceneRuntime"
import {
  resizeLayerSurface,
  type CanvasLayerSurface,
  type LayerSurfaceResize,
} from "./layerSurface"

type WebGL2RuntimeConfig = WebGL2LayerConfig | OffscreenWebGL2LayerConfig

/** @internal Owns one WebGL2 layer's context, camera, GPU cache, and lifecycle. */
export class WebGL2LayerRuntime {
  readonly backend = "webgl2"
  context!: WebGL2RenderingContext
  #scene?: WebGL2SceneRuntime
  #contextLost = false
  readonly #unsubscribeCameraChanges: () => void
  readonly #lights: readonly WebGLLight[]
  readonly #unsubscribeLightChanges: readonly (() => void)[]
  readonly #environment?: EnvironmentMap
  readonly #unsubscribeEnvironmentChanges?: () => void

  constructor(
    readonly surface: CanvasLayerSurface,
    private readonly config: WebGL2RuntimeConfig,
    private readonly resolveConfiguredContext: (
      surface: CanvasLayerSurface
    ) => WebGL2RenderingContext | null,
    private readonly index: number,
    private readonly invalidate: () => void
  ) {
    this.#lights = [...(this.config.lights ?? [])]
    this.#environment = this.config.environment
    if (new Set(this.#lights).size !== this.#lights.length) {
      throw new RangeError(`WebGL2 layer ${this.index} cannot contain duplicate Light instances`)
    }
    if (
      this.#lights.filter((light) => light.kind === "directional").length
      > webGL2DirectionalLightLimit
    ) {
      throw new RangeError(
        `WebGL2 layer ${this.index} supports at most ${webGL2DirectionalLightLimit} directional lights`
      )
    }
    if (
      this.#lights.filter((light) => light.kind === "point").length
      > webGL2PointLightLimit
    ) {
      throw new RangeError(
        `WebGL2 layer ${this.index} supports at most ${webGL2PointLightLimit} point lights`
      )
    }
    if (
      this.#lights.filter((light) =>
        light.kind === "directional" && light.getShadow() !== undefined).length > 1
    ) {
      throw new RangeError(
        `WebGL2 layer ${this.index} supports at most one shadow-casting directional light`
      )
    }
    const eventTarget = this.surface as EventTarget
    eventTarget.addEventListener("webglcontextlost", this.#handleContextLost)
    eventTarget.addEventListener("webglcontextrestored", this.#handleContextRestored)
    this.#unsubscribeCameraChanges = this.config.camera.subscribeChanges(this.invalidate)
    this.#unsubscribeLightChanges = this.#lights.map((light) =>
      light.subscribeChanges(this.invalidate))
    this.#unsubscribeEnvironmentChanges = this.#environment?.subscribeChanges(this.invalidate)
  }

  resizeBackingStore(resize: LayerSurfaceResize) {
    resizeLayerSurface(this.surface, resize)
  }

  resolveContext() {
    const context = this.resolveConfiguredContext(this.surface)
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
    this.#scene.render(meshes, this.config.camera, this.#lights, this.#environment)
  }

  isDrawable() {
    return !this.#contextLost && !this.context.isContextLost()
  }

  destroy() {
    this.#unsubscribeCameraChanges()
    this.#unsubscribeLightChanges.forEach((unsubscribe) => unsubscribe())
    this.#unsubscribeEnvironmentChanges?.()
    const eventTarget = this.surface as EventTarget
    eventTarget.removeEventListener("webglcontextlost", this.#handleContextLost)
    eventTarget.removeEventListener("webglcontextrestored", this.#handleContextRestored)
    this.#scene?.dispose()
    this.#scene = undefined
  }

  readonly #handleContextLost = (event: Event) => {
    event.preventDefault()
    this.#contextLost = true
    this.config.onContextLost?.(event as WebGLContextEvent)
  }

  readonly #handleContextRestored = (event: Event) => {
    const context = this.resolveConfiguredContext(this.surface)
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

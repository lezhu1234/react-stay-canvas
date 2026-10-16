import type {
  CanvasLayerConfig,
  CanvasSurfaceMetrics,
  DrawCanvasContext,
  OffscreenCanvasLayerConfig,
  OffscreenCanvasSurfaceOptions,
} from "./types/canvas"
import type { ViewPoint } from "./types/coordinates"
import type { Rect } from "./types/geometry"
import type { SurfaceMetrics } from "./stay/coordinates/coordinateSystem"
import { clearUnownedCanvas2DContext } from "./stay/rendering/canvas2DLayerRuntime"
import {
  createLayerRuntime,
  createOffscreenLayerRuntime,
  type LayerRuntime,
} from "./stay/rendering/layerRuntime"
import {
  createDOMSurfacePlatform,
  createOffscreenSurfacePlatform,
  type CanvasSurfacePlatform,
} from "./stay/rendering/layerSurface"
import type { Mesh } from "./stay/webgl2/mesh"

type CanvasRenderContext = DrawCanvasContext | WebGL2RenderingContext

interface OffscreenCanvasInitialization {
  readonly surfaces: OffscreenCanvas[]
  readonly layerConfigs: OffscreenCanvasLayerConfig[]
  readonly metrics: CanvasSurfaceMetrics
  readonly options?: OffscreenCanvasSurfaceOptions
}

export class Canvas {
  contexts: CanvasRenderContext[]
  height: number
  status: string
  width: number
  bound: Rect
  private readonly surfacePlatform: CanvasSurfacePlatform
  private readonly layerRuntimes: LayerRuntime[]
  private layerInvalidationListener?: (layerIndex: number) => void

  constructor(
    layers: HTMLCanvasElement[],
    layerConfigs: CanvasLayerConfig[],
    width: number,
    height: number
  )
  /** @internal Construct OffscreenCanvas through Canvas.createOffscreen(). */
  constructor(initialization: OffscreenCanvasInitialization)
  constructor(
    layersOrInitialization: HTMLCanvasElement[] | OffscreenCanvasInitialization,
    domLayerConfigs?: CanvasLayerConfig[],
    domWidth?: number,
    domHeight?: number
  ) {
    const domLayers = Array.isArray(layersOrInitialization) ? layersOrInitialization : undefined
    const offscreen = !Array.isArray(layersOrInitialization)
      ? layersOrInitialization
      : undefined
    const surfacePlatform = offscreen
      ? createOffscreenSurfacePlatform(
        offscreen.surfaces,
        offscreen.metrics,
        offscreen.options
      )
      : createDOMSurfacePlatform(domLayers!)
    const layerConfigs = offscreen?.layerConfigs ?? domLayerConfigs ?? []
    const width = offscreen?.metrics.logicalWidth ?? domWidth ?? 0
    const height = offscreen?.metrics.logicalHeight ?? domHeight ?? 0

    if (surfacePlatform.surfaces.length < 1) {
      throw new Error("Canvas must have at least one layer")
    }
    if (layerConfigs.length !== surfacePlatform.surfaces.length) {
      throw new Error("Canvas layer configuration count must match its elements")
    }
    this.surfacePlatform = surfacePlatform
    const layerRuntimes: LayerRuntime[] = []
    try {
      if (offscreen) {
        offscreen.surfaces.forEach((surface, index) => {
          layerRuntimes.push(createOffscreenLayerRuntime(
            surface,
            offscreen.layerConfigs[index],
            index,
            () => this.layerInvalidationListener?.(index)
          ))
        })
      } else {
        domLayers!.forEach((layer, index) => {
          layerRuntimes.push(createLayerRuntime(
            layer,
            layerConfigs[index] as CanvasLayerConfig,
            index,
            () => this.layerInvalidationListener?.(index)
          ))
        })
      }
    } catch (error) {
      layerRuntimes.forEach((layer) => layer.destroy())
      throw error
    }
    this.layerRuntimes = layerRuntimes
    this.width = width
    this.height = height
    this.status = "default"
    this.contexts = []

    this.bound = {
      x: 0,
      y: 0,
      width: this.width,
      height: this.height,
    }

    try {
      this.init()
    } catch (error) {
      this.layerRuntimes.forEach((layer) => layer.destroy())
      throw error
    }
  }

  static createOffscreen(
    surfaces: OffscreenCanvas[],
    layerConfigs: OffscreenCanvasLayerConfig[],
    metrics: CanvasSurfaceMetrics,
    options?: OffscreenCanvasSurfaceOptions
  ) {
    return new Canvas({ surfaces, layerConfigs, metrics, options })
  }

  /** DOM elements are intentionally unavailable to an OffscreenCanvas owner. */
  get layers(): HTMLCanvasElement[] {
    if (this.surfacePlatform.kind !== "dom") {
      throw new Error("DOM canvas layers are unavailable for an OffscreenCanvas runtime")
    }
    return this.surfacePlatform.surfaces as HTMLCanvasElement[]
  }

  get layerCount() {
    return this.layerRuntimes.length
  }

  get x(): number {
    return this.getSurfaceMetrics().clientRect.left
  }
  get y(): number {
    return this.getSurfaceMetrics().clientRect.top
  }

  clientToCanvasPoint(clientX: number, clientY: number): ViewPoint {
    const rect = this.getSurfaceMetrics().clientRect
    const scaleX = rect.width > 0 ? this.width / rect.width : 1
    const scaleY = rect.height > 0 ? this.height / rect.height : 1
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    }
  }

  public clear(context: DrawCanvasContext) {
    const layerRuntime = this.layerRuntimes[this.contexts.indexOf(context)]
    if (layerRuntime?.backend === "canvas2d") {
      layerRuntime.clear(context)
      return
    }
    clearUnownedCanvas2DContext(context, this.width, this.height)
  }

  getSurfaceMetrics(): SurfaceMetrics {
    return this.surfacePlatform.getMetrics(this.width, this.height)
  }

  getLayerSurfaceSize(
    layerIndex: number
  ): Readonly<{ width: number; height: number }> {
    const surface = this.surfacePlatform.surfaces[layerIndex]
    if (!surface) throw new RangeError(`Layer ${layerIndex} does not exist`)
    return { width: surface.width, height: surface.height }
  }

  setCursor(cursor: string) {
    this.surfacePlatform.setCursor(cursor)
  }

  withLayerFrame(
    layerIndex: number,
    transform: { offsetX: number; offsetY: number; scale: number },
    draw: (context: DrawCanvasContext) => void
  ) {
    const runtime = this.layerRuntimes[layerIndex]
    if (runtime.backend !== "canvas2d") {
      throw new Error(`Layer ${layerIndex} is not a Canvas2D layer`)
    }
    runtime.withFrame(
      runtime.context,
      this.width,
      this.height,
      transform,
      draw
    )
  }

  getLayerBackend(layerIndex: number) {
    return this.layerRuntimes[layerIndex].backend
  }

  renderWebGL2Layer(layerIndex: number, meshes: readonly Mesh[]) {
    const runtime = this.layerRuntimes[layerIndex]
    if (runtime.backend !== "webgl2") {
      throw new Error(`Layer ${layerIndex} is not a WebGL2 layer`)
    }
    runtime.render(meshes)
  }

  isLayerDrawable(layerIndex: number) {
    return this.layerRuntimes[layerIndex].isDrawable()
  }

  setLayerInvalidationListener(listener: (layerIndex: number) => void) {
    this.layerInvalidationListener = listener
  }

  init() {
    this.#resizeSurfaces(this.width, this.height)
  }

  resize(width: number, height: number) {
    if (this.surfacePlatform.kind === "offscreen") {
      throw new Error("Resize an OffscreenCanvas runtime with resizeFromSurfaceMetrics()")
    }
    this.#resizeSurfaces(width, height)
  }

  resizeFromSurfaceMetrics(metrics: CanvasSurfaceMetrics) {
    if (this.surfacePlatform.kind !== "offscreen") {
      throw new Error("DOM canvas metrics are measured during resize()")
    }
    this.surfacePlatform.updateMetrics(metrics)
    this.#resizeSurfaces(metrics.logicalWidth, metrics.logicalHeight)
  }

  updateSurfaceMetrics(metrics: CanvasSurfaceMetrics) {
    if (this.surfacePlatform.kind !== "offscreen") {
      throw new Error("DOM canvas metrics are measured from its rendered element")
    }
    const current = this.getSurfaceMetrics()
    const sizeChanged =
      current.logicalWidth !== metrics.logicalWidth ||
      current.logicalHeight !== metrics.logicalHeight ||
      current.backingWidth !== metrics.backingWidth ||
      current.backingHeight !== metrics.backingHeight
    this.surfacePlatform.updateMetrics(metrics)
    if (sizeChanged) {
      this.#resizeSurfaces(metrics.logicalWidth, metrics.logicalHeight)
    }
  }

  #resizeSurfaces(width: number, height: number) {
    this.width = width
    this.height = height
    this.bound = { x: 0, y: 0, width, height }

    const resize = this.surfacePlatform.getResize(width, height)
    this.layerRuntimes.forEach((layer) => layer.resizeBackingStore(resize))

    // Changing a Canvas backing-store size resets its context state. Resolve
    // every configured context again after sizing so custom setters can
    // restore the state they own without recreating the Stay runtime.
    this.contexts = this.layerRuntimes.map((layer) => layer.resolveContext())
    this.layerRuntimes.forEach((_layer, index) => this.layerInvalidationListener?.(index))
  }

  destroy() {
    this.layerInvalidationListener = undefined
    this.layerRuntimes.forEach((layer) => layer.destroy())
  }
}

export default Canvas

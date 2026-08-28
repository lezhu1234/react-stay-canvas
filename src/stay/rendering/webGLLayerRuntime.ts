import type {
  WebGLContextLayerSetFunction,
  WebGLLayerConfig,
} from "../../types/canvas"
import { resizeLayerSurface } from "./layerSurface"

const defaultWebGLContext: WebGLContextLayerSetFunction = (canvas) =>
  canvas.getContext("webgl")

/** @internal Owns the context and loss/restore lifecycle of one WebGL layer. */
export class WebGLLayerRuntime {
  readonly backend = "webgl"
  context!: WebGLRenderingContext
  private contextLost = false

  constructor(
    readonly element: HTMLCanvasElement,
    private readonly config: WebGLLayerConfig,
    private readonly index: number,
    private readonly invalidate: () => void
  ) {
    this.element.addEventListener("webglcontextlost", this.handleContextLost)
    this.element.addEventListener("webglcontextrestored", this.handleContextRestored)
  }

  resizeBackingStore(width: number, height: number) {
    resizeLayerSurface(this.element, width, height)
  }

  resolveContext() {
    const context = (this.config.context ?? defaultWebGLContext)(this.element)
    if (!context) {
      throw new Error(`Unable to get WebGL context for layer ${this.index}`)
    }
    this.context = context
    this.contextLost = context.isContextLost()
    return context
  }

  isDrawable() {
    return !this.contextLost && !this.context.isContextLost()
  }

  destroy() {
    this.element.removeEventListener("webglcontextlost", this.handleContextLost)
    this.element.removeEventListener("webglcontextrestored", this.handleContextRestored)
  }

  private readonly handleContextLost = (event: Event) => {
    this.contextLost = true
    this.config.onContextLost?.(event as WebGLContextEvent)
  }

  private readonly handleContextRestored = (event: Event) => {
    this.contextLost = false
    this.resolveContext()
    this.invalidate()
    this.config.onContextRestored?.(event as WebGLContextEvent)
  }
}

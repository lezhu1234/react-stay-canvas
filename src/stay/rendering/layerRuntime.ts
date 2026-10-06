import type {
  Canvas2DLayerConfig,
  CanvasLayerConfig,
  ContextLayerSetFunction,
  OffscreenCanvas2DContextLayerSetFunction,
  OffscreenCanvas2DLayerConfig,
  OffscreenCanvasLayerConfig,
  OffscreenWebGL2LayerConfig,
  WebGL2ContextLayerSetFunction,
} from "../../types/canvas"
import { Canvas2DLayerRuntime } from "./canvas2DLayerRuntime"
import { WebGL2LayerRuntime } from "./webGL2LayerRuntime"

const defaultCanvas2DContext: ContextLayerSetFunction = (canvas) =>
  canvas.getContext("2d")
const defaultOffscreenCanvas2DContext: OffscreenCanvas2DContextLayerSetFunction = (canvas) =>
  canvas.getContext("2d")
const defaultWebGL2Context: WebGL2ContextLayerSetFunction = (canvas) =>
  canvas.getContext("webgl2", { alpha: true, depth: true })
const defaultOffscreenWebGL2Context = (canvas: OffscreenCanvas) =>
  canvas.getContext("webgl2", { alpha: true, depth: true })

export type LayerRuntime = Canvas2DLayerRuntime | WebGL2LayerRuntime

function canvas2DContext(config: ContextLayerSetFunction | Canvas2DLayerConfig) {
  return typeof config === "function"
    ? config
    : config.context ?? defaultCanvas2DContext
}

function offscreenCanvas2DContext(
  config: OffscreenCanvas2DContextLayerSetFunction | OffscreenCanvas2DLayerConfig
) {
  return typeof config === "function"
    ? config
    : config.context ?? defaultOffscreenCanvas2DContext
}

/** @internal Resolves the public layer contract into its single runtime owner. */
export function createLayerRuntime(
  element: HTMLCanvasElement,
  config: CanvasLayerConfig,
  index: number,
  invalidate: () => void
): LayerRuntime {
  if (typeof config === "function" || config?.backend === "canvas2d") {
    const resolveContext = canvas2DContext(config)
    return new Canvas2DLayerRuntime(
      element,
      (surface) => resolveContext(surface as HTMLCanvasElement),
      index
    )
  }
  if (config?.backend === "webgl2") {
    const resolveContext = config.context ?? defaultWebGL2Context
    return new WebGL2LayerRuntime(
      element,
      config,
      (surface) => resolveContext(surface as HTMLCanvasElement),
      index,
      invalidate
    )
  }
  throw new Error(`Unsupported Canvas backend for layer ${index}`)
}

/** @internal Resolves worker-local callbacks without widening the DOM API. */
export function createOffscreenLayerRuntime(
  surface: OffscreenCanvas,
  config: OffscreenCanvasLayerConfig,
  index: number,
  invalidate: () => void
): LayerRuntime {
  if (typeof config === "function" || config?.backend === "canvas2d") {
    const resolveContext = offscreenCanvas2DContext(config)
    return new Canvas2DLayerRuntime(
      surface,
      (candidate) => resolveContext(candidate as OffscreenCanvas),
      index
    )
  }
  if (config?.backend === "webgl2") {
    const webGLConfig = config as OffscreenWebGL2LayerConfig
    const resolveContext = webGLConfig.context ?? defaultOffscreenWebGL2Context
    return new WebGL2LayerRuntime(
      surface,
      webGLConfig,
      (candidate) => resolveContext(candidate as OffscreenCanvas),
      index,
      invalidate
    )
  }
  throw new Error(`Unsupported Canvas backend for layer ${index}`)
}

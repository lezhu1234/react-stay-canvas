import type {
  Canvas2DLayerConfig,
  CanvasLayerConfig,
  ContextLayerSetFunction,
} from "../../types/canvas"
import { Canvas2DLayerRuntime } from "./canvas2DLayerRuntime"
import { WebGLLayerRuntime } from "./webGLLayerRuntime"

const defaultCanvas2DContext: ContextLayerSetFunction = (canvas) =>
  canvas.getContext("2d")

export type LayerRuntime = Canvas2DLayerRuntime | WebGLLayerRuntime

function canvas2DContext(config: ContextLayerSetFunction | Canvas2DLayerConfig) {
  return typeof config === "function"
    ? config
    : config.context ?? defaultCanvas2DContext
}

/** @internal Resolves the public layer contract into its single runtime owner. */
export function createLayerRuntime(
  element: HTMLCanvasElement,
  config: CanvasLayerConfig,
  index: number,
  invalidate: () => void
): LayerRuntime {
  if (typeof config === "function") {
    return new Canvas2DLayerRuntime(element, config, index)
  }
  if (config?.backend === "canvas2d") {
    return new Canvas2DLayerRuntime(element, canvas2DContext(config), index)
  }
  if (config?.backend === "webgl") {
    return new WebGLLayerRuntime(element, config, index, invalidate)
  }
  throw new Error(`Unsupported Canvas backend for layer ${index}`)
}

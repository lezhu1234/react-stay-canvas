import type { PerspectiveCamera } from "../stay/webgl2/perspectiveCamera"
import type { WebGLLight } from "../stay/webgl2/light"
import type { EnvironmentMap } from "../stay/webgl2/environmentMap"

export type DrawCanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export interface ContextLayerSetFunction {
  (layer: HTMLCanvasElement): DrawCanvasContext | null
}

export interface WebGL2ContextLayerSetFunction {
  (layer: HTMLCanvasElement): WebGL2RenderingContext | null
}

export interface Canvas2DLayerConfig {
  readonly backend: "canvas2d"
  readonly context?: ContextLayerSetFunction
}

export interface WebGL2LayerConfig {
  readonly backend: "webgl2"
  readonly camera: PerspectiveCamera
  readonly environment?: EnvironmentMap
  readonly lights?: readonly WebGLLight[]
  readonly context?: WebGL2ContextLayerSetFunction
  readonly onContextLost?: (event: WebGLContextEvent) => void
  readonly onContextRestored?: (event: WebGLContextEvent) => void
}

/**
 * A function keeps the legacy custom Canvas2D context form. Descriptor forms
 * make the rendering backend explicit without creating a second layer model.
 */
export type CanvasLayerConfig =
  | ContextLayerSetFunction
  | Canvas2DLayerConfig
  | WebGL2LayerConfig

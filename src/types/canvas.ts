export type DrawCanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export interface ContextLayerSetFunction {
  (layer: HTMLCanvasElement): DrawCanvasContext | null
}

export interface WebGLContextLayerSetFunction {
  (layer: HTMLCanvasElement): WebGLRenderingContext | null
}

export interface Canvas2DLayerConfig {
  readonly backend: "canvas2d"
  readonly context?: ContextLayerSetFunction
}

export interface WebGLLayerConfig {
  readonly backend: "webgl"
  readonly context?: WebGLContextLayerSetFunction
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
  | WebGLLayerConfig

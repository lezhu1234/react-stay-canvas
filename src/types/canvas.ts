import type { PerspectiveCamera } from "../stay/webgl2/perspectiveCamera"
import type { WebGLLight } from "../stay/webgl2/light"
import type { EnvironmentMap } from "../stay/webgl2/environmentMap"

export type DrawCanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Serializable geometry supplied to an OffscreenCanvas owner. */
export interface CanvasSurfaceMetrics {
  readonly logicalWidth: number
  readonly logicalHeight: number
  readonly backingWidth: number
  readonly backingHeight: number
  readonly clientRect: Readonly<{
    left: number
    top: number
    width: number
    height: number
  }>
}

export interface ContextLayerSetFunction {
  (layer: HTMLCanvasElement): DrawCanvasContext | null
}

export interface WebGL2ContextLayerSetFunction {
  (layer: HTMLCanvasElement): WebGL2RenderingContext | null
}

export interface OffscreenCanvas2DContextLayerSetFunction {
  (layer: OffscreenCanvas): OffscreenCanvasRenderingContext2D | null
}

export interface OffscreenWebGL2ContextLayerSetFunction {
  (layer: OffscreenCanvas): WebGL2RenderingContext | null
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

export interface OffscreenCanvas2DLayerConfig {
  readonly backend: "canvas2d"
  readonly context?: OffscreenCanvas2DContextLayerSetFunction
}

export interface OffscreenWebGL2LayerConfig {
  readonly backend: "webgl2"
  readonly camera: PerspectiveCamera
  readonly environment?: EnvironmentMap
  readonly lights?: readonly WebGLLight[]
  readonly context?: OffscreenWebGL2ContextLayerSetFunction
  readonly onContextLost?: (event: WebGLContextEvent) => void
  readonly onContextRestored?: (event: WebGLContextEvent) => void
}

/**
 * Offscreen layers use worker-local context resolvers. Keeping this separate
 * preserves the long-standing HTMLCanvasElement callback contract.
 */
export type OffscreenCanvasLayerConfig =
  | OffscreenCanvas2DContextLayerSetFunction
  | OffscreenCanvas2DLayerConfig
  | OffscreenWebGL2LayerConfig

export interface OffscreenCanvasSurfaceOptions {
  /** Delivers cursor changes to the thread that owns the visible DOM canvas. */
  readonly setCursor?: (cursor: string) => void
}

/**
 * A function keeps the legacy custom Canvas2D context form. Descriptor forms
 * make the rendering backend explicit without creating a second layer model.
 */
export type CanvasLayerConfig =
  | ContextLayerSetFunction
  | Canvas2DLayerConfig
  | WebGL2LayerConfig

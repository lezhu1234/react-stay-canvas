import type {
  CanvasSurfaceMetrics,
  OffscreenCanvasSurfaceOptions,
} from "../../types/canvas"

export type CanvasLayerSurface = HTMLCanvasElement | OffscreenCanvas

export interface LayerSurfaceResize {
  readonly backingWidth: number
  readonly backingHeight: number
  readonly displayWidth?: number
  readonly displayHeight?: number
}

export interface CanvasSurfacePlatform {
  readonly kind: "dom" | "offscreen"
  readonly surfaces: CanvasLayerSurface[]
  getMetrics(logicalWidth: number, logicalHeight: number): CanvasSurfaceMetrics
  getResize(logicalWidth: number, logicalHeight: number): LayerSurfaceResize
  updateMetrics(metrics: CanvasSurfaceMetrics): void
  setCursor(cursor: string): void
}

function cloneMetrics(metrics: CanvasSurfaceMetrics): CanvasSurfaceMetrics {
  return {
    logicalWidth: metrics.logicalWidth,
    logicalHeight: metrics.logicalHeight,
    backingWidth: metrics.backingWidth,
    backingHeight: metrics.backingHeight,
    clientRect: { ...metrics.clientRect },
  }
}

function isHTMLCanvasSurface(
  surface: CanvasLayerSurface
): surface is HTMLCanvasElement {
  return "style" in surface && "getBoundingClientRect" in surface
}

export function resizeLayerSurface(
  surface: CanvasLayerSurface,
  resize: LayerSurfaceResize
) {
  surface.width = Math.round(resize.backingWidth)
  surface.height = Math.round(resize.backingHeight)

  if (resize.displayWidth === undefined || resize.displayHeight === undefined) {
    return
  }
  if (!isHTMLCanvasSurface(surface)) {
    throw new Error("Only a DOM canvas can have a CSS display size")
  }
  surface.style.width = `${resize.displayWidth}px`
  surface.style.height = `${resize.displayHeight}px`
}

export function createDOMSurfacePlatform(
  layers: HTMLCanvasElement[]
): CanvasSurfacePlatform {
  return {
    kind: "dom",
    surfaces: layers,
    getMetrics(logicalWidth, logicalHeight) {
      const layer = layers[layers.length - 1]
      const rect = layer.getBoundingClientRect()
      return {
        logicalWidth,
        logicalHeight,
        backingWidth: layer.width,
        backingHeight: layer.height,
        clientRect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
      }
    },
    getResize(logicalWidth, logicalHeight) {
      const dpr = globalThis.devicePixelRatio || 1
      return {
        backingWidth: logicalWidth * dpr,
        backingHeight: logicalHeight * dpr,
        displayWidth: logicalWidth,
        displayHeight: logicalHeight,
      }
    },
    updateMetrics() {
      throw new Error("DOM canvas metrics are measured from its rendered element")
    },
    setCursor(cursor) {
      layers[layers.length - 1].style.cursor = cursor
    },
  }
}

export function createOffscreenSurfacePlatform(
  layers: OffscreenCanvas[],
  initialMetrics: CanvasSurfaceMetrics,
  options: OffscreenCanvasSurfaceOptions = {}
): CanvasSurfacePlatform {
  let metrics = cloneMetrics(initialMetrics)
  return {
    kind: "offscreen",
    surfaces: layers,
    getMetrics() {
      return cloneMetrics(metrics)
    },
    getResize() {
      return {
        backingWidth: metrics.backingWidth,
        backingHeight: metrics.backingHeight,
      }
    },
    updateMetrics(nextMetrics) {
      metrics = cloneMetrics(nextMetrics)
    },
    setCursor(cursor) {
      options.setCursor?.(cursor)
    },
  }
}

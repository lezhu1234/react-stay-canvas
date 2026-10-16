import type {
  CanvasLayerConfig,
  CanvasSurfaceMetrics,
  ContextLayerSetFunction,
  OffscreenCanvasLayerConfig,
} from "react-stay-canvas"

const legacyContext: ContextLayerSetFunction = (layer) => {
  const htmlLayer: HTMLCanvasElement = layer
  return htmlLayer.getContext("2d")
}
const legacyLayers: CanvasLayerConfig[] = [legacyContext]
void legacyLayers

const offscreenLayers: OffscreenCanvasLayerConfig[] = [
  (layer) => layer.getContext("2d"),
]
void offscreenLayers

const surfaceMetrics: CanvasSurfaceMetrics = {
  logicalWidth: 320,
  logicalHeight: 180,
  backingWidth: 640,
  backingHeight: 360,
  clientRect: { left: 20, top: 10, width: 320, height: 180 },
}
void surfaceMetrics

// @ts-expect-error The established DOM callback never receives OffscreenCanvas.
const invalidLegacyContext: ContextLayerSetFunction = (layer: OffscreenCanvas) =>
  layer.getContext("2d")
void invalidLegacyContext

const invalidOffscreenLayers: OffscreenCanvasLayerConfig[] = [
  // @ts-expect-error Worker-local resolvers never receive HTMLCanvasElement.
  (layer: HTMLCanvasElement) => layer.getContext("2d"),
]
void invalidOffscreenLayers

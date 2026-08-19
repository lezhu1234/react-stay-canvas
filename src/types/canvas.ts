export type DrawCanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export interface ContextLayerSetFunction {
  (layer: HTMLCanvasElement): DrawCanvasContext | null
}

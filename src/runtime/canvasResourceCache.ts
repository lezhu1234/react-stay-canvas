import type { Size } from "../userTypes"

class CanvasResourceCache {
  private readonly fontSizes = new Map<string, Size>()
  private readonly offscreenCanvases = new Map<
    string,
    { canvas: OffscreenCanvas; context: OffscreenCanvasRenderingContext2D }
  >()

  getFontSize(key: string) {
    return this.fontSizes.get(key)
  }

  getOffscreenContext(name: string, width = 500, height = 500) {
    const cached = this.offscreenCanvases.get(name)
    if (!cached || cached.canvas.width !== width || cached.canvas.height !== height) {
      const canvas = new OffscreenCanvas(width, height)
      const context = canvas.getContext("2d", { willReadFrequently: true })!
      this.offscreenCanvases.set(name, { canvas, context })
      return context
    }
    return cached.context
  }

  setFontSize(key: string, size: Size) {
    this.fontSizes.set(key, size)
  }
}

export const canvasResourceCache = new CanvasResourceCache()

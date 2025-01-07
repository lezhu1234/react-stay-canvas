import { Size } from "./userTypes"
import { stringToRgba } from "./utils"
import { RGBA } from "./w3color"

class StayCanvasGlobalStore {
  fontSizeCache = new Map<string, Size>()
  offscreenCanvasCache = new Map<
    string,
    { canvas: OffscreenCanvas; context: OffscreenCanvasRenderingContext2D }
  >()

  stringRGBCache = new Map<string, RGBA>()

  getFontSizeCache(key: string) {
    return this.fontSizeCache.get(key)
  }

  getOffscreenCanvas(name: string, width: number = 500, height: number = 500) {
    const temp = this.offscreenCanvasCache.get(name)
    if (!temp || temp.canvas.width !== width || temp.canvas.height !== height) {
      const tempCanvas = new OffscreenCanvas(width, height)
      const tempContext = tempCanvas?.getContext("2d", { willReadFrequently: true })!
      this.offscreenCanvasCache.set(name, { canvas: tempCanvas, context: tempContext })
      return tempContext
    }

    return temp.context
  }

  setFontSizeCache(key: string, size: Size) {
    this.fontSizeCache.set(key, size)
  }

  stringToRgbaWithCache(color: string): RGBA {
    if (this.stringRGBCache.has(color)) {
      return structuredClone(this.stringRGBCache.get(color)!)
    }
    const rgbaColor = stringToRgba(color)
    this.stringRGBCache.set(color, rgbaColor)
    return rgbaColor
  }
}

export const globalStore = new StayCanvasGlobalStore()

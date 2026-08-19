import { canvasResourceCache } from "../runtime/canvasResourceCache"
import type { Size } from "../types/geometry"
import type { Font } from "../types/shapes"

export function getFontStr(font: Font) {
  const { size, fontFamily, fontWeight, italic } = font
  return `${fontWeight ?? 400} ${italic ? "italic" : ""} ${size ?? 16}px ${
    fontFamily ?? "monospace"
  }`
}

export function getSize(text: string, font: Font): Size {
  const fontString = getFontStr(font)
  const cacheKey = `${text}-${fontString}`
  const cachedSize = canvasResourceCache.getFontSize(cacheKey)
  if (cachedSize) return cachedSize

  const context = canvasResourceCache.getOffscreenContext("getSize")
  context.font = fontString
  context.textBaseline = "bottom"
  context.textAlign = "start"

  const metrics = context.measureText(text)
  const size = {
    width: metrics.width,
    height: metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent,
  }
  canvasResourceCache.setFontSize(cacheKey, size)
  return size
}

export function getDefaultFont(font?: Font): Required<Font> {
  return {
    size: 16,
    fontFamily: "monospace",
    fontWeight: 400,
    italic: false,
    strikethrough: false,
    underline: false,
    ...font,
  }
}

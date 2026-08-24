import { canvasResourceCache } from "../runtime/canvasResourceCache"
import type { TextSize } from "../types/geometry"
import type { Font } from "../types/shapes"

export function getFontStr(font: Font) {
  const { size, fontFamily, fontWeight, italic } = font
  return `${fontWeight ?? 400} ${italic ? "italic" : ""} ${size ?? 16}px ${
    fontFamily ?? "monospace"
  }`
}

export function getSize(text: string, font: Font, textBaseline: CanvasTextBaseline): TextSize {
  const fontString = getFontStr(font)
  const cacheKey = `${text}-${fontString}-${textBaseline}`
  const cachedSize = canvasResourceCache.getFontSize(cacheKey)
  if (cachedSize) return cachedSize

  const context = canvasResourceCache.getOffscreenContext("getSize")
  context.font = fontString
  context.textBaseline = textBaseline
  context.textAlign = "start"

  const metrics = context.measureText(text)
  const ascent = metrics.fontBoundingBoxAscent
  const descent = metrics.fontBoundingBoxDescent
  const size = {
    width: metrics.width,
    height: ascent + descent,
    ascent,
    descent,
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

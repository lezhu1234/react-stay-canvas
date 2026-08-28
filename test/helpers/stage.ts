import { createStay } from "../../src/stay/stay"
import * as PredefinedEventList from "../../src/predefinedEvents"
import type { ViewportOptions } from "../../src/types/tools"
import type { CanvasLayerConfig } from "../../src/types/canvas"

// Build a real Stay backed by jsdom canvas elements (node-canvas provides
// the 2D context). Requires `// @vitest-environment jsdom` in the test file.
export function createStage(opts: {
  width?: number
  height?: number
  layers?: number | CanvasLayerConfig[]
  // Override the RAF stub — e.g. a counter to assert the render loop engaged.
  // Defaults to a no-op so tests draw on demand, not continuously.
  raf?: (cb: FrameRequestCallback) => number
  viewport?: ViewportOptions
} = {}) {
  const { width = 500, height = 500, layers = 2, raf = () => 0, viewport } = opts
  const layerCount = typeof layers === "number" ? layers : layers.length

  // Neutralise (or instrument) the RAF render loop so tests draw on demand.
  ;(globalThis as any).requestAnimationFrame = raf
  if (typeof window !== "undefined") (window as any).requestAnimationFrame = raf

  const canvasEls: HTMLCanvasElement[] = Array.from({ length: layerCount }, () => {
    const el = document.createElement("canvas")
    el.width = width
    el.height = height
    return el
  })
  const layerConfigs = typeof layers === "number"
    ? canvasEls.map(() => (canvas: HTMLCanvasElement) => canvas.getContext("2d"))
    : layers

  const stage = createStay(canvasEls, layerConfigs, width, height, false, viewport)
  Object.values(PredefinedEventList).forEach((e) => stage.registerEvent(e as any))
  // Events bind to the top layer (last canvas).
  const top = canvasEls[canvasEls.length - 1]
  return { stage, layers: canvasEls, top }
}

// DOM MouseEvent factories for driving the event pipeline.
export const md = (x: number, y: number) =>
  new MouseEvent("mousedown", { clientX: x, clientY: y, button: 0, bubbles: true })
export const mm = (x: number, y: number) =>
  new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true })
export const mu = (x: number, y: number) =>
  new MouseEvent("mouseup", { clientX: x, clientY: y, button: 0, bubbles: true })

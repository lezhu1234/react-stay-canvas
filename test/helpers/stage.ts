import StayStage from "../../src/stay/stayStage"
import * as PredefinedEventList from "../../src/predefinedEvents"
import type { StayMode } from "../../src/userTypes"

// Build a real StayStage backed by jsdom canvas elements (node-canvas provides
// the 2D context). Requires `// @vitest-environment jsdom` in the test file.
export function createStage(opts: {
  width?: number
  height?: number
  layers?: number
  mode?: StayMode
} = {}) {
  const { width = 500, height = 500, layers = 2, mode = "instant" } = opts

  // Neutralise the RAF render loop so tests draw on demand, not continuously.
  ;(globalThis as any).requestAnimationFrame = () => 0
  if (typeof window !== "undefined") (window as any).requestAnimationFrame = () => 0

  const canvasEls: HTMLCanvasElement[] = Array.from({ length: layers }, () => {
    const el = document.createElement("canvas")
    el.width = width
    el.height = height
    return el
  })
  const contextSetters = canvasEls.map(
    () => (canvas: HTMLCanvasElement) => canvas.getContext("2d")
  )

  const stage = new StayStage(canvasEls, contextSetters as any, width, height, false, mode as any)
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

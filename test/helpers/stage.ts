import { createStay } from "../../src/stay/stay"
import * as PredefinedEventList from "../../src/predefinedEvents"

function ensurePointerEvent() {
  if (typeof window.PointerEvent !== "undefined") return

  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    readonly isPrimary: boolean

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 1
      this.pointerType = init.pointerType ?? "mouse"
      this.isPrimary = init.isPrimary ?? true
    }
  }

  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: PointerEventPolyfill,
  })
  Object.defineProperty(globalThis, "PointerEvent", {
    configurable: true,
    value: PointerEventPolyfill,
  })
}

// Build a real Stay backed by jsdom canvas elements (node-canvas provides
// the 2D context). Requires `// @vitest-environment jsdom` in the test file.
export function createStage(opts: {
  width?: number
  height?: number
  layers?: number
  // Override the RAF stub — e.g. a counter to assert the render loop engaged.
  // Defaults to a no-op so tests draw on demand, not continuously.
  raf?: (cb: FrameRequestCallback) => number
} = {}) {
  ensurePointerEvent()
  const { width = 500, height = 500, layers = 2, raf = () => 0 } = opts

  // Neutralise (or instrument) the RAF render loop so tests draw on demand.
  ;(globalThis as any).requestAnimationFrame = raf
  if (typeof window !== "undefined") (window as any).requestAnimationFrame = raf

  const canvasEls: HTMLCanvasElement[] = Array.from({ length: layers }, () => {
    const el = document.createElement("canvas")
    el.width = width
    el.height = height
    return el
  })
  const capturedPointers = new Set<number>()
  canvasEls.forEach((canvas) => {
    canvas.setPointerCapture = (pointerId: number) => capturedPointers.add(pointerId)
    canvas.releasePointerCapture = (pointerId: number) => capturedPointers.delete(pointerId)
    canvas.hasPointerCapture = (pointerId: number) => capturedPointers.has(pointerId)
  })
  const contextSetters = canvasEls.map(
    () => (canvas: HTMLCanvasElement) => canvas.getContext("2d")
  )

  const stage = createStay(canvasEls, contextSetters as any, width, height, false)
  Object.values(PredefinedEventList).forEach((e) => stage.registerEvent(e as any))
  // Events bind to the top layer (last canvas).
  const top = canvasEls[canvasEls.length - 1]
  return { stage, layers: canvasEls, top, capturedPointers }
}

// DOM PointerEvent factories for driving the pointer-backed mouse event pipeline.
export const md = (x: number, y: number) =>
  new PointerEvent("pointerdown", { clientX: x, clientY: y, button: 0, buttons: 1, bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true })
export const mm = (x: number, y: number) =>
  new PointerEvent("pointermove", { clientX: x, clientY: y, button: -1, buttons: 1, bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true })
export const mu = (x: number, y: number) =>
  new PointerEvent("pointerup", { clientX: x, clientY: y, button: 0, buttons: 0, bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true })
export const pc = (x: number, y: number) =>
  new PointerEvent("pointercancel", { clientX: x, clientY: y, button: 0, buttons: 0, bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true })

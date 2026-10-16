import { describe, expect, it, vi } from "vitest"

import { Canvas } from "../src/canvas"
import { CoordinateSystem } from "../src/stay/coordinates/coordinateSystem"
import { Renderer, type RendererFrameClock } from "../src/stay/renderer"
import type { CanvasSurfaceMetrics } from "../src/types/canvas"

function metrics(
  logicalWidth: number,
  logicalHeight: number,
  backingWidth: number,
  backingHeight: number
): CanvasSurfaceMetrics {
  return {
    logicalWidth,
    logicalHeight,
    backingWidth,
    backingHeight,
    clientRect: {
      left: 40,
      top: 20,
      width: logicalWidth / 2,
      height: logicalHeight / 2,
    },
  }
}

function recordingSurface() {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
  } as unknown as OffscreenCanvasRenderingContext2D
  const surface = Object.assign(new EventTarget(), {
    width: 1,
    height: 1,
    getContext: vi.fn(() => context),
  }) as unknown as OffscreenCanvas
  return { context, surface }
}

describe("OffscreenCanvas runtime", () => {
  it("draws through the existing Canvas2D runtime using transferred metrics", () => {
    const { context, surface } = recordingSurface()
    const resolveContext = vi.fn((received: OffscreenCanvas) => {
      expect(received).toBe(surface)
      return context
    })
    const cursor = vi.fn()
    const canvas = Canvas.createOffscreen(
      [surface],
      [resolveContext],
      metrics(320, 180, 640, 360),
      { setCursor: cursor }
    )

    expect(canvas.layerCount).toBe(1)
    expect(canvas.getLayerSurfaceSize(0)).toEqual({ width: 640, height: 360 })
    expect(canvas.getSurfaceMetrics()).toEqual(metrics(320, 180, 640, 360))
    expect(() => canvas.layers).toThrow("DOM canvas layers are unavailable")

    canvas.withLayerFrame(
      0,
      { offsetX: 5, offsetY: 7, scale: 1.5 },
      vi.fn()
    )
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 640, 360)
    expect(context.setTransform).toHaveBeenLastCalledWith(3, 0, 0, 3, 10, 14)

    canvas.resizeFromSurfaceMetrics(metrics(400, 200, 800, 400))
    expect(canvas.getLayerSurfaceSize(0)).toEqual({ width: 800, height: 400 })
    expect(canvas.getSurfaceMetrics()).toEqual(metrics(400, 200, 800, 400))
    expect(resolveContext).toHaveBeenCalledTimes(2)

    const movedMetrics = {
      ...metrics(400, 200, 800, 400),
      clientRect: { left: 90, top: 60, width: 200, height: 100 },
    }
    canvas.updateSurfaceMetrics(movedMetrics)
    expect(canvas.getSurfaceMetrics()).toEqual(movedMetrics)
    expect(resolveContext).toHaveBeenCalledTimes(2)

    canvas.setCursor("crosshair")
    expect(cursor).toHaveBeenCalledWith("crosshair")
  })

  it("uses an injected frame clock without a window global", () => {
    const { context, surface } = recordingSurface()
    const canvas = Canvas.createOffscreen(
      [surface],
      [() => context],
      metrics(320, 180, 640, 360)
    )
    const requestFrame = vi.fn(() => 19)
    const cancelFrame = vi.fn()
    const clock: RendererFrameClock = {
      now: () => 7,
      requestFrame,
      cancelFrame,
    }
    const renderer = new Renderer(
      canvas,
      () => [],
      new CoordinateSystem(),
      undefined,
      clock
    )

    renderer.start()
    expect(requestFrame).toHaveBeenCalledOnce()
    renderer.stop()
    expect(cancelFrame).toHaveBeenCalledWith(19)
  })
})

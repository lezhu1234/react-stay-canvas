import { describe, expect, it } from "vitest"

import { CoordinateSystem } from "../src/stay/coordinates/coordinateSystem"

const metrics = {
  logicalWidth: 1100,
  logicalHeight: 733,
  backingWidth: 2200,
  backingHeight: 1466,
  clientRect: { left: 100, top: 50, width: 1375, height: 916.25 },
} as const

describe("CoordinateSystem", () => {
  it("maps Client to View independently on each axis", () => {
    const coordinates = new CoordinateSystem()

    expect(coordinates.clientToView({ x: 1200, y: 508.125 } as any, metrics))
      .toEqual({ x: 880, y: 366.5 })
  })

  it("keeps the zoom anchor fixed in View while changing visible Content", () => {
    const coordinates = new CoordinateSystem()
    const before = coordinates.getFrame(metrics)
    const anchor = coordinates.viewToContent({ x: 440, y: 300 } as any, before)

    coordinates.panBy({ x: 80, y: -20 })
    const panned = coordinates.getFrame(metrics)
    const pannedAnchor = coordinates.viewToContent({ x: 440, y: 300 } as any, panned)
    const state = coordinates.zoomBy(2, pannedAnchor)
    const after = coordinates.getFrame(metrics)

    expect(state).toEqual({ x: -280, y: -340, scale: 2 })
    expect(coordinates.contentToView(pannedAnchor, after)).toEqual({ x: 440, y: 300 })
    expect(after.visibleContentArea).toEqual({
      x: 140,
      y: 170,
      width: 550,
      height: 366.5,
    })
    expect(before.revision).toBe(0)
    expect(after.revision).toBe(2)
  })

  it("clamps scale, rejects invalid state, and preserves frame identity on no-op", () => {
    const coordinates = new CoordinateSystem({ minScale: 0.5, maxScale: 2 })
    const first = coordinates.getFrame(metrics)

    expect(coordinates.getFrame(metrics)).toBe(first)
    expect(coordinates.zoomBy(10, { x: 0, y: 0 }).scale).toBe(2)
    expect(coordinates.zoomBy(10, { x: 0, y: 0 }).scale).toBe(2)
    expect(coordinates.getFrame(metrics).revision).toBe(1)
    expect(() => coordinates.restore({ x: 0, y: 0, scale: 0 }))
      .toThrow("viewport.scale must be greater than 0")
  })

  it("maps one pointer sample set into all three spaces", () => {
    const coordinates = new CoordinateSystem()
    coordinates.restore({ x: 40, y: -10, scale: 2 })
    const frame = coordinates.getFrame(metrics)
    const result = coordinates.mapPointer({
      start: { clientX: 100, clientY: 50 },
      previous: { clientX: 200, clientY: 150 },
      current: { clientX: 300, clientY: 250 },
    }, metrics, frame)

    expect(result.client).toEqual({ x: 300, y: 250 })
    expect(result.view).toEqual({ x: 160, y: 160 })
    expect(result.content).toEqual({ x: 60, y: 85 })
    expect(result.viewMovement).toEqual({ x: 80, y: 80 })
    expect(result.viewOffsetFromStart).toEqual({ x: 160, y: 160 })
  })

  it("keeps Client and View reversible before a DOM layout reports size", () => {
    const coordinates = new CoordinateSystem()
    const zeroLayout = {
      ...metrics,
      clientRect: { left: 0, top: 0, width: 0, height: 0 },
    }

    expect(coordinates.viewToClient({ x: 320, y: 180 } as any, zeroLayout))
      .toEqual({ x: 320, y: 180 })
    expect(coordinates.clientToView({ x: 320, y: 180 } as any, zeroLayout))
      .toEqual({ x: 320, y: 180 })
  })
})

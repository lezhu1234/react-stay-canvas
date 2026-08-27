// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { Path, Point, Rectangle } from "react-stay-canvas"
import { createStage } from "./helpers/stage"

// Dimension 6 (Layers + real draw): assert the shape actually paints on the
// right layer's 2D context, and that dirty-tracking limits repaints.

const rgba = (r: number, g: number, b: number, a = 1) => ({ r, g, b, a })

describe("real drawing (node-canvas ctx spy)", () => {
  it("a dirty stroked rect calls strokeRect on its layer context", () => {
    const { stage, layers } = createStage({ layers: 2 })
    const strokeRect = vi.spyOn(layers[0].getContext("2d")!, "strokeRect")
    const child: any = stage.tools.appendChild({
      className: "r",
      shape: new Rectangle({
        x: 10,
        y: 10,
        width: 20,
        height: 20,
        strokeConfig: { color: rgba(1, 2, 3), lineWidth: 2 },
      }),
    })
    child.shape.update({}) // mark the layer dirty
    stage.draw({})
    expect(strokeRect).toHaveBeenCalledWith(10, 10, 20, 20)
  })

  it("a filled rect calls fillRect", () => {
    const { stage, layers } = createStage({ layers: 2 })
    const fillRect = vi.spyOn(layers[0].getContext("2d")!, "fillRect")
    const child: any = stage.tools.appendChild({
      className: "r",
      shape: new Rectangle({
        x: 0,
        y: 0,
        width: 5,
        height: 5,
        fillConfig: { color: rgba(9, 9, 9) },
      }),
    })
    child.shape.update({})
    stage.draw({})
    expect(fillRect).toHaveBeenCalledWith(0, 0, 5, 5)
  })

  it("routes a shape to its own layer, not the others", () => {
    const { stage, layers } = createStage({ layers: 2 })
    const l0 = vi.spyOn(layers[0].getContext("2d")!, "strokeRect")
    const l1 = vi.spyOn(layers[1].getContext("2d")!, "strokeRect")
    const child: any = stage.tools.appendChild({
      className: "r",
      shape: new Rectangle({
        x: 1,
        y: 1,
        width: 2,
        height: 2,
        layer: 1,
        strokeConfig: { color: rgba(1, 1, 1), lineWidth: 1 },
      }),
    })
    child.shape.update({})
    stage.draw({})
    expect(l1).toHaveBeenCalled()
    expect(l0).not.toHaveBeenCalled()
  })

  it("dirty tracking: an unchanged layer is not repainted", () => {
    const { stage, layers } = createStage({ layers: 2 })
    const strokeRect = vi.spyOn(layers[0].getContext("2d")!, "strokeRect")
    const child: any = stage.tools.appendChild({
      className: "r",
      shape: new Rectangle({
        x: 0,
        y: 0,
        width: 4,
        height: 4,
        strokeConfig: { color: rgba(1, 1, 1), lineWidth: 1 },
      }),
    })
    child.shape.update({})
    stage.draw({}) // paints once
    expect(strokeRect).toHaveBeenCalledTimes(1)
    stage.draw({}) // nothing dirty -> no repaint
    expect(strokeRect).toHaveBeenCalledTimes(1)
  })

  it("clears the old layer and paints the new layer after a Shape moves layers", () => {
    const { stage, layers } = createStage({ layers: 2 })
    const oldContext = layers[0].getContext("2d")!
    const newContext = layers[1].getContext("2d")!
    const clearOldLayer = vi.spyOn(oldContext, "clearRect")
    const clearNewLayer = vi.spyOn(newContext, "clearRect")
    const paintOldLayer = vi.spyOn(oldContext, "strokeRect")
    const paintNewLayer = vi.spyOn(newContext, "strokeRect")
    const child = stage.tools.appendChild({
      className: "r",
      shape: new Rectangle({
        x: 2,
        y: 3,
        width: 4,
        height: 5,
        layer: 0,
        strokeConfig: { color: rgba(1, 1, 1), lineWidth: 1 },
      }),
    })
    stage.draw({})
    clearOldLayer.mockClear()
    clearNewLayer.mockClear()
    paintOldLayer.mockClear()
    paintNewLayer.mockClear()

    child.shape.update({ layer: 1 })
    const result = stage.draw({})

    expect(result.updatedLayers).toEqual([0, 1])
    expect(clearOldLayer).toHaveBeenCalledOnce()
    expect(clearNewLayer).toHaveBeenCalledOnce()
    expect(paintOldLayer).not.toHaveBeenCalled()
    expect(paintNewLayer).toHaveBeenCalledWith(2, 3, 4, 5)
  })

  it("normalizes a negative target layer while dirtying both layers", () => {
    const { stage } = createStage({ layers: 2 })
    const child = stage.tools.appendChild({
      className: "r",
      shape: new Rectangle({ x: 0, y: 0, width: 4, height: 4, layer: 0 }),
    })
    stage.draw({})

    child.shape.update({ layer: -1 })

    expect(child.shape.layer).toBe(1)
    expect(stage.draw({}).updatedLayers).toEqual([0, 1])
  })

  // Refactor cut 1: appendChild now marks the shape's layer dirty, so an
  // appended-but-never-mutated shape paints on the next draw (no poke needed).
  // (Was the "[known issue] appendChild alone does not paint" tripwire.)
  it("appendChild alone paints on the next draw", () => {
    const { stage, layers } = createStage({ layers: 2 })
    const strokeRect = vi.spyOn(layers[0].getContext("2d")!, "strokeRect")
    stage.tools.appendChild({
      className: "r",
      shape: new Rectangle({
        x: 0,
        y: 0,
        width: 4,
        height: 4,
        strokeConfig: { color: rgba(1, 1, 1), lineWidth: 1 },
      }),
    })
    stage.draw({})
    expect(strokeRect).toHaveBeenCalledWith(0, 0, 4, 4)
  })

  it("appends, culls, and hits Path through the public scene API", () => {
    const { stage } = createStage({ layers: 1 })
    stage.tools.appendChild({
      className: "path",
      shape: new Path({
        points: [new Point({ x: 10, y: 10 }), new Point({ x: 40, y: 10 })],
        strokeConfig: { lineWidth: 8 },
      }),
    })

    expect(() => stage.draw({})).not.toThrow()
    expect(stage.tools.getContainPointChildren({
      selector: ".path",
      point: { x: 25, y: 12 },
      returnFirst: true,
      withRoot: false,
    })).toHaveLength(1)
  })

  // Refactor: refresh() used to be a silent no-op (it passed the now-deleted
  // dead `draw({ forceDraw })` flag). It now forceUpdates every layer, so it
  // repaints even when nothing is dirty — while a plain draw() still doesn't.
  it("refresh() forces a repaint of all layers (and dirty-tracking still holds)", () => {
    const { stage, layers } = createStage({ layers: 2 })
    stage.tools.appendChild({
      className: "r",
      shape: new Rectangle({ x: 1, y: 1, width: 2, height: 2, strokeConfig: { color: rgba(1, 1, 1), lineWidth: 1 } }),
    })
    stage.draw({}) // paints once (append marked the layer dirty)
    const strokeRect = vi.spyOn(layers[0].getContext("2d")!, "strokeRect")
    stage.draw({}) // nothing dirty → no repaint
    expect(strokeRect).not.toHaveBeenCalled()
    stage.tools.refresh() // forces all layers → repaints
    expect(strokeRect).toHaveBeenCalledWith(1, 1, 2, 2)
  })

  it("repaints every layer with the same viewport transform without mutating geometry", () => {
    const { stage, layers } = createStage({ width: 200, height: 100, layers: 2 })
    const shape = new Rectangle({
      x: 20,
      y: 10,
      width: 30,
      height: 20,
      layer: 1,
      strokeConfig: { color: rgba(1, 1, 1), lineWidth: 1 },
    })
    stage.tools.appendChild({ className: "viewport-shape", shape })
    stage.draw({})
    const transforms = layers.map((layer) => vi.spyOn(layer.getContext("2d")!, "setTransform"))

    stage.tools.viewport.restore({ x: 15, y: -5, scale: 2 })
    const result = stage.draw({})

    expect(result.updatedLayers).toEqual([0, 1])
    transforms.forEach((transform) => {
      expect(transform).toHaveBeenCalledWith(2, 0, 0, 2, 15, -5)
    })
    expect(shape).toMatchObject({ x: 20, y: 10, width: 30, height: 20 })
  })

  it("uses the visible Content area for culling after a viewport change", () => {
    const { stage, layers } = createStage({ width: 200, height: 100, layers: 1 })
    const strokeRect = vi.spyOn(layers[0].getContext("2d")!, "strokeRect")
    stage.tools.appendChild({
      className: "distant-shape",
      shape: new Rectangle({
        x: 500,
        y: 20,
        width: 30,
        height: 20,
        strokeConfig: { color: rgba(1, 1, 1), lineWidth: 1 },
      }),
    })

    stage.draw({})
    expect(strokeRect).not.toHaveBeenCalled()
    stage.tools.viewport.panBy({ x: -400, y: 0 })
    stage.draw({})

    expect(strokeRect).toHaveBeenCalledWith(500, 20, 30, 20)
  })
})

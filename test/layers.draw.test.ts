// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { Rectangle } from "react-stay-canvas"
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

  // KNOWN FOOTGUN (characterization tripwire): appendChild does NOT mark the
  // layer dirty, so an appended-but-never-mutated shape never renders. The
  // refactor should make append mark dirty — when it does, flip this test.
  it("[known issue] appendChild alone does not paint", () => {
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
    expect(strokeRect).not.toHaveBeenCalled()
  })
})

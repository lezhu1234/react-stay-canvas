// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"

import { Rectangle } from "react-stay-canvas"
import { executeCanvas2DRenderPlan } from "../src/stay/rendering/canvas2DExecutor"
import { createLayerRenderPlan } from "../src/stay/rendering/renderPlan"
import { createFiniteProjectiveMapping } from "../src/stay/transforms/projective2D"
import { createStage } from "./helpers/stage"

const red = { r: 230, g: 60, b: 40, a: 1 }

function perspectivePlane() {
  return createFiniteProjectiveMapping({
    m00: 1.1, m01: 0, m02: 20,
    m10: 0.1, m11: 1, m12: 20,
    m20: 0.005, m21: 0, m22: 1,
  }, { x: 0, y: 0, width: 80, height: 60 })
}

describe("internal Canvas2D projective rendering slice", () => {
  it("rasterizes one Shape once and projects its mesh in Content space", () => {
    const { stage, layers } = createStage({ width: 140, height: 120, layers: 1 })
    const shape = new Rectangle({
      x: 0,
      y: 0,
      width: 80,
      height: 60,
      fillConfig: { color: red },
    })
    const draw = vi.spyOn(shape, "draw")
    const child = stage.tools.appendChild({
      className: "projected-plane",
      shape,
      placement: { type: "affine", x: 500, y: 500 },
    })
    const mapping = perspectivePlane()
    const plan = createLayerRenderPlan(
      [child],
      0,
      { x: 0, y: 0, width: 140, height: 120 },
      () => ({ mapping })
    )

    executeCanvas2DRenderPlan({
      context: layers[0].getContext("2d")!,
      items: plan.items,
      getNow: () => 12,
      width: 140,
      height: 120,
      forceDraw: true,
      getProjectiveQuality: () => ({
        mesh: { columns: 8, rows: 6 },
        rasterScale: 2,
      }),
    })

    expect(plan.items).toHaveLength(1)
    expect(plan.items[0].projection?.mapping).toBe(mapping)
    expect(draw).toHaveBeenCalledOnce()
    expect(layers[0].getContext("2d")!.getImageData(50, 45, 1, 1).data[3])
      .toBeGreaterThan(0)
    expect(layers[0].getContext("2d")!.getImageData(110, 100, 1, 1).data[3])
      .toBe(0)
    expect(shape).toMatchObject({ x: 0, y: 0, width: 80, height: 60 })
    stage.destroy()
  })

  it("keeps global Shape ordering across affine and projective items", () => {
    const { stage, layers } = createStage({ width: 140, height: 120, layers: 1 })
    const order: string[] = []
    const affine = stage.tools.appendChild({
      className: "affine",
      shape: new Rectangle({
        x: 5, y: 5, width: 20, height: 20, zIndex: 1,
        stateDrawFuncMap: { default: { afterDraw: () => order.push("affine") } },
      }),
    })
    const projected = stage.tools.appendChild({
      className: "projected",
      shape: new Rectangle({
        x: 0, y: 0, width: 80, height: 60, zIndex: 2,
        stateDrawFuncMap: { default: { afterDraw: () => order.push("projected") } },
      }),
    })
    const mapping = perspectivePlane()
    const plan = createLayerRenderPlan(
      [projected, affine],
      0,
      undefined,
      (child) => child === projected
        ? { mapping }
        : undefined
    )

    executeCanvas2DRenderPlan({
      context: layers[0].getContext("2d")!,
      items: plan.items,
      getNow: () => 0,
      width: 140,
      height: 120,
      forceDraw: true,
      getProjectiveQuality: () => ({
        mesh: { columns: 2, rows: 2 },
        rasterScale: 1,
      }),
    })

    expect(order).toEqual(["affine", "projected"])
    stage.destroy()
  })

  it("culls a projected item by its projected plane instead of its affine Child bound", () => {
    const { stage } = createStage({ width: 140, height: 120, layers: 1 })
    const child = stage.tools.appendChild({
      className: "projected",
      shape: new Rectangle({ x: 0, y: 0, width: 80, height: 60 }),
      placement: { type: "affine", x: 500, y: 500 },
    })
    const mapping = perspectivePlane()
    const resolver = () => ({ mapping })

    expect(createLayerRenderPlan(
      [child], 0, { x: 0, y: 0, width: 140, height: 120 }, resolver
    ).items).toHaveLength(1)
    expect(createLayerRenderPlan(
      [child], 0, { x: 300, y: 300, width: 50, height: 50 }, resolver
    ).items).toHaveLength(0)
    stage.destroy()
  })

  it("requires caller-owned mesh and raster budgets and rejects unsupported compositing", () => {
    const { stage, layers } = createStage({ width: 140, height: 120, layers: 1 })
    const shape = new Rectangle({
      x: 0,
      y: 0,
      width: 80,
      height: 60,
      globalConfig: { gco: "destination-out" },
    })
    const child = stage.tools.appendChild({ className: "projected", shape })
    const mapping = perspectivePlane()
    const plan = createLayerRenderPlan(
      [child], 0, undefined,
      () => ({ mapping })
    )
    const props = {
      context: layers[0].getContext("2d")!,
      items: plan.items,
      getNow: () => 0,
      width: 140,
      height: 120,
      forceDraw: true,
    }

    expect(() => executeCanvas2DRenderPlan(props))
      .toThrow("requires explicit quality")
    expect(() => executeCanvas2DRenderPlan({
      ...props,
      getProjectiveQuality: () => ({
        mesh: { columns: 2, rows: 2 },
        rasterScale: 1,
      }),
    })).toThrow("currently supports source-over Shapes")

    shape.globalConfig.gco = "source-over"
    expect(() => executeCanvas2DRenderPlan({
      ...props,
      getProjectiveQuality: () => ({
        mesh: { columns: 2, rows: 2 },
        rasterScale: 0,
      }),
    })).toThrow("projective raster scale must be finite and greater than 0")
    const invalidMesh = createLayerRenderPlan(
      [child], 0, undefined,
      () => ({ mapping })
    )
    expect(() => executeCanvas2DRenderPlan({
      ...props,
      items: invalidMesh.items,
      getProjectiveQuality: () => ({
        mesh: { columns: 0, rows: 2 },
        rasterScale: 1,
      }),
    })).toThrow("projective mesh columns must be a positive integer")
    stage.destroy()
  })

  it("restores the target context and propagates Shape failures", () => {
    const { stage, layers } = createStage({ width: 140, height: 120, layers: 1 })
    const failure = new Error("projected Shape failed")
    const shape = new Rectangle({
      x: 0,
      y: 0,
      width: 80,
      height: 60,
      stateDrawFuncMap: {
        default: { commonDraw: () => { throw failure } },
      },
    })
    const child = stage.tools.appendChild({ className: "projected", shape })
    const plan = createLayerRenderPlan(
      [child], 0, undefined,
      () => ({ mapping: perspectivePlane() })
    )
    const context = layers[0].getContext("2d")!
    context.globalAlpha = 0.35
    const targetAlpha = context.globalAlpha

    expect(() => executeCanvas2DRenderPlan({
      context,
      items: plan.items,
      getNow: () => 0,
      width: 140,
      height: 120,
      forceDraw: true,
      getProjectiveQuality: () => ({
        mesh: { columns: 2, rows: 2 },
        rasterScale: 1,
      }),
    })).toThrow(failure)
    expect(context.globalAlpha).toBe(targetAlpha)
    stage.destroy()
  })
})

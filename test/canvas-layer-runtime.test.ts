// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import { Canvas } from "../src/canvas"

describe("Canvas2D layer runtime", () => {
  it("restores setter-owned context state when a layer frame fails", () => {
    const element = document.createElement("canvas")
    const canvas = new Canvas(
      [element],
      [(layer) => {
        const context = layer.getContext("2d")
        context?.setTransform(2, 0, 0, 3, 7, 11)
        return context
      }],
      200,
      120
    )
    const context = canvas.contexts[0] as CanvasRenderingContext2D
    const failure = new Error("frame failed")

    expect(() => canvas.withLayerFrame(
      0,
      { offsetX: 13, offsetY: 17, scale: 1.5 },
      () => { throw failure }
    )).toThrow(failure)

    expect(context.getTransform()).toMatchObject({
      a: 2,
      b: 0,
      c: 0,
      d: 3,
      e: 7,
      f: 11,
    })
  })
})

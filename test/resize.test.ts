// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { Rectangle } from "react-stay-canvas"
import { createStage, md, mm } from "./helpers/stage"

describe("non-destructive resize", () => {
  it("preserves Content geometry, Child identity, viewport, and history", () => {
    const { stage, layers } = createStage({ width: 300, height: 200 })
    const child = stage.tools.appendChild({
      id: "shape",
      className: "shape",
      shape: new Rectangle({ x: 20, y: 30, width: 80, height: 50 }),
      transform: { x: 7, y: 9, rotate: 12 },
    })
    stage.tools.log()
    child.shape.move(15, 5)
    stage.tools.log()
    const viewport = stage.tools.viewport.restore({ x: 18, y: 24, scale: 1.75 })
    const transform = child.transform
    const rootBound = stage.rootChild.getBound()
    const stackLength = stage.stack.length
    const stackIndex = stage.stackIndex

    stage.resize(640, 360)

    expect(stage.width).toBe(640)
    expect(stage.height).toBe(360)
    expect(stage.root.width).toBe(640)
    expect(stage.root.height).toBe(360)
    expect(stage.tools.getChildById("shape")).toBe(child)
    expect(child.shape.getBound()).toEqual({ x: 35, y: 35, width: 80, height: 50 })
    expect(child.transform).toEqual(transform)
    expect(stage.tools.viewport.get()).toEqual(viewport)
    expect(stage.rootChild.getBound()).toEqual(rootBound)
    expect(stage.stack).toHaveLength(stackLength)
    expect(stage.stackIndex).toBe(stackIndex)
    layers.forEach((layer) => {
      expect(layer.style.width).toBe("640px")
      expect(layer.style.height).toBe("360px")
      expect(layer.width).toBe(640 * window.devicePixelRatio)
      expect(layer.height).toBe(360 * window.devicePixelRatio)
    })

    stage.tools.undo()
    expect(stage.tools.getChildById<Rectangle>("shape")!.shape.getBound()).toEqual({
      x: 20,
      y: 30,
      width: 80,
      height: 50,
    })
  })

  it("keeps the current AnimatedChild frame and redraws with the new surface size", () => {
    const { stage } = createStage({ width: 300, height: 200 })
    const animated = stage.tools.createChild({ id: "animated", className: "animated" })
    animated.appendKeyFrame(
      "default",
      new Rectangle({
        x: 10,
        y: 20,
        width: 80,
        height: 40,
        fillConfig: { color: { r: 40, g: 80, b: 160, a: 1 } },
        transition: { durationMs: 300 },
      }),
    )
    stage.tools.progress({ timeMs: 150 })
    const frame = animated.shapeMap.get("default")!
    const drawSizes: Array<{ width: number; height: number }> = []
    frame.stateDrawFuncMap.default.afterDraw = ({ width, height }) => {
      drawSizes.push({ width, height })
    }

    stage.resize(640, 360)
    stage.draw({ now: 150 })

    expect(stage.tools.getChildById("animated")).toBe(animated)
    expect(animated.shapeMap.get("default")).toBe(frame)
    expect(drawSizes).toEqual([{ width: 640, height: 360 }])
  })

  it("uses the latest View size when fit is explicitly called after resize", () => {
    const { stage } = createStage({ width: 300, height: 200 })
    const bounds = { x: 0, y: 0, width: 100, height: 100 }

    expect(stage.tools.viewport.fit(bounds)).toEqual({ x: 50, y: 0, scale: 2 })
    stage.resize(600, 300)
    expect(stage.tools.viewport.get()).toEqual({ x: 50, y: 0, scale: 2 })
    expect(stage.tools.viewport.fit(bounds)).toEqual({ x: 150, y: 0, scale: 3 })
  })

  it("cancels an active pointer session before changing the View frame", () => {
    const { stage, top } = createStage({ width: 300, height: 200 })
    const terminal: Array<{
      cancelled?: boolean
      point?: { x: number; y: number }
      reason?: string
      surfaceWidth: number
    }> = []

    stage.addEventListener({
      name: "resize-terminal",
      event: "dragend",
      callback: ({ e }) => terminal.push({
        cancelled: e.cancelled,
        point: e.point,
        reason: e.cancelReason,
        surfaceWidth: stage.root.width,
      }),
    })

    top.dispatchEvent(md(20, 20))
    top.dispatchEvent(mm(70, 45))
    stage.resize(600, 400)

    expect(terminal).toEqual([{
      cancelled: true,
      point: { x: 70, y: 45 },
      reason: "resize",
      surfaceWidth: 300,
    }])
    expect(stage.root.width).toBe(600)
  })
})

// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"

import { projectivePlacementFromQuad, Rectangle } from "react-stay-canvas"
import { Canvas } from "../src/canvas"
import type { WebGLLayerConfig } from "../src/types/canvas"
import { createStage } from "./helpers/stage"
import { createRecordingWebGLContext } from "./helpers/webgl"

describe("public WebGL layer backend", () => {
  it("dispatches one mixed RenderPlan through an explicitly configured WebGL layer", () => {
    let gl: ReturnType<typeof createRecordingWebGLContext> | undefined
    const { stage, layers } = createStage({
      width: 240,
      height: 160,
      layers: [{
        backend: "webgl",
        context: (canvas) => {
          gl = createRecordingWebGLContext(canvas)
          return gl.context
        },
      }],
    })
    stage.tools.appendChild({
      className: "affine",
      shape: new Rectangle({ x: 8, y: 10, width: 40, height: 30 }),
    })
    stage.tools.appendChild({
      className: "projective",
      shape: new Rectangle({ x: 0, y: 0, width: 80, height: 60 }),
      placement: projectivePlacementFromQuad(
        { x: 0, y: 0, width: 80, height: 60 },
        {
          topLeft: { x: 70, y: 20 },
          topRight: { x: 190, y: 34 },
          bottomRight: { x: 175, y: 130 },
          bottomLeft: { x: 58, y: 112 },
        }
      ),
    })

    const result = stage.draw({ now: 1 })

    expect(result.updatedLayers).toEqual([0])
    expect(stage.root.getLayerBackend(0)).toBe("webgl")
    expect(stage.root.contexts[0]).toBe(gl?.context)
    expect(gl?.spies.drawElements).toHaveBeenCalledTimes(2)
    expect(gl?.spies.texImage2D).toHaveBeenCalledTimes(2)
    expect(layers[0].style.width).toBe("240px")
    expect(layers[0].style.height).toBe("160px")
  })

  it("lets the caller choose restoration while pausing and invalidating the lost layer", () => {
    let gl: ReturnType<typeof createRecordingWebGLContext> | undefined
    const onContextLost = vi.fn((event: WebGLContextEvent) => event.preventDefault())
    const onContextRestored = vi.fn()
    const config: WebGLLayerConfig = {
      backend: "webgl",
      context: (canvas) => {
        gl ??= createRecordingWebGLContext(canvas)
        return gl.context
      },
      onContextLost,
      onContextRestored,
    }
    const { stage, layers } = createStage({ layers: [config] })
    const child = stage.tools.appendChild({
      className: "shape",
      shape: new Rectangle({ x: 10, y: 12, width: 40, height: 30 }),
    })
    stage.draw({ now: 1 })
    const drawsBeforeLoss = gl!.spies.drawElements.mock.calls.length

    gl!.setLost(true)
    const lost = new Event("webglcontextlost", { cancelable: true })
    layers[0].dispatchEvent(lost)
    child.shape.update({ x: 24 })

    expect(lost.defaultPrevented).toBe(true)
    expect(onContextLost).toHaveBeenCalledOnce()
    expect(stage.draw({ now: 2 }).updatedLayers).toEqual([])
    expect(gl!.spies.drawElements).toHaveBeenCalledTimes(drawsBeforeLoss)

    gl!.setLost(false)
    layers[0].dispatchEvent(new Event("webglcontextrestored"))
    expect(onContextRestored).toHaveBeenCalledOnce()
    expect(stage.draw({ now: 3 }).updatedLayers).toEqual([0])
    expect(gl!.spies.drawElements.mock.calls.length).toBeGreaterThan(drawsBeforeLoss)

    stage.destroy()
    layers[0].dispatchEvent(new Event("webglcontextlost", { cancelable: true }))
    layers[0].dispatchEvent(new Event("webglcontextrestored"))
    expect(onContextLost).toHaveBeenCalledOnce()
    expect(onContextRestored).toHaveBeenCalledOnce()
  })

  it("restarts the render loop when a context lost during a pass is restored", () => {
    const frames: FrameRequestCallback[] = []
    let gl: ReturnType<typeof createRecordingWebGLContext> | undefined
    const { stage, layers } = createStage({
      layers: [{
        backend: "webgl",
        context: (canvas) => {
          gl ??= createRecordingWebGLContext(canvas)
          return gl.context
        },
        onContextLost: (event) => event.preventDefault(),
      }],
      raf: (callback) => {
        frames.push(callback)
        return frames.length
      },
    })
    stage.tools.appendChild({
      className: "shape",
      shape: new Rectangle({ x: 10, y: 12, width: 40, height: 30 }),
    })
    gl!.spies.drawElements.mockImplementationOnce(() => gl!.setLost(true))

    const failedFrame = frames.shift()!
    expect(() => failedFrame(16)).toThrow("context is lost")
    const drawsBeforeRestore = gl!.spies.drawElements.mock.calls.length
    layers[0].dispatchEvent(new Event("webglcontextlost", { cancelable: true }))
    gl!.setLost(false)
    layers[0].dispatchEvent(new Event("webglcontextrestored"))

    expect(gl!.spies.drawElements.mock.calls.length).toBeGreaterThan(drawsBeforeRestore)
    expect(frames.length).toBeGreaterThan(0)
  })

  it("fails initialization instead of silently falling back to Canvas2D", () => {
    expect(() => createStage({
      layers: [{ backend: "webgl", context: () => null }],
    })).toThrow("Unable to get WebGL context for layer 0")
    expect(() => createStage({
      layers: [{ backend: "webgpu" } as never],
    })).toThrow("Unsupported Canvas backend for layer 0")

    const first = document.createElement("canvas")
    const second = document.createElement("canvas")
    const onContextLost = vi.fn()
    expect(() => new Canvas(
      [first, second],
      [
        {
          backend: "webgl",
          context: (canvas) => createRecordingWebGLContext(canvas).context,
          onContextLost,
        },
        { backend: "webgpu" } as never,
      ],
      100,
      80
    )).toThrow("Unsupported Canvas backend for layer 1")
    first.dispatchEvent(new Event("webglcontextlost", { cancelable: true }))
    expect(onContextLost).not.toHaveBeenCalled()

    const third = document.createElement("canvas")
    const fourth = document.createElement("canvas")
    expect(() => new Canvas(
      [third, fourth],
      [
        {
          backend: "webgl",
          context: (canvas) => createRecordingWebGLContext(canvas).context,
          onContextLost,
        },
        () => null,
      ],
      100,
      80
    )).toThrow("Unable to get drawing context for layer 1")
    third.dispatchEvent(new Event("webglcontextlost", { cancelable: true }))
    expect(onContextLost).not.toHaveBeenCalled()
  })
})

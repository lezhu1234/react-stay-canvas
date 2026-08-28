// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"

import {
  AmbientLight,
  DirectionalLight,
  LambertMaterial,
  Mesh,
  PerspectiveCamera,
  Rectangle,
  Root,
  UnlitMaterial,
  type WebGL2LayerConfig,
} from "react-stay-canvas"
import { Canvas } from "../src/canvas"
import { createStage } from "./helpers/stage"
import { createRecordingWebGL2Context } from "./helpers/webgl"

const triangle = () => ({
  positions: [-0.8, -0.8, 0, 0.8, -0.8, 0, 0, 0.8, 0],
  indices: [0, 1, 2],
})

const litTriangle = () => ({
  ...triangle(),
  normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
})

const camera = () => new PerspectiveCamera({
  position: [0, 0, 3],
  target: [0, 0, 0],
  near: 0.1,
  far: 20,
})

const unlit = (color: readonly [number, number, number, number]) =>
  new UnlitMaterial({ color })

describe("public native WebGL2 layer backend", () => {
  it("renders Mesh children with persistent GPU resources", () => {
    let gl: ReturnType<typeof createRecordingWebGL2Context> | undefined
    const sceneCamera = camera()
    const { stage, layers } = createStage({
      width: 240,
      height: 160,
      layers: [{
        backend: "webgl2",
        camera: sceneCamera,
        context: (canvas) => {
          gl ??= createRecordingWebGL2Context(canvas)
          return gl.context
        },
      }],
    })
    const mesh = new Mesh({ geometry: triangle(), material: unlit([0.2, 0.5, 0.9, 1]) })
    stage.tools.webgl.appendChild({ className: "native-plane", layer: 0, meshes: [mesh] })

    expect(stage.draw({ now: 1 }).updatedLayers).toEqual([0])
    expect(stage.root.getLayerBackend(0)).toBe("webgl2")
    expect(stage.root.contexts[0]).toBe(gl?.context)
    expect(gl?.spies.drawElements).toHaveBeenCalledOnce()
    expect(gl?.spies.texImage2D).not.toHaveBeenCalled()
    expect(gl?.spies.createProgram).toHaveBeenCalledOnce()
    expect(gl?.spies.createBuffer).toHaveBeenCalledTimes(3)
    expect(gl?.spies.createVertexArray).toHaveBeenCalledOnce()

    mesh.setMaterial(unlit([0.9, 0.3, 0.2, 1]))
    expect(stage.draw({ now: 2 }).updatedLayers).toEqual([0])
    expect(gl?.spies.createProgram).toHaveBeenCalledOnce()
    expect(gl?.spies.createBuffer).toHaveBeenCalledTimes(3)
    expect(gl?.spies.bufferData).toHaveBeenCalledTimes(3)

    sceneCamera.setPose([0.2, 0, 3], [0, 0, 0])
    expect(stage.draw({ now: 3 }).updatedLayers).toEqual([0])
    stage.resize(320, 180)
    expect(stage.draw({ now: 4 }).updatedLayers).toEqual([0])
    expect(gl?.spies.createProgram).toHaveBeenCalledOnce()
    expect(layers[0].style.width).toBe("320px")
    expect(layers[0].style.height).toBe("180px")
  })

  it("maps layer-owned Light changes onto dirtiness without uploading geometry", () => {
    let gl: ReturnType<typeof createRecordingWebGL2Context> | undefined
    const ambient = new AmbientLight({ intensity: 0.3 })
    const key = new DirectionalLight({
      directionToLight: [0, 0, 1],
      intensity: 0.8,
    })
    const { stage } = createStage({
      layers: [{
        backend: "webgl2",
        camera: camera(),
        lights: [ambient, key],
        context: (canvas) => {
          gl ??= createRecordingWebGL2Context(canvas)
          return gl.context
        },
      }],
    })
    stage.tools.webgl.appendChild({
      className: "lit-plane",
      layer: 0,
      meshes: [new Mesh({
        geometry: litTriangle(),
        material: new LambertMaterial({ color: [0.3, 0.6, 0.9, 1] }),
      })],
    })

    stage.draw({ now: 1 })
    key.setDirectionToLight([0.4, 0.2, 1])
    expect(stage.draw({ now: 2 }).updatedLayers).toEqual([0])
    key.setShadow({ target: [0, 0, 0], width: 6, height: 4 })
    expect(stage.draw({ now: 2.5 }).updatedLayers).toEqual([0])
    ambient.setIntensity(0.45)
    expect(stage.draw({ now: 3 }).updatedLayers).toEqual([0])
    expect(gl?.spies.bufferData).toHaveBeenCalledTimes(3)

    stage.destroy()
    key.setIntensity(0.5)
    ambient.setColor([0.9, 0.9, 1])
  })

  it("rejects Children assigned to the wrong backend or layer", () => {
    let gl: ReturnType<typeof createRecordingWebGL2Context> | undefined
    const { stage } = createStage({
      layers: [
        { backend: "canvas2d" },
        {
          backend: "webgl2",
          camera: camera(),
          context: (canvas) => {
            gl ??= createRecordingWebGL2Context(canvas)
            return gl.context
          },
        },
      ],
    })

    const rejectedShape = new Rectangle({ x: 0, y: 0, width: 10, height: 10, layer: 1 })
    expect(() => stage.tools.appendChild({
      className: "wrong-shape",
      shape: rejectedShape,
    })).toThrow("Canvas2D Child")
    expect(rejectedShape.parent).toBeUndefined()

    const rejectedRoot = new Root({ x: 0, y: 0, width: 10, height: 10, layer: 1 })
    expect(() => stage.tools.appendChild({
      className: "user-root-shape",
      shape: rejectedRoot,
    })).toThrow("Canvas2D Child")
    expect(rejectedRoot.parent).toBeUndefined()

    const acceptedShape = new Rectangle({ x: 0, y: 0, width: 10, height: 10, layer: 0 })
    stage.tools.appendChild({ className: "shape", shape: acceptedShape })
    expect(() => acceptedShape.update({ layer: 1 })).toThrow("Canvas2D Child")
    expect(acceptedShape.layer).toBe(0)

    const animated = stage.tools.createChild({ className: "animated-shape" })
    const rejectedFrame = new Rectangle({ x: 0, y: 0, width: 10, height: 10, layer: 1 })
    expect(() => animated.appendKeyFrame("shape", rejectedFrame)).toThrow("Canvas2D Child")
    expect(rejectedFrame.parent).toBeUndefined()

    const aliasedFrame = new Rectangle({ x: 0, y: 0, width: 10, height: 10, layer: -2 })
    const laterRejectedFrame = new Rectangle({ x: 0, y: 0, width: 10, height: 10, layer: 1 })
    expect(() => animated.replaceSlice("shape", [aliasedFrame, laterRejectedFrame]))
      .toThrow("Canvas2D Child")
    expect(aliasedFrame.layer).toBe(-2)
    expect(aliasedFrame.parent).toBeUndefined()
    expect(() => stage.tools.webgl.appendChild({
      className: "wrong-mesh",
      layer: 0,
      meshes: [new Mesh({ geometry: triangle() })],
    })).toThrow("cannot target layer 0")

    const child = stage.tools.webgl.appendChild({
      className: "native",
      layer: 1,
      meshes: [new Mesh({ geometry: triangle() })],
    })
    expect(() => child.setLayer(2)).toThrow("cannot target layer 2")
    expect(child.layer).toBe(1)
  })

  it("uses shared History and deep-owned scene transfer", () => {
    const config = () => {
      let gl: ReturnType<typeof createRecordingWebGL2Context> | undefined
      return {
        backend: "webgl2" as const,
        camera: camera(),
        context: (canvas: HTMLCanvasElement) => {
          gl ??= createRecordingWebGL2Context(canvas)
          return gl.context
        },
      }
    }
    const source = createStage({ layers: [config()] }).stage
    const mesh = new Mesh({
      geometry: triangle(),
      material: unlit([0.2, 0.5, 0.9, 1]),
      castShadow: true,
    })
    const child = source.tools.webgl.appendChild({
      id: "native-history",
      className: "native",
      layer: 0,
      meshes: [mesh],
    })
    source.tools.log()
    mesh.setMaterial(unlit([0.9, 0.2, 0.1, 1]))
    mesh.setCastShadow(false)
    mesh.setReceiveShadow(true)
    child.setClassName("native:edited")
    source.tools.log()

    source.tools.undo()
    expect(source.tools.webgl.getChildById(child.id)).toBe(child)
    expect(child.className).toBe("native")
    expect(child.meshes[0].getMaterial()).toEqual(unlit([0.2, 0.5, 0.9, 1]))
    expect(child.meshes[0].castShadow).toBe(true)
    expect(child.meshes[0].receiveShadow).toBe(false)
    source.tools.redo()
    expect(child.className).toBe("native:edited")
    expect(child.meshes[0].getMaterial()).toEqual(unlit([0.9, 0.2, 0.1, 1]))
    expect(child.meshes[0].castShadow).toBe(false)
    expect(child.meshes[0].receiveShadow).toBe(true)

    const fragment = source.tools.webgl.exportChildren([child])
    const target = createStage({ layers: [config()] }).stage
    const [imported] = target.tools.webgl.importChildren(fragment)
    expect(imported.id).not.toBe(child.id)
    expect(imported.className).toBe(child.className)
    expect(imported.meshes[0].castShadow).toBe(false)
    expect(imported.meshes[0].receiveShadow).toBe(true)
    imported.meshes[0].setMaterial(unlit([0, 1, 0, 1]))
    expect(child.meshes[0].getMaterial()).toEqual(unlit([0.9, 0.2, 0.1, 1]))
  })

  it("pauses on context loss and rebuilds resources after restore", () => {
    let gl: ReturnType<typeof createRecordingWebGL2Context> | undefined
    const onContextLost = vi.fn()
    const onContextRestored = vi.fn()
    const config: WebGL2LayerConfig = {
      backend: "webgl2",
      camera: camera(),
      context: (canvas) => {
        gl ??= createRecordingWebGL2Context(canvas)
        return gl.context
      },
      onContextLost,
      onContextRestored,
    }
    const { stage, layers } = createStage({ layers: [config] })
    const child = stage.tools.webgl.appendChild({
      className: "native",
      layer: 0,
      meshes: [new Mesh({ geometry: triangle() })],
    })
    stage.draw({ now: 1 })
    const programsBeforeLoss = gl!.spies.createProgram.mock.calls.length

    gl!.setLost(true)
    const lost = new Event("webglcontextlost", { cancelable: true })
    layers[0].dispatchEvent(lost)
    child.meshes[0].setMaterial(unlit([1, 0, 0, 1]))
    expect(stage.draw({ now: 2 }).updatedLayers).toEqual([])
    expect(lost.defaultPrevented).toBe(true)

    gl!.setLost(false)
    layers[0].dispatchEvent(new Event("webglcontextrestored"))
    expect(stage.draw({ now: 3 }).updatedLayers).toEqual([0])
    expect(gl!.spies.createProgram).toHaveBeenCalledTimes(programsBeforeLoss + 1)
    expect(onContextLost).toHaveBeenCalledOnce()
    expect(onContextRestored).toHaveBeenCalledOnce()

    stage.tools.webgl.removeChild(child.id)
    stage.draw({ now: 4 })
    expect(gl!.spies.deleteBuffer).toHaveBeenCalledTimes(3)
    expect(gl!.spies.deleteVertexArray).toHaveBeenCalledOnce()

    stage.destroy()
    layers[0].dispatchEvent(new Event("webglcontextlost", { cancelable: true }))
    layers[0].dispatchEvent(new Event("webglcontextrestored"))
    expect(onContextLost).toHaveBeenCalledOnce()
    expect(onContextRestored).toHaveBeenCalledOnce()
  })

  it("restarts a failed render loop after native context restoration", () => {
    const frames: FrameRequestCallback[] = []
    let gl: ReturnType<typeof createRecordingWebGL2Context> | undefined
    const { stage, layers } = createStage({
      layers: [{
        backend: "webgl2",
        camera: camera(),
        context: (canvas) => {
          gl ??= createRecordingWebGL2Context(canvas)
          return gl.context
        },
      }],
      raf: (callback) => {
        frames.push(callback)
        return frames.length
      },
    })
    stage.tools.webgl.appendChild({
      className: "native",
      layer: 0,
      meshes: [new Mesh({ geometry: triangle() })],
    })
    gl!.spies.drawElements.mockImplementationOnce(() => gl!.setLost(true))

    const failedFrame = frames.shift()!
    expect(() => failedFrame(16)).toThrow("context is lost")
    const drawsBeforeRestore = gl!.spies.drawElements.mock.calls.length
    const lost = new Event("webglcontextlost", { cancelable: true })
    layers[0].dispatchEvent(lost)
    expect(lost.defaultPrevented).toBe(true)
    gl!.setLost(false)
    layers[0].dispatchEvent(new Event("webglcontextrestored"))

    expect(gl!.spies.drawElements.mock.calls.length).toBeGreaterThan(drawsBeforeRestore)
    expect(frames.length).toBeGreaterThan(0)
  })

  it("keeps a layer paused when context restoration fails", () => {
    let gl: ReturnType<typeof createRecordingWebGL2Context> | undefined
    let contextRequests = 0
    const { stage, layers } = createStage({
      layers: [{
        backend: "webgl2",
        camera: camera(),
        context: (canvas) => {
          contextRequests += 1
          gl ??= createRecordingWebGL2Context(canvas)
          return contextRequests === 1 ? gl.context : null
        },
      }],
    })
    const mesh = new Mesh({ geometry: triangle() })
    stage.tools.webgl.appendChild({ className: "native", layer: 0, meshes: [mesh] })
    stage.draw({ now: 1 })

    gl!.setLost(true)
    layers[0].dispatchEvent(new Event("webglcontextlost", { cancelable: true }))
    mesh.setMaterial(unlit([1, 0, 0, 1]))
    gl!.setLost(false)
    const errors: Error[] = []
    const captureError = (event: ErrorEvent) => {
      event.preventDefault()
      errors.push(event.error)
    }
    window.addEventListener("error", captureError, { once: true })
    layers[0].dispatchEvent(new Event("webglcontextrestored"))

    expect(errors[0]?.message).toContain("Unable to get WebGL2 context")
    expect(stage.draw({ now: 2 }).updatedLayers).toEqual([])
  })

  it("shares identity, state, listener, and DOM input infrastructure", () => {
    let gl: ReturnType<typeof createRecordingWebGL2Context> | undefined
    const { stage, top } = createStage({
      layers: [{
        backend: "webgl2",
        camera: camera(),
        context: (canvas) => {
          gl ??= createRecordingWebGL2Context(canvas)
          return gl.context
        },
      }],
    })
    const callback = vi.fn()
    stage.addEventListener({
      name: "root-input",
      selector: ".stay-canvas",
      event: "mousedown",
      state: "editing",
      callback,
    })
    stage.tools.switchState("editing")
    stage.tools.webgl.appendChild({
      id: "shared-id",
      className: "native",
      layer: 0,
      meshes: [new Mesh({ geometry: triangle() })],
    })
    expect(() => stage.tools.appendChild({
      id: "shared-id",
      className: "shape",
      shape: new Rectangle({ x: 0, y: 0, width: 10, height: 10 }),
    })).toThrow("already exists")

    top.dispatchEvent(new MouseEvent("mousedown", {
      clientX: 20,
      clientY: 20,
      button: 0,
      bubbles: true,
    }))
    expect(callback).toHaveBeenCalledOnce()
    expect(stage.state).toBe("editing")
  })

  it("fails WebGL2 initialization without fallback and cleans partial layers", () => {
    const failedConfig: WebGL2LayerConfig = {
      backend: "webgl2",
      camera: camera(),
      context: () => null,
    }
    expect(() => createStage({ layers: [failedConfig] }))
      .toThrow("Unable to get WebGL2 context for layer 0")
    expect(() => createStage({ layers: [{ backend: "webgpu" } as never] }))
      .toThrow("Unsupported Canvas backend for layer 0")
    expect(() => createStage({ layers: [{
      backend: "webgl2",
      camera: camera(),
      lights: Array.from({ length: 5 }, () => new DirectionalLight({
        directionToLight: [0, 0, 1],
      })),
    }] })).toThrow("supports at most 4 directional lights")
    expect(() => createStage({ layers: [{
      backend: "webgl2",
      camera: camera(),
      lights: [
        new DirectionalLight({ directionToLight: [0.2, 0.4, 1], shadow: {} }),
        new DirectionalLight({ directionToLight: [-0.2, 0.4, 1], shadow: {} }),
      ],
    }] })).toThrow("at most one shadow-casting directional light")

    const first = document.createElement("canvas")
    const second = document.createElement("canvas")
    const onContextLost = vi.fn()
    expect(() => new Canvas(
      [first, second],
      [
        {
          backend: "webgl2",
          camera: camera(),
          context: (canvas) => createRecordingWebGL2Context(canvas).context,
          onContextLost,
        },
        { backend: "webgpu" } as never,
      ],
      100,
      80
    )).toThrow("Unsupported Canvas backend for layer 1")
    first.dispatchEvent(new Event("webglcontextlost", { cancelable: true }))
    expect(onContextLost).not.toHaveBeenCalled()
  })
})

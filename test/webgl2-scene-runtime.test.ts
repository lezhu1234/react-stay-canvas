// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import {
  identityMatrix4,
  translationMatrix4,
} from "../src/stay/webgl2/math3D"
import { Mesh } from "../src/stay/webgl2/mesh"
import { PerspectiveCamera } from "../src/stay/webgl2/perspectiveCamera"
import { WebGL2SceneRuntime } from "../src/stay/webgl2/sceneRuntime"
import {
  createRecordingWebGL2Context,
  createRecordingWebGLContext,
} from "./helpers/webgl"

const triangle = (z = 0) => ({
  positions: [
    -0.8, -0.8, z,
    0.8, -0.8, z,
    0, 0.8, z,
  ],
  indices: [0, 1, 2],
})

const camera = () => new PerspectiveCamera({
  position: [0, 0, 3],
  target: [0, 0, 0],
  near: 0.1,
  far: 20,
})

describe("internal WebGL2 scene runtime", () => {
  it("rejects a WebGL1 context instead of falling back", () => {
    const canvas = document.createElement("canvas")
    const gl = createRecordingWebGLContext(canvas)

    expect(() => new WebGL2SceneRuntime(gl.context as never))
      .toThrow("requires a WebGL2 context")
  })

  it("keeps Mesh geometry and transform in CPU-owned state", () => {
    const positions = triangle().positions
    const modelMatrix = identityMatrix4()
    const mesh = new Mesh({
      geometry: { positions, indices: [0, 1, 2] },
      modelMatrix,
      color: [0.1, 0.2, 0.3, 1],
    })
    positions[0] = 99
    modelMatrix[12] = 99

    const snapshot = mesh.copyGeometrySnapshot()
    snapshot.positions[0] = 88
    expect(mesh.copyGeometrySnapshot().positions[0]).toBeCloseTo(-0.8)
    expect(mesh.getModelMatrix()[12]).toBe(0)
    expect(() => mesh.setGeometry({
      positions: triangle().positions,
      indices: [0, 1, 3],
    })).toThrow("outside its vertex range")
    expect(() => mesh.setModelMatrix([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      1e100, 0, 0, 1,
    ])).toThrow("exceeds Float32 range")
    expect(mesh.copyGeometrySnapshot().revision).toBe(0)
  })

  it("reuses program and mesh buffers until CPU geometry changes", () => {
    const canvas = document.createElement("canvas")
    canvas.width = 240
    canvas.height = 160
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const mesh = new Mesh({ geometry: triangle(), color: [0, 1, 0, 1] })

    runtime.render([mesh], camera())
    mesh.setModelMatrix(translationMatrix4(0.2, 0, 0))
    mesh.setColor([0, 0.8, 0.2, 1])
    runtime.render([mesh], camera())

    expect(gl.spies.createProgram).toHaveBeenCalledOnce()
    expect(gl.spies.createVertexArray).toHaveBeenCalledOnce()
    expect(gl.spies.createBuffer).toHaveBeenCalledTimes(2)
    expect(gl.spies.bufferData).toHaveBeenCalledTimes(2)
    expect(gl.spies.drawElements).toHaveBeenCalledTimes(2)

    mesh.setGeometry(triangle(-0.25))
    runtime.render([mesh], camera())
    expect(gl.spies.createVertexArray).toHaveBeenCalledOnce()
    expect(gl.spies.createBuffer).toHaveBeenCalledTimes(2)
    expect(gl.spies.bufferData).toHaveBeenCalledTimes(4)

    runtime.render([], camera())
    expect(gl.spies.deleteBuffer).toHaveBeenCalledTimes(2)
    expect(gl.spies.deleteVertexArray).toHaveBeenCalledOnce()
    runtime.dispose()
    expect(gl.spies.deleteProgram).toHaveBeenCalledOnce()
  })

  it("does not invalidate or upload equal CPU state", () => {
    const canvas = document.createElement("canvas")
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const mesh = new Mesh({ geometry: triangle(), color: [0, 1, 0, 1] })
    const changes: number[] = []
    mesh.subscribeChanges(() => changes.push(mesh.geometryRevision))

    runtime.render([mesh], camera())
    mesh.setGeometry(triangle())
    mesh.setModelMatrix(identityMatrix4())
    mesh.setColor([0, 1, 0, 1])
    runtime.render([mesh], camera())

    expect(changes).toEqual([])
    expect(mesh.geometryRevision).toBe(0)
    expect(gl.spies.bufferData).toHaveBeenCalledTimes(2)
    expect(gl.spies.drawElements).toHaveBeenCalledTimes(2)
    runtime.dispose()
  })

  it("discards a failed initial upload and retries from CPU geometry", () => {
    const canvas = document.createElement("canvas")
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const mesh = new Mesh({ geometry: triangle() })
    gl.spies.getError
      .mockReturnValueOnce(gl.spies.NO_ERROR)
      .mockReturnValueOnce(0x0505)
      .mockReturnValue(gl.spies.NO_ERROR)

    expect(() => runtime.render([mesh], camera()))
      .toThrow("Mesh geometry upload")
    expect(gl.spies.deleteBuffer).toHaveBeenCalledTimes(2)
    expect(gl.spies.deleteVertexArray).toHaveBeenCalledOnce()

    runtime.render([mesh], camera())
    expect(gl.spies.createVertexArray).toHaveBeenCalledTimes(2)
    expect(gl.spies.createBuffer).toHaveBeenCalledTimes(4)
    expect(gl.spies.bufferData).toHaveBeenCalledTimes(4)
    expect(gl.spies.drawElements).toHaveBeenCalledOnce()
    runtime.dispose()
  })

  it("retries a failed geometry update without advancing the GPU revision", () => {
    const canvas = document.createElement("canvas")
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const mesh = new Mesh({ geometry: triangle() })
    runtime.render([mesh], camera())

    mesh.setGeometry(triangle(-0.25))
    gl.spies.getError
      .mockReturnValueOnce(gl.spies.NO_ERROR)
      .mockReturnValueOnce(0x0505)
      .mockReturnValue(gl.spies.NO_ERROR)
    expect(() => runtime.render([mesh], camera()))
      .toThrow("Mesh geometry upload")

    runtime.render([mesh], camera())
    expect(gl.spies.createVertexArray).toHaveBeenCalledOnce()
    expect(gl.spies.createBuffer).toHaveBeenCalledTimes(2)
    expect(gl.spies.bufferData).toHaveBeenCalledTimes(6)
    expect(gl.spies.drawElements).toHaveBeenCalledTimes(2)
    runtime.dispose()
  })

  it("enables depth testing and draws every Mesh through one camera", () => {
    const canvas = document.createElement("canvas")
    canvas.width = 200
    canvas.height = 120
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const near = new Mesh({ geometry: triangle(), color: [0, 1, 0, 1] })
    const far = new Mesh({
      geometry: triangle(),
      modelMatrix: translationMatrix4(0, 0, -1),
      color: [1, 0, 0, 1],
    })

    runtime.render([near, far], camera())

    expect(gl.spies.enable).toHaveBeenCalledWith(gl.spies.DEPTH_TEST)
    expect(gl.spies.depthFunc).toHaveBeenCalledWith(gl.spies.LEQUAL)
    expect(gl.spies.depthMask).toHaveBeenCalledWith(true)
    expect(gl.spies.clear).toHaveBeenCalledWith(
      gl.spies.COLOR_BUFFER_BIT | gl.spies.DEPTH_BUFFER_BIT
    )
    expect(gl.spies.uniformMatrix4fv).toHaveBeenCalledTimes(2)
    expect(gl.spies.drawElements).toHaveBeenCalledTimes(2)
    runtime.dispose()
  })

  it("forgets invalid handles on restore and rebuilds from CPU Mesh state", () => {
    const canvas = document.createElement("canvas")
    canvas.width = 180
    canvas.height = 120
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const mesh = new Mesh({ geometry: triangle() })

    runtime.render([mesh], camera())
    gl.setLost(true)
    expect(() => runtime.render([mesh], camera())).toThrow("context is lost")

    gl.setLost(false)
    runtime.restoreContext()
    runtime.render([mesh], camera())

    expect(gl.spies.createProgram).toHaveBeenCalledTimes(2)
    expect(gl.spies.createVertexArray).toHaveBeenCalledTimes(2)
    expect(gl.spies.createBuffer).toHaveBeenCalledTimes(4)
    expect(gl.spies.deleteProgram).not.toHaveBeenCalled()
    runtime.dispose()
    expect(gl.spies.deleteProgram).toHaveBeenCalledOnce()
    expect(() => runtime.render([mesh], camera())).toThrow("has been disposed")
  })
})

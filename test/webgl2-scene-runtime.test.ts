// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import {
  identityMatrix4,
  normalMatrix3FromMatrix4,
  translationMatrix4,
} from "../src/stay/webgl2/math3D"
import { Mesh } from "../src/stay/webgl2/mesh"
import {
  GlassMaterial,
  LambertMaterial,
  UnlitMaterial,
} from "../src/stay/webgl2/material"
import { AmbientLight, DirectionalLight } from "../src/stay/webgl2/light"
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

const litTriangle = (z = 0) => ({
  ...triangle(z),
  normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
})

const unlit = (color: readonly [number, number, number, number]) =>
  new UnlitMaterial({ color })

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
      material: unlit([0.1, 0.2, 0.3, 1]),
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
    const mesh = new Mesh({ geometry: triangle(), material: unlit([0, 1, 0, 1]) })

    runtime.render([mesh], camera())
    mesh.setModelMatrix(translationMatrix4(0.2, 0, 0))
    mesh.setMaterial(unlit([0, 0.8, 0.2, 1]))
    runtime.render([mesh], camera())

    expect(gl.spies.createProgram).toHaveBeenCalledOnce()
    expect(gl.spies.createVertexArray).toHaveBeenCalledOnce()
    expect(gl.spies.createBuffer).toHaveBeenCalledTimes(3)
    expect(gl.spies.bufferData).toHaveBeenCalledTimes(3)
    expect(gl.spies.drawElements).toHaveBeenCalledTimes(2)

    mesh.setGeometry(triangle(-0.25))
    runtime.render([mesh], camera())
    expect(gl.spies.createVertexArray).toHaveBeenCalledOnce()
    expect(gl.spies.createBuffer).toHaveBeenCalledTimes(3)
    expect(gl.spies.bufferData).toHaveBeenCalledTimes(6)

    runtime.render([], camera())
    expect(gl.spies.deleteBuffer).toHaveBeenCalledTimes(3)
    expect(gl.spies.deleteVertexArray).toHaveBeenCalledOnce()
    runtime.dispose()
    expect(gl.spies.deleteProgram).toHaveBeenCalledOnce()
  })

  it("does not invalidate or upload equal CPU state", () => {
    const canvas = document.createElement("canvas")
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const mesh = new Mesh({ geometry: triangle(), material: unlit([0, 1, 0, 1]) })
    const changes: number[] = []
    mesh.subscribeChanges(() => changes.push(mesh.geometryRevision))

    runtime.render([mesh], camera())
    mesh.setGeometry(triangle())
    mesh.setModelMatrix(identityMatrix4())
    mesh.setMaterial(unlit([0, 1, 0, 1]))
    runtime.render([mesh], camera())

    expect(changes).toEqual([])
    expect(mesh.geometryRevision).toBe(0)
    expect(gl.spies.bufferData).toHaveBeenCalledTimes(3)
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
    expect(gl.spies.deleteBuffer).toHaveBeenCalledTimes(3)
    expect(gl.spies.deleteVertexArray).toHaveBeenCalledOnce()

    runtime.render([mesh], camera())
    expect(gl.spies.createVertexArray).toHaveBeenCalledTimes(2)
    expect(gl.spies.createBuffer).toHaveBeenCalledTimes(6)
    expect(gl.spies.bufferData).toHaveBeenCalledTimes(6)
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
    expect(gl.spies.createBuffer).toHaveBeenCalledTimes(3)
    expect(gl.spies.bufferData).toHaveBeenCalledTimes(9)
    expect(gl.spies.drawElements).toHaveBeenCalledTimes(2)
    runtime.dispose()
  })

  it("enables depth testing and draws every Mesh through one camera", () => {
    const canvas = document.createElement("canvas")
    canvas.width = 200
    canvas.height = 120
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const near = new Mesh({ geometry: triangle(), material: unlit([0, 1, 0, 1]) })
    const far = new Mesh({
      geometry: triangle(),
      modelMatrix: translationMatrix4(0, 0, -1),
      material: unlit([1, 0, 0, 1]),
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

  it("draws opaque Meshes first and stable-sorts Glass back to front", () => {
    const canvas = document.createElement("canvas")
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const nearGlass = new Mesh({
      geometry: litTriangle(),
      material: new GlassMaterial({ color: [0.2, 0.8, 0.4, 0.24] }),
    })
    const opaque = new Mesh({
      geometry: triangle(),
      material: unlit([0.9, 0.2, 0.1, 1]),
    })
    const farGlass = new Mesh({
      geometry: litTriangle(-2),
      material: new GlassMaterial({ color: [0.2, 0.4, 0.9, 0.18] }),
    })

    runtime.render([nearGlass, opaque, farGlass], camera(), [new AmbientLight()])

    expect(gl.spies.uniform4fv.mock.calls.map((call) => Array.from(call[1])))
      .toEqual([
        [0.9, 0.2, 0.1, 1].map(Math.fround),
        [0.2, 0.4, 0.9, 0.18].map(Math.fround),
        [0.2, 0.8, 0.4, 0.24].map(Math.fround),
      ])
    expect(gl.spies.enable).toHaveBeenCalledWith(gl.spies.BLEND)
    expect(gl.spies.blendEquation).toHaveBeenCalledWith(gl.spies.FUNC_ADD)
    expect(gl.spies.blendFunc)
      .toHaveBeenCalledWith(gl.spies.ONE, gl.spies.ONE_MINUS_SRC_ALPHA)
    expect(gl.spies.depthMask.mock.calls.map(([enabled]) => enabled))
      .toEqual([true, false, true])
    runtime.dispose()
  })

  it("re-sorts Glass with camera changes without rebuilding GPU resources", () => {
    const canvas = document.createElement("canvas")
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const left = new Mesh({
      geometry: litTriangle(),
      modelMatrix: translationMatrix4(-1, 0, 0),
      material: new GlassMaterial({ color: [1, 0, 0, 0.2] }),
    })
    const right = new Mesh({
      geometry: litTriangle(),
      modelMatrix: translationMatrix4(1, 0, 0),
      material: new GlassMaterial({ color: [0, 0, 1, 0.2] }),
    })
    const sceneCamera = new PerspectiveCamera({
      position: [3, 0, 3],
      target: [0, 0, 0],
      near: 0.1,
      far: 20,
    })

    runtime.render([left, right], sceneCamera, [new AmbientLight()])
    sceneCamera.setPose([-3, 0, 3], [0, 0, 0])
    runtime.render([left, right], sceneCamera, [new AmbientLight()])

    const colors = gl.spies.uniform4fv.mock.calls.map((call) => Array.from(call[1]))
    expect(colors.slice(0, 2)).toEqual([
      [1, 0, 0, 0.2].map(Math.fround),
      [0, 0, 1, 0.2].map(Math.fround),
    ])
    expect(colors.slice(2)).toEqual([
      [0, 0, 1, 0.2].map(Math.fround),
      [1, 0, 0, 0.2].map(Math.fround),
    ])
    expect(gl.spies.createProgram).toHaveBeenCalledOnce()
    expect(gl.spies.createBuffer).toHaveBeenCalledTimes(6)
    expect(gl.spies.bufferData).toHaveBeenCalledTimes(6)
    runtime.dispose()
  })

  it("preserves input order when Glass sort centers have equal view depth", () => {
    const canvas = document.createElement("canvas")
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const first = new Mesh({
      geometry: litTriangle(),
      modelMatrix: translationMatrix4(-0.5, 0, 0),
      material: new GlassMaterial({ color: [1, 0, 0, 0.2] }),
    })
    const second = new Mesh({
      geometry: litTriangle(),
      modelMatrix: translationMatrix4(0.5, 0, 0),
      material: new GlassMaterial({ color: [0, 0, 1, 0.2] }),
    })

    runtime.render([second, first], camera(), [new AmbientLight()])

    expect(gl.spies.uniform4fv.mock.calls.map((call) => Array.from(call[1])))
      .toEqual([
        [0, 0, 1, 0.2].map(Math.fround),
        [1, 0, 0, 0.2].map(Math.fround),
      ])

    gl.spies.uniform4fv.mockClear()
    first.setGeometry(litTriangle(-2))
    runtime.render([second, first], camera(), [new AmbientLight()])
    expect(gl.spies.uniform4fv.mock.calls.map((call) => Array.from(call[1])))
      .toEqual([
        [1, 0, 0, 0.2].map(Math.fround),
        [0, 0, 1, 0.2].map(Math.fround),
      ])
    runtime.dispose()
  })

  it("forgets invalid handles on restore and rebuilds from CPU Mesh state", () => {
    const canvas = document.createElement("canvas")
    canvas.width = 180
    canvas.height = 120
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const mesh = new Mesh({
      geometry: litTriangle(),
      material: new GlassMaterial(),
    })

    runtime.render([mesh], camera(), [new AmbientLight()])
    gl.setLost(true)
    expect(() => runtime.render([mesh], camera(), [new AmbientLight()]))
      .toThrow("context is lost")

    gl.setLost(false)
    runtime.restoreContext()
    runtime.render([mesh], camera(), [new AmbientLight()])

    expect(gl.spies.createProgram).toHaveBeenCalledTimes(2)
    expect(gl.spies.createVertexArray).toHaveBeenCalledTimes(2)
    expect(gl.spies.createBuffer).toHaveBeenCalledTimes(6)
    expect(gl.spies.deleteProgram).not.toHaveBeenCalled()
    runtime.dispose()
    expect(gl.spies.deleteProgram).toHaveBeenCalledOnce()
    expect(() => runtime.render([mesh], camera())).toThrow("has been disposed")
  })

  it("renders explicit normals through reusable opaque Lambert resources", () => {
    const canvas = document.createElement("canvas")
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const mesh = new Mesh({
      geometry: litTriangle(),
      material: new LambertMaterial({ color: [0.4, 0.7, 0.9, 1] }),
    })
    const ambient = new AmbientLight({ intensity: 0.3 })
    const key = new DirectionalLight({
      directionToLight: [0, 0, 2],
      color: [1, 0.9, 0.8],
      intensity: 0.8,
    })

    runtime.render([mesh], camera(), [ambient, key])
    mesh.setMaterial(new LambertMaterial({ color: [0.5, 0.8, 1, 1] }))
    key.setIntensity(0.6)
    runtime.render([mesh], camera(), [ambient, key])

    expect(gl.spies.createProgram).toHaveBeenCalledOnce()
    expect(gl.spies.createBuffer).toHaveBeenCalledTimes(3)
    expect(gl.spies.bufferData).toHaveBeenCalledTimes(3)
    expect(gl.spies.uniformMatrix3fv).toHaveBeenCalledTimes(2)
    expect(gl.spies.uniform3fv).toHaveBeenCalled()
    expect(gl.spies.uniform1i.mock.calls).toContainEqual([expect.anything(), 1])
    runtime.dispose()
  })

  it("renders one persistent directional shadow map before the main pass", () => {
    const canvas = document.createElement("canvas")
    canvas.width = 240
    canvas.height = 160
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const caster = new Mesh({
      geometry: triangle(),
      material: unlit([0.2, 0.3, 0.4, 1]),
      castShadow: true,
    })
    const receiver = new Mesh({
      geometry: litTriangle(-1),
      material: new LambertMaterial({ color: [0.8, 0.8, 0.8, 1] }),
      receiveShadow: true,
    })
    const light = new DirectionalLight({
      directionToLight: [0.4, 0.7, 1],
      shadow: {
        target: [0, 0, -0.5],
        width: 6,
        height: 4,
        near: 0.1,
        far: 20,
        mapSize: 512,
        bias: 0.002,
      },
    })

    runtime.render([caster, receiver], camera(), [light])
    runtime.render([caster, receiver], camera(), [light])

    expect(gl.spies.createFramebuffer).toHaveBeenCalledOnce()
    expect(gl.spies.createTexture).toHaveBeenCalledOnce()
    expect(gl.spies.texImage2D).toHaveBeenCalledWith(
      gl.spies.TEXTURE_2D,
      0,
      gl.spies.DEPTH_COMPONENT24,
      512,
      512,
      0,
      gl.spies.DEPTH_COMPONENT,
      gl.spies.UNSIGNED_INT,
      null
    )
    expect(gl.spies.drawElements).toHaveBeenCalledTimes(6)
    expect(gl.spies.bindFramebuffer.mock.calls[0][1]).toEqual(expect.anything())
    expect(gl.spies.bindFramebuffer.mock.calls).toContainEqual([
      gl.spies.FRAMEBUFFER,
      null,
    ])
    expect(gl.spies.colorMask.mock.calls).toContainEqual([false, false, false, false])
    expect(gl.spies.colorMask.mock.calls).toContainEqual([true, true, true, true])
    expect(gl.spies.uniform1i.mock.calls).toContainEqual([expect.anything(), 0])

    runtime.dispose()
    expect(gl.spies.deleteFramebuffer).toHaveBeenCalledOnce()
    expect(gl.spies.deleteTexture).toHaveBeenCalledOnce()
  })

  it("rebuilds shadow resources for map-size changes and context restore", () => {
    const canvas = document.createElement("canvas")
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const caster = new Mesh({ geometry: triangle(), castShadow: true })
    const receiver = new Mesh({
      geometry: litTriangle(-1),
      material: new LambertMaterial(),
      receiveShadow: true,
    })
    const light = new DirectionalLight({
      directionToLight: [0.3, 0.6, 1],
      shadow: { mapSize: 256 },
    })

    runtime.render([caster, receiver], camera(), [light])
    light.setShadow({ mapSize: 512 })
    runtime.render([caster, receiver], camera(), [light])
    expect(gl.spies.createFramebuffer).toHaveBeenCalledTimes(2)
    expect(gl.spies.deleteFramebuffer).toHaveBeenCalledOnce()
    expect(gl.spies.deleteTexture).toHaveBeenCalledOnce()

    gl.setLost(true)
    gl.setLost(false)
    runtime.restoreContext()
    runtime.render([caster, receiver], camera(), [light])
    expect(gl.spies.createFramebuffer).toHaveBeenCalledTimes(3)
    expect(gl.spies.createTexture).toHaveBeenCalledTimes(3)
    runtime.dispose()
  })

  it("cleans a failed shadow pass and retries from CPU state", () => {
    const canvas = document.createElement("canvas")
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const caster = new Mesh({ geometry: triangle(), castShadow: true })
    const receiver = new Mesh({
      geometry: litTriangle(-1),
      material: new LambertMaterial(),
      receiveShadow: true,
    })
    const light = new DirectionalLight({
      directionToLight: [0.3, 0.6, 1],
      shadow: { mapSize: 256 },
    })
    gl.spies.getError
      .mockReturnValueOnce(gl.spies.NO_ERROR)
      .mockReturnValueOnce(gl.spies.NO_ERROR)
      .mockReturnValueOnce(0x0505)
      .mockReturnValue(gl.spies.NO_ERROR)

    expect(() => runtime.render([caster, receiver], camera(), [light]))
      .toThrow("Mesh geometry upload")
    expect(gl.spies.bindFramebuffer).toHaveBeenLastCalledWith(gl.spies.FRAMEBUFFER, null)
    expect(gl.spies.colorMask).toHaveBeenLastCalledWith(true, true, true, true)

    runtime.render([caster, receiver], camera(), [light])
    expect(gl.spies.createFramebuffer).toHaveBeenCalledOnce()
    expect(gl.spies.createVertexArray).toHaveBeenCalledTimes(3)
    runtime.dispose()
  })

  it("rejects shadow maps beyond the context texture limit", () => {
    const canvas = document.createElement("canvas")
    const gl = createRecordingWebGL2Context(canvas, { maxTextureSize: 256 })
    const runtime = new WebGL2SceneRuntime(gl.context)
    const caster = new Mesh({ geometry: triangle(), castShadow: true })
    const receiver = new Mesh({
      geometry: litTriangle(-1),
      material: new LambertMaterial(),
      receiveShadow: true,
    })
    const light = new DirectionalLight({
      directionToLight: [0.3, 0.6, 1],
      shadow: { mapSize: 512 },
    })
    expect(() => runtime.render([caster, receiver], camera(), [light]))
      .toThrow("exceeds WebGL2 MAX_TEXTURE_SIZE 256")
    expect(gl.spies.createTexture).not.toHaveBeenCalled()
    runtime.dispose()
  })

  it("keeps shadow behavior explicit and validates light-owned frusta", () => {
    const changes: boolean[] = []
    const mesh = new Mesh({ geometry: triangle() })
    mesh.subscribeChanges(() => changes.push(mesh.castShadow || mesh.receiveShadow))
    expect(mesh.castShadow).toBe(false)
    expect(mesh.receiveShadow).toBe(false)
    mesh.setCastShadow(true)
    mesh.setReceiveShadow(true)
    expect(changes).toEqual([true, true])
    expect(mesh.geometryRevision).toBe(0)
    mesh.setCastShadow(true)
    mesh.setReceiveShadow(true)
    expect(changes).toEqual([true, true])
    expect(() => mesh.setCastShadow(1 as never)).toThrow("must be a boolean")

    expect(() => new DirectionalLight({
      directionToLight: [0, 1, 0],
      shadow: { up: [0, 1, 0] },
    })).toThrow("camera up direction")
    expect(new DirectionalLight({
      directionToLight: [0, 1, 0],
      shadow: {},
    }).getShadow()?.up).toEqual([0, 0, 1])
    const automaticUp = new DirectionalLight({
      directionToLight: [0, 0, 1],
      shadow: {},
    })
    automaticUp.setDirectionToLight([0, 1, 0])
    expect(automaticUp.getDirectionToLight()).toEqual([0, 1, 0])
    expect(automaticUp.getShadow()?.up).toEqual([0, 0, 1])
    expect(() => new DirectionalLight({
      directionToLight: [0, 0, 1],
      shadow: { near: 2, far: 1 },
    })).toThrow("far must be greater than near")
    expect(() => new DirectionalLight({
      directionToLight: [0, 0, 1],
      shadow: { mapSize: 10.5 },
    })).toThrow("positive integer")
  })

  it("rejects incomplete Lambert CPU state before committing Mesh changes", () => {
    expect(() => new Mesh({
      geometry: triangle(),
      material: new LambertMaterial(),
    })).toThrow("requires normals")
    expect(() => new Mesh({
      geometry: {
        ...triangle(),
        normals: [1e-46, 0, 0, 0, 0, 1, 0, 0, 1],
      },
    })).toThrow("must remain non-zero in Float32 range")
    const mesh = new Mesh({ geometry: litTriangle() })
    mesh.setMaterial(new LambertMaterial())
    expect(() => mesh.setGeometry(triangle())).toThrow("requires normals")
    expect(mesh.copyGeometrySnapshot().normals).toBeDefined()
    const singular = identityMatrix4()
    singular[0] = 0
    expect(() => mesh.setModelMatrix(singular))
      .toThrow("invertible linear part")
    const unstable = identityMatrix4()
    unstable[0] = 1e-40
    expect(() => mesh.setModelMatrix(unstable)).toThrow("exceeds Float32 range")
    expect(mesh.getModelMatrix()).toEqual(identityMatrix4())
    expect(() => new UnlitMaterial({ color: [1, 1, 1, 0.5] }))
      .toThrow("alpha must be 1")
    expect(() => new GlassMaterial({ color: [1, 1, 1, 1] }))
      .toThrow("greater than 0 and less than 1")
    expect(() => new GlassMaterial({ color: [1, 1, 1, 0] }))
      .toThrow("greater than 0 and less than 1")
    expect(() => new Mesh({
      geometry: triangle(),
      material: new GlassMaterial(),
    })).toThrow("Lit Mesh geometry requires normals")
    expect(() => mesh.setMaterial({
      kind: "lambert",
      color: [1, 1, 1, 1],
    } as never)).toThrow("must be an UnlitMaterial, LambertMaterial, or GlassMaterial")
  })

  it("derives an inverse-transpose normal matrix for non-uniform scale", () => {
    const model = identityMatrix4()
    model[0] = 2
    model[5] = 3
    model[10] = 4
    expect(normalMatrix3FromMatrix4(model)).toEqual(new Float32Array([
      0.5, 0, 0,
      0, 1 / 3, 0,
      0, 0, 0.25,
    ]))
  })
})

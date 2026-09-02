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
  ImageMaterial,
  LambertMaterial,
  StandardMaterial,
  TransparentImageMaterial,
  UnlitMaterial,
} from "../src/stay/webgl2/material"
import { ImageTexture } from "../src/stay/webgl2/imageTexture"
import { imageTextureUploadPixels } from "../src/stay/webgl2/imageTextureResources"
import { AmbientLight, DirectionalLight, PointLight } from "../src/stay/webgl2/light"
import { EnvironmentMap } from "../src/stay/webgl2/environmentMap"
import { PerspectiveCamera } from "../src/stay/webgl2/perspectiveCamera"
import { WebGL2SceneRuntime } from "../src/stay/webgl2/sceneRuntime"
import {
  linearizeSrgbColorWithAlpha,
  srgbChannelToLinear,
} from "../src/stay/webgl2/colorSpace"
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

const texturedTriangle = (z = 0) => ({
  ...triangle(z),
  uvs: [0, 0, 1, 0, 0.5, 1],
})

const imageTexture = () => new ImageTexture({
  width: 2,
  height: 2,
  data: new Uint8Array([
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
    255, 255, 255, 255,
  ]),
})

const unlit = (color: readonly [number, number, number, number]) =>
  new UnlitMaterial({ color })

const camera = () => new PerspectiveCamera({
  position: [0, 0, 3],
  target: [0, 0, 0],
  near: 0.1,
  far: 20,
})

const environmentImage = (value = 160) => ({
  width: 4,
  height: 2,
  data: new Uint8Array(4 * 2 * 4).fill(value),
})

describe("internal WebGL2 scene runtime", () => {
  it("converts sRGB authoring values to linear shader inputs", () => {
    expect(srgbChannelToLinear(0)).toBe(0)
    expect(srgbChannelToLinear(1)).toBe(1)
    expect(srgbChannelToLinear(0.04045)).toBeCloseTo(0.0031308, 7)
    expect(srgbChannelToLinear(0.5)).toBeCloseTo(0.21404114, 7)
  })

  it("resolves a persistent multisampled linear target through one output pass", () => {
    const canvas = document.createElement("canvas")
    canvas.width = 240
    canvas.height = 160
    const gl = createRecordingWebGL2Context(canvas, {
      samples: 4,
      supportedSamples: [8, 4, 2],
    })
    const runtime = new WebGL2SceneRuntime(gl.context)
    const mesh = new Mesh({ geometry: triangle(), material: unlit([0.5, 0.25, 1, 1]) })

    runtime.render([mesh], camera())
    runtime.render([mesh], camera())

    expect(gl.spies.renderbufferStorageMultisample).toHaveBeenCalledTimes(2)
    expect(gl.spies.renderbufferStorageMultisample.mock.calls.every(([, samples]) =>
      samples === 4)).toBe(true)
    expect(gl.spies.renderbufferStorage).not.toHaveBeenCalled()
    expect(gl.spies.createRenderbuffer).toHaveBeenCalledTimes(2)
    expect(gl.spies.createFramebuffer).toHaveBeenCalledTimes(2)
    expect(gl.spies.blitFramebuffer).toHaveBeenCalledTimes(2)
    expect(gl.spies.generateMipmap).not.toHaveBeenCalled()
    expect(gl.spies.texParameteri).toHaveBeenCalledWith(
      gl.spies.TEXTURE_2D,
      gl.spies.TEXTURE_MIN_FILTER,
      gl.spies.LINEAR,
    )
    expect(gl.spies.drawArrays).toHaveBeenCalledTimes(2)
    expect(gl.spies.shaderSource.mock.calls.some(([, source]) =>
      String(source).includes(
        "clamp(linear_to_srgb(linear_output), 0.0, 1.0)",
      )
      && String(source).includes("scene_color.rgb / scene_color.a")
      && String(source).includes("u_premultiplied_alpha")))
      .toBe(true)
    expect(gl.spies.uniform4fv).toHaveBeenCalledWith(
      expect.anything(),
      linearizeSrgbColorWithAlpha([0.5, 0.25, 1, 1]),
    )
    runtime.dispose()
  })

  it("preserves covered linear RGB for an opaque drawing buffer", () => {
    const canvas = document.createElement("canvas")
    const gl = createRecordingWebGL2Context(canvas, {
      contextAttributes: { alpha: false, premultipliedAlpha: false },
    })
    const runtime = new WebGL2SceneRuntime(gl.context)

    runtime.render([new Mesh({ geometry: triangle() })], camera())

    expect(gl.spies.shaderSource.mock.calls.some(([, source]) =>
      String(source).includes(
        "u_has_alpha ? straight_linear : scene_color.rgb",
      )))
      .toBe(true)
    expect(gl.spies.uniform1i.mock.calls).toContainEqual([expect.anything(), 0])
    runtime.dispose()
  })

  it("falls back to single-sample scene renderbuffers", () => {
    const canvas = document.createElement("canvas")
    const gl = createRecordingWebGL2Context(canvas, { samples: 0 })
    const runtime = new WebGL2SceneRuntime(gl.context)

    runtime.render([new Mesh({ geometry: triangle() })], camera())

    expect(gl.spies.renderbufferStorageMultisample).not.toHaveBeenCalled()
    expect(gl.spies.renderbufferStorage).toHaveBeenCalledTimes(2)
    runtime.dispose()
  })

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

  it("owns opaque image pixels and validates image UV state transactionally", () => {
    const source = imageTexture().copySnapshot().data
    const texture = new ImageTexture({ width: 2, height: 2, data: source })
    source[0] = 0
    expect(texture.copySnapshot().data[0]).toBe(255)

    expect(() => new ImageTexture({
      width: 2,
      height: 2,
      data: new Uint8Array(15),
    })).toThrow("exactly 16 RGBA8 values")
    expect(() => new ImageTexture({
      width: 1,
      height: 1,
      data: new Uint8Array([0, 0, 0, 254]),
    })).toThrow("alpha must be 255")
    expect(() => new Mesh({
      geometry: triangle(),
      material: new ImageMaterial({ texture }),
    })).toThrow("requires uvs")

    const mesh = new Mesh({
      geometry: texturedTriangle(),
      material: new ImageMaterial({ texture }),
    })
    const before = mesh.copyGeometrySnapshot()
    expect(() => mesh.setGeometry({
      ...triangle(),
      uvs: [0, 0, 1, 0],
    })).toThrow("one uv pair per vertex")
    expect(() => mesh.setGeometry({
      ...triangle(),
      uvs: [0, 0, 1, 0, Number.NaN, 1],
    })).toThrow("Mesh uv 4 must be finite")
    expect(mesh.copyGeometrySnapshot()).toEqual(before)
    expect(() => mesh.setMaterial(new UnlitMaterial()))
      .not.toThrow()
    expect(() => mesh.setMaterial(new ImageMaterial({ texture })))
      .not.toThrow()
    expect(mesh.geometryRevision).toBe(0)
  })

  it("keeps straight-alpha image pixels authoritative and derives premultiplied GPU bytes", () => {
    const source = new Uint8Array([
      255, 128, 32, 128,
      255, 255, 255, 0,
    ])
    const texture = new ImageTexture({
      width: 2,
      height: 1,
      alphaMode: "straight",
      data: source,
    })
    source.fill(0)

    const snapshot = texture.copySnapshot()
    expect(snapshot.alphaMode).toBe("straight")
    expect(snapshot.data).toEqual(new Uint8Array([
      255, 128, 32, 128,
      255, 255, 255, 0,
    ]))
    expect(imageTextureUploadPixels(snapshot)).toEqual(new Uint8Array([
      188, 93, 21, 128,
      0, 0, 0, 0,
    ]))
    expect(() => new ImageMaterial({ texture }))
      .toThrow("alphaMode must be opaque")
    expect(() => new TransparentImageMaterial({ texture: imageTexture() }))
      .toThrow("alphaMode must be straight")
    expect(() => new ImageTexture({
      width: 1,
      height: 1,
      alphaMode: "premultiplied" as never,
      data: new Uint8Array([0, 0, 0, 0]),
    })).toThrow("alphaMode must be opaque or straight")
  })

  it("validates transparent image UV and shadow state atomically", () => {
    const texture = new ImageTexture({
      width: 1,
      height: 1,
      alphaMode: "straight",
      data: new Uint8Array([255, 255, 255, 128]),
    })
    const material = new TransparentImageMaterial({ texture })
    expect(() => new Mesh({ geometry: triangle(), material }))
      .toThrow("TransparentImageMaterial Mesh geometry requires uvs")
    expect(() => new Mesh({
      geometry: texturedTriangle(),
      material,
      castShadow: true,
    })).toThrow("cannot cast shadows")

    const mesh = new Mesh({ geometry: texturedTriangle(), material })
    const changes: boolean[] = []
    mesh.subscribeChanges(() => changes.push(mesh.castShadow))
    expect(() => mesh.setCastShadow(true)).toThrow("cannot cast shadows")
    expect(mesh.castShadow).toBe(false)
    expect(changes).toEqual([])

    const opaque = new Mesh({
      geometry: texturedTriangle(),
      material: new ImageMaterial({ texture: imageTexture() }),
      castShadow: true,
    })
    expect(() => opaque.setMaterial(material)).toThrow("cannot cast shadows")
    expect(opaque.getMaterial()).toBeInstanceOf(ImageMaterial)
    expect(opaque.castShadow).toBe(true)
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

    expect(gl.spies.createProgram).toHaveBeenCalledTimes(2)
    expect(gl.spies.createVertexArray).toHaveBeenCalledTimes(2)
    expect(gl.spies.createBuffer).toHaveBeenCalledTimes(4)
    expect(gl.spies.bufferData).toHaveBeenCalledTimes(4)
    expect(gl.spies.drawElements).toHaveBeenCalledTimes(2)

    mesh.setGeometry(triangle(-0.25))
    runtime.render([mesh], camera())
    expect(gl.spies.createVertexArray).toHaveBeenCalledTimes(2)
    expect(gl.spies.createBuffer).toHaveBeenCalledTimes(4)
    expect(gl.spies.bufferData).toHaveBeenCalledTimes(8)

    runtime.render([], camera())
    expect(gl.spies.deleteBuffer).toHaveBeenCalledTimes(4)
    expect(gl.spies.deleteVertexArray).toHaveBeenCalledOnce()
    runtime.dispose()
    expect(gl.spies.deleteProgram).toHaveBeenCalledTimes(2)
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
    const glassMesh = new Mesh({
      geometry: litTriangle(),
      material: new GlassMaterial({
        attenuationColor: [0.7, 0.85, 1],
        attenuationDistance: 1.2,
        roughness: 0.24,
        thickness: 0.18,
      }),
    })
    const glassChanges: number[] = []
    glassMesh.subscribeChanges(() => glassChanges.push(glassMesh.geometryRevision))
    glassMesh.setMaterial(new GlassMaterial({
      attenuationColor: [0.7, 0.85, 1],
      attenuationDistance: 1.2,
      roughness: 0.24,
      thickness: 0.18,
    }))
    runtime.render([mesh], camera())

    expect(changes).toEqual([])
    expect(glassChanges).toEqual([])
    expect(mesh.geometryRevision).toBe(0)
    expect(gl.spies.bufferData).toHaveBeenCalledTimes(4)
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
      .mockReturnValueOnce(gl.spies.NO_ERROR)
      .mockReturnValueOnce(0x0505)
      .mockReturnValue(gl.spies.NO_ERROR)

    expect(() => runtime.render([mesh], camera()))
      .toThrow("Mesh geometry upload")
    expect(gl.spies.deleteBuffer).toHaveBeenCalledTimes(4)
    expect(gl.spies.deleteVertexArray).toHaveBeenCalledOnce()

    runtime.render([mesh], camera())
    expect(gl.spies.createVertexArray).toHaveBeenCalledTimes(3)
    expect(gl.spies.createBuffer).toHaveBeenCalledTimes(8)
    expect(gl.spies.bufferData).toHaveBeenCalledTimes(8)
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
    expect(gl.spies.createVertexArray).toHaveBeenCalledTimes(2)
    expect(gl.spies.createBuffer).toHaveBeenCalledTimes(4)
    expect(gl.spies.bufferData).toHaveBeenCalledTimes(12)
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
    expect(gl.spies.uniformMatrix4fv).toHaveBeenCalledTimes(3)
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
        Array.from(linearizeSrgbColorWithAlpha([0.9, 0.2, 0.1, 1])),
        Array.from(linearizeSrgbColorWithAlpha([0.2, 0.4, 0.9, 0.18])),
        Array.from(linearizeSrgbColorWithAlpha([0.2, 0.8, 0.4, 0.24])),
      ])
    expect(gl.spies.enable).toHaveBeenCalledWith(gl.spies.BLEND)
    expect(gl.spies.blendEquation).toHaveBeenCalledWith(gl.spies.FUNC_ADD)
    expect(gl.spies.blendFunc)
      .toHaveBeenCalledWith(gl.spies.ONE, gl.spies.ONE_MINUS_SRC_ALPHA)
    expect(gl.spies.depthMask.mock.calls.map(([enabled]) => enabled))
      .toEqual([true, false, true])
    runtime.dispose()
  })

  it("refracts the persistent opaque scene color through Glass ior and thickness", () => {
    const canvas = document.createElement("canvas")
    canvas.width = 240
    canvas.height = 160
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const opaque = new Mesh({ geometry: triangle(-1), material: unlit([0.9, 0.2, 0.1, 1]) })
    const glass = new Mesh({
      geometry: litTriangle(),
      material: new GlassMaterial({
        attenuationColor: [0.7, 0.85, 1],
        attenuationDistance: 1.2,
        color: [0.6, 0.85, 1, 0.2],
        ior: 1.46,
        thickness: 0.18,
      }),
    })

    runtime.render([glass, opaque], camera(), [new AmbientLight()])
    runtime.render([glass, opaque], camera(), [new AmbientLight()])

    expect(gl.spies.shaderSource.mock.calls.some(([, source]) =>
      String(source).includes("refract(incident, view_normal, 1.0 / u_ior)")
      && String(source).includes("current_uv = gl_FragCoord.xy / texture_size")
      && String(source).includes("if (u_thickness <= 0.0) return current_uv")
      && String(source).includes("projected_uv(refracted_clip)")
      && String(source).includes("- projected_uv(incident_clip)")
      && String(source).includes("candidate_is_valid = all(greaterThanEqual")
      && String(source).includes("if (candidate_is_valid)")
      && String(source).includes("return current_uv")
      && String(source).includes("volume_attenuation(")
      && String(source).includes("uniform float u_log_attenuation_exponent")
      && String(source).includes("if (color <= 0.0) return 0.0")
      && String(source).includes("if (color >= 1.0) return 1.0")
      && String(source).includes("exp(clamp(log_attenuation_exponent, -80.0, 80.0))")
      && String(source).includes("scene_color.rgb / scene_color.a * volume_transmittance")))
      .toBe(true)
    expect(gl.spies.createTexture).toHaveBeenCalledOnce()
    expect(gl.spies.createFramebuffer).toHaveBeenCalledTimes(2)
    expect(gl.spies.createRenderbuffer).toHaveBeenCalledTimes(2)
    expect(gl.spies.texImage2D).toHaveBeenCalledOnce()
    expect(gl.spies.blitFramebuffer).toHaveBeenCalledTimes(4)
    expect(gl.spies.generateMipmap).toHaveBeenCalledTimes(2)
    expect(gl.spies.texParameteri).toHaveBeenCalledWith(
      gl.spies.TEXTURE_2D,
      gl.spies.TEXTURE_MIN_FILTER,
      gl.spies.LINEAR_MIPMAP_LINEAR,
    )
    const drawFramebuffer = gl.spies.createFramebuffer.mock.results[0].value
    const resolveFramebuffer = gl.spies.createFramebuffer.mock.results[1].value
    expect(gl.spies.bindFramebuffer)
      .toHaveBeenCalledWith(gl.spies.READ_FRAMEBUFFER, drawFramebuffer)
    expect(gl.spies.bindFramebuffer)
      .toHaveBeenCalledWith(gl.spies.DRAW_FRAMEBUFFER, resolveFramebuffer)
    expect(gl.spies.blitFramebuffer).toHaveBeenCalledWith(
      0,
      0,
      240,
      160,
      0,
      0,
      240,
      160,
      gl.spies.COLOR_BUFFER_BIT,
      gl.spies.NEAREST,
    )
    expect(gl.spies.activeTexture).toHaveBeenCalledWith(gl.spies.TEXTURE1)
    expect(gl.spies.uniform1f.mock.calls)
      .toContainEqual([expect.anything(), Math.fround(1.46)])
    expect(gl.spies.uniform1f.mock.calls)
      .toContainEqual([expect.anything(), Math.fround(0.18)])
    expect(gl.spies.uniform1i.mock.calls)
      .toContainEqual([expect.anything(), 1])
    expect(gl.spies.uniform1f.mock.calls.some(([, value]) =>
      Math.abs(value - Math.fround(
        Math.log(Math.fround(0.18)) - Math.log(Math.fround(1.2))
      )) < 1e-6))
      .toBe(true)
    expect(gl.spies.uniform3fv.mock.calls.some(([, value]) =>
      Array.from(value as Float32Array).every((component, index) =>
        component === new Float32Array([0.7, 0.85, 1])[index])))
      .toBe(true)

    canvas.width = 320
    canvas.height = 180
    runtime.render([glass, opaque], camera(), [new AmbientLight()])
    expect(gl.spies.createTexture).toHaveBeenCalledTimes(2)
    expect(gl.spies.createFramebuffer).toHaveBeenCalledTimes(4)
    expect(gl.spies.deleteTexture).toHaveBeenCalledOnce()
    expect(gl.spies.deleteFramebuffer).toHaveBeenCalledTimes(2)
    expect(gl.spies.deleteRenderbuffer).toHaveBeenCalledTimes(2)

    runtime.dispose()
    expect(gl.spies.deleteTexture).toHaveBeenCalledTimes(2)
    expect(gl.spies.deleteFramebuffer).toHaveBeenCalledTimes(4)
    expect(gl.spies.deleteRenderbuffer).toHaveBeenCalledTimes(4)
  })

  it("uploads one shared ImageTexture, draws it before Glass, prunes it, and restores it", () => {
    const canvas = document.createElement("canvas")
    canvas.width = 240
    canvas.height = 160
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const texture = imageTexture()
    const first = new Mesh({
      geometry: texturedTriangle(-1),
      material: new ImageMaterial({ texture }),
    })
    const second = new Mesh({
      geometry: texturedTriangle(-1.1),
      material: new ImageMaterial({ texture }),
    })
    const glass = new Mesh({
      geometry: litTriangle(),
      material: new GlassMaterial({ thickness: 0.2 }),
    })

    runtime.render([glass, first, second], camera(), [new AmbientLight()])
    runtime.render([glass, first, second], camera(), [new AmbientLight()])

    const shaderSources = gl.spies.shaderSource.mock.calls
      .map(([, source]) => String(source))
    expect(shaderSources.some((source) =>
      source.includes("layout(location = 2) in vec2 a_uv")))
      .toBe(true)
    expect(shaderSources.some((source) =>
      source.includes("uniform sampler2D u_image_texture")
      && source.includes("texture(u_image_texture, image_uv)")))
      .toBe(true)
    expect(gl.spies.createTexture).toHaveBeenCalledTimes(2)
    expect(gl.spies.texImage2D).toHaveBeenCalledTimes(2)
    expect(gl.spies.texImage2D).toHaveBeenCalledWith(
      gl.spies.TEXTURE_2D,
      0,
      gl.spies.SRGB8_ALPHA8,
      2,
      2,
      0,
      gl.spies.RGBA,
      gl.spies.UNSIGNED_BYTE,
      expect.any(Uint8Array),
    )
    expect(gl.spies.uniform1i.mock.calls)
      .toContainEqual([expect.anything(), 0])
    const firstDrawOrder = gl.spies.drawElements.mock.invocationCallOrder[0]
    const firstResolveOrder = gl.spies.blitFramebuffer.mock.invocationCallOrder[0]
    const glassDrawOrder = gl.spies.drawElements.mock.invocationCallOrder[2]
    expect(firstDrawOrder).toBeLessThan(firstResolveOrder)
    expect(firstResolveOrder).toBeLessThan(glassDrawOrder)

    runtime.render([glass], camera(), [new AmbientLight()])
    expect(gl.spies.deleteTexture).toHaveBeenCalledOnce()

    gl.setLost(true)
    expect(() => runtime.render([glass, first], camera(), [new AmbientLight()]))
      .toThrow("context is lost")
    gl.setLost(false)
    runtime.restoreContext()
    runtime.render([glass, first], camera(), [new AmbientLight()])
    expect(gl.spies.createTexture).toHaveBeenCalledTimes(4)
    expect(gl.spies.texImage2D).toHaveBeenCalledTimes(4)
    runtime.dispose()
  })

  it("uploads and blends straight-alpha textures in the depth-sorted transparent queue", () => {
    const canvas = document.createElement("canvas")
    canvas.width = 240
    canvas.height = 160
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const texture = new ImageTexture({
      width: 2,
      height: 1,
      alphaMode: "straight",
      data: new Uint8Array([
        255, 128, 32, 128,
        255, 255, 255, 0,
      ]),
    })
    const transparentImage = new Mesh({
      geometry: texturedTriangle(-1),
      material: new TransparentImageMaterial({ texture }),
    })
    const glass = new Mesh({
      geometry: litTriangle(),
      material: new GlassMaterial({ thickness: 0.2 }),
    })

    runtime.render([glass, transparentImage], camera(), [new AmbientLight()])

    const transparentShader = gl.spies.shaderSource.mock.calls
      .map(([, source]) => String(source))
      .find((source) => source.includes("output_color = texture(u_image_texture, image_uv)"))
    expect(transparentShader).toBeDefined()
    expect(gl.spies.blendFunc).toHaveBeenCalledWith(
      gl.spies.ONE,
      gl.spies.ONE_MINUS_SRC_ALPHA,
    )
    const imageUpload = gl.spies.texImage2D.mock.calls.find((call) =>
      call[3] === 2 && call[4] === 1)
    expect(imageUpload?.[8]).toEqual(new Uint8Array([
      188, 93, 21, 128,
      0, 0, 0, 0,
    ]))
    const resolveOrder = gl.spies.blitFramebuffer.mock.invocationCallOrder[0]
    const transparentDrawOrder = gl.spies.drawElements.mock.invocationCallOrder[0]
    const glassDrawOrder = gl.spies.drawElements.mock.invocationCallOrder[1]
    expect(resolveOrder).toBeLessThan(transparentDrawOrder)
    expect(transparentDrawOrder).toBeLessThan(glassDrawOrder)
    runtime.dispose()
  })

  it("uploads finite logarithmic attenuation for valid Float32 endpoint ratios", () => {
    const canvas = document.createElement("canvas")
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const minimumFloat32 = 2 ** -149
    const maximumFloat32 = 3.4028234663852886e38
    const materials = [
      new GlassMaterial({
        attenuationColor: [1, 0.5, 0],
        attenuationDistance: minimumFloat32,
        thickness: 0.1,
      }),
      new GlassMaterial({
        attenuationColor: [1, 0.5, 0],
        attenuationDistance: maximumFloat32,
        thickness: minimumFloat32,
      }),
    ]

    runtime.render([
      new Mesh({ geometry: triangle(-1), material: unlit([1, 1, 1, 1]) }),
      ...materials.map((material) => new Mesh({ geometry: litTriangle(), material })),
    ], camera(), [new AmbientLight()])

    const expectedLogExponents = [
      Math.log(Math.fround(0.1)) - Math.log(minimumFloat32),
      Math.log(minimumFloat32) - Math.log(maximumFloat32),
    ]
    expect(expectedLogExponents.every(Number.isFinite)).toBe(true)
    expect(expectedLogExponents[0]).toBeGreaterThan(0)
    expect(expectedLogExponents[1]).toBeLessThan(0)
    for (const expected of expectedLogExponents) {
      expect(gl.spies.uniform1f.mock.calls.some(([, value]) =>
        Math.abs(value - expected) < 1e-6))
        .toBe(true)
    }
    expect(gl.spies.uniform1i.mock.calls.filter(([, value]) => value === 1).length)
      .toBeGreaterThanOrEqual(2)
    runtime.dispose()
  })

  it("uses one persistent scene target without uploading an unused environment", () => {
    const canvas = document.createElement("canvas")
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const opaque = new Mesh({ geometry: triangle(), material: unlit([0.2, 0.5, 0.9, 1]) })

    runtime.render([opaque], camera(), [], new EnvironmentMap(environmentImage()))

    expect(gl.spies.createTexture).toHaveBeenCalledOnce()
    expect(gl.spies.createFramebuffer).toHaveBeenCalledTimes(2)
    expect(gl.spies.createRenderbuffer).toHaveBeenCalledTimes(2)
    expect(gl.spies.blitFramebuffer).toHaveBeenCalledOnce()
    expect(gl.spies.drawArrays).toHaveBeenCalledOnce()
    runtime.dispose()
  })

  it("renders Standard material through the opaque path with persistent environment state", () => {
    const canvas = document.createElement("canvas")
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const environment = new EnvironmentMap({ ...environmentImage(), intensity: 0.7 })
    const mesh = new Mesh({
      geometry: litTriangle(),
      material: new StandardMaterial({
        color: [0.65, 0.7, 0.75, 1],
        metallic: 0.2,
        roughness: 0.3,
      }),
      receiveShadow: true,
    })

    runtime.render([mesh], camera(), [new AmbientLight()], environment)
    runtime.render([mesh], camera(), [new AmbientLight()], environment)

    const standardSource = gl.spies.shaderSource.mock.calls.find(([, source]) =>
      String(source).includes("distribution_ggx")
      && String(source).includes("environment_radiance"))?.[1]
    expect(String(standardSource)).toContain("mix(vec3(0.04), base_color, u_metallic)")
    expect(gl.spies.createProgram).toHaveBeenCalledTimes(2)
    expect(gl.spies.createTexture).toHaveBeenCalledTimes(2)
    expect(gl.spies.createFramebuffer).toHaveBeenCalledTimes(2)
    expect(gl.spies.blitFramebuffer).toHaveBeenCalledTimes(2)
    expect(gl.spies.texImage2D).toHaveBeenCalledTimes(2)
    expect(gl.spies.generateMipmap).toHaveBeenCalledOnce()
    expect(gl.spies.texImage2D).toHaveBeenCalledWith(
      gl.spies.TEXTURE_2D,
      0,
      gl.spies.SRGB8_ALPHA8,
      4,
      2,
      0,
      gl.spies.RGBA,
      gl.spies.UNSIGNED_BYTE,
      expect.any(Uint8Array),
    )
    expect(gl.spies.uniform3fv.mock.calls.every(([, value]) => value.length > 0))
      .toBe(true)
    expect(gl.spies.uniform1f.mock.calls)
      .toContainEqual([expect.anything(), Math.fround(0.2)])
    expect(gl.spies.uniform1f.mock.calls)
      .toContainEqual([expect.anything(), Math.fround(0.3)])
    expect(gl.spies.uniform1f.mock.calls)
      .toContainEqual([expect.anything(), Math.fround(0.7)])

    mesh.setMaterial(new StandardMaterial({
      color: [0.65, 0.7, 0.75, 1],
      metallic: 0.25,
      roughness: 0.35,
    }))
    runtime.render([mesh], camera(), [new AmbientLight()], environment)
    expect(gl.spies.createProgram).toHaveBeenCalledTimes(2)
    expect(gl.spies.createBuffer).toHaveBeenCalledTimes(4)
    expect(gl.spies.bufferData).toHaveBeenCalledTimes(4)
    expect(gl.spies.createTexture).toHaveBeenCalledTimes(2)

    environment.setIntensity(0.5)
    runtime.render([mesh], camera(), [new AmbientLight()], environment)
    expect(gl.spies.createTexture).toHaveBeenCalledTimes(2)
    expect(gl.spies.texImage2D).toHaveBeenCalledTimes(2)
    expect(gl.spies.uniform1f.mock.calls)
      .toContainEqual([expect.anything(), Math.fround(0.5)])
    runtime.dispose()
  })

  it("uses persistent mipmapped environment reflection and rough transmission", () => {
    const canvas = document.createElement("canvas")
    canvas.width = 240
    canvas.height = 160
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const environment = new EnvironmentMap({
      ...environmentImage(),
      intensity: 0.8,
    })
    const glass = new Mesh({
      geometry: litTriangle(),
      material: new GlassMaterial({ roughness: 0.35 }),
    })

    const directionalLight = new DirectionalLight({
      color: [0.8, 0.9, 1],
      directionToLight: [0, 0, 1],
      intensity: 1.4,
    })
    runtime.render([glass], camera(), [new AmbientLight(), directionalLight], environment)
    runtime.render([glass], camera(), [new AmbientLight(), directionalLight], environment)

    expect(gl.spies.shaderSource.mock.calls.some(([, source]) =>
      String(source).includes("environment_radiance(reflected_direction, u_roughness)")
      && String(source).includes("reflect(-view_direction, normal)")
      && String(source).includes("direct_specular += light.radiance")
      && String(source).includes("evaluate_microfacet_lobes(")
      && String(source).includes("min(premultiplied_color, vec3(alpha))")
      && String(source).includes("scene_color.rgb / scene_color.a")
      && String(source).includes("lit_tint * boundary_weight")
      && String(source).includes("refracted_color * transmission_weight")
      && String(source).includes("reflection_color * fresnel")))
      .toBe(true)
    expect(gl.spies.shaderSource.mock.calls.some(([, source]) =>
      String(source).includes("scene_color.rgb / scene_color.a * u_color.rgb")))
      .toBe(false)
    expect(gl.spies.createTexture).toHaveBeenCalledTimes(2)
    expect(gl.spies.createFramebuffer).toHaveBeenCalledTimes(2)
    expect(gl.spies.texImage2D).toHaveBeenCalledTimes(2)
    expect(gl.spies.generateMipmap).toHaveBeenCalledTimes(3)
    expect(gl.spies.activeTexture).toHaveBeenCalledWith(gl.spies.TEXTURE2)
    expect(gl.spies.uniform1f.mock.calls)
      .toContainEqual([expect.anything(), Math.fround(0.35)])
    expect(gl.spies.uniform1f.mock.calls)
      .toContainEqual([expect.anything(), Math.fround(0.8)])

    environment.setIntensity(0.6)
    runtime.render([glass], camera(), [new AmbientLight()], environment)
    expect(gl.spies.createTexture).toHaveBeenCalledTimes(2)
    expect(gl.spies.texImage2D).toHaveBeenCalledTimes(2)
    expect(gl.spies.uniform1f.mock.calls)
      .toContainEqual([expect.anything(), Math.fround(0.6)])

    environment.setImage(environmentImage(96))
    runtime.render([glass], camera(), [new AmbientLight()], environment)
    expect(gl.spies.createTexture).toHaveBeenCalledTimes(2)
    expect(gl.spies.texImage2D).toHaveBeenCalledTimes(3)
    expect(gl.spies.generateMipmap).toHaveBeenCalledTimes(6)

    gl.setLost(true)
    expect(() => runtime.render([glass], camera(), [], environment))
      .toThrow("context is lost")
    gl.setLost(false)
    runtime.restoreContext()
    runtime.render([glass], camera(), [], environment)
    expect(gl.spies.createTexture).toHaveBeenCalledTimes(4)
    expect(gl.spies.createFramebuffer).toHaveBeenCalledTimes(4)
    expect(gl.spies.texImage2D).toHaveBeenCalledTimes(5)

    runtime.dispose()
    expect(gl.spies.deleteTexture).toHaveBeenCalledTimes(2)
  })

  it("cleans a failed scene-target allocation and retries from CPU state", () => {
    const canvas = document.createElement("canvas")
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const glass = new Mesh({ geometry: litTriangle(), material: new GlassMaterial() })
    gl.spies.createFramebuffer
      .mockReturnValueOnce({ id: 90_001 })
      .mockReturnValueOnce(null)

    expect(() => runtime.render([glass], camera(), [new AmbientLight()]))
      .toThrow("Unable to create WebGL2 scene resolve framebuffer")
    expect(gl.spies.deleteFramebuffer).toHaveBeenCalledOnce()
    expect(gl.spies.deleteTexture).toHaveBeenCalledOnce()
    expect(gl.spies.deleteRenderbuffer).toHaveBeenCalledTimes(2)

    runtime.render([glass], camera(), [new AmbientLight()])
    expect(gl.spies.createTexture).toHaveBeenCalledTimes(2)
    expect(gl.spies.drawElements).toHaveBeenCalledOnce()
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
    expect(gl.spies.createProgram).toHaveBeenCalledTimes(2)
    expect(gl.spies.createBuffer).toHaveBeenCalledTimes(8)
    expect(gl.spies.bufferData).toHaveBeenCalledTimes(8)
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

    expect(gl.spies.createProgram).toHaveBeenCalledTimes(4)
    expect(gl.spies.createVertexArray).toHaveBeenCalledTimes(4)
    expect(gl.spies.createBuffer).toHaveBeenCalledTimes(8)
    expect(gl.spies.createTexture).toHaveBeenCalledTimes(2)
    expect(gl.spies.createFramebuffer).toHaveBeenCalledTimes(4)
    expect(gl.spies.deleteProgram).not.toHaveBeenCalled()
    runtime.dispose()
    expect(gl.spies.deleteProgram).toHaveBeenCalledTimes(2)
    expect(gl.spies.deleteTexture).toHaveBeenCalledOnce()
    expect(gl.spies.deleteFramebuffer).toHaveBeenCalledTimes(2)
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

    expect(gl.spies.createProgram).toHaveBeenCalledTimes(2)
    expect(gl.spies.createBuffer).toHaveBeenCalledTimes(4)
    expect(gl.spies.bufferData).toHaveBeenCalledTimes(4)
    expect(gl.spies.uniformMatrix3fv).toHaveBeenCalledTimes(2)
    expect(gl.spies.uniform3fv).toHaveBeenCalled()
    expect(gl.spies.uniform1i.mock.calls).toContainEqual([expect.anything(), 1])
    runtime.dispose()
  })

  it("applies bounded inverse-square PointLight radiance to every lit material", () => {
    const canvas = document.createElement("canvas")
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const point = new PointLight({
      position: [1, 2, 3],
      color: [0.5, 0.75, 1],
      intensity: 8,
      range: 6,
    })
    const meshes = [
      new Mesh({ geometry: litTriangle(), material: new LambertMaterial() }),
      new Mesh({ geometry: litTriangle(-0.1), material: new StandardMaterial() }),
      new Mesh({ geometry: litTriangle(-0.2), material: new GlassMaterial() }),
    ]

    runtime.render(meshes, camera(), [point])

    const fragmentSources = gl.spies.shaderSource.mock.calls
      .map(([, source]) => String(source))
      .filter((source) => source.includes("uniform int u_point_light_count"))
    expect(fragmentSources).toHaveLength(3)
    const lambertSource = fragmentSources.find((source) =>
      !source.includes("uniform float u_metallic")
      && !source.includes("uniform float u_thickness"))
    const standardSource = fragmentSources.find((source) =>
      source.includes("uniform float u_metallic"))
    const glassSource = fragmentSources.find((source) =>
      source.includes("uniform float u_thickness"))
    expect(fragmentSources.every((source) =>
      source.includes("u_point_light_positions[index] - world_position")
      && source.includes("offset_to_light / sqrt(distance_squared)")
      && source.includes("1.0 / max(distance_squared, 0.000001)")
      && source.includes("1.0 - distance_range_squared * distance_range_squared")
      && source.includes("point_light_sample(")))
      .toBe(true)
    expect(lambertSource).toContain("DirectLightSample light = direct_light_sample(index)")
    expect(lambertSource).toContain("illumination += light.radiance")
    expect(standardSource).toContain("DirectLightSample light = direct_light_sample(index)")
    expect(standardSource)
      .toContain("result += (diffuse + lobes.specular)")
    expect(glassSource).toContain("DirectLightSample light = direct_light_sample(index)")
    expect(glassSource).toContain("direct_specular += light.radiance")
    expect(gl.spies.uniform3fv.mock.calls).toContainEqual([
      expect.anything(),
      new Float32Array([1, 2, 3]),
    ])
    expect(gl.spies.uniform3fv.mock.calls).toContainEqual([
      expect.anything(),
      new Float32Array([
        srgbChannelToLinear(0.5) * 8,
        srgbChannelToLinear(0.75) * 8,
        8,
      ]),
    ])
    expect(gl.spies.uniform1fv.mock.calls).toContainEqual([
      expect.anything(),
      new Float32Array([6]),
    ])
    runtime.dispose()
  })

  it("validates PointLight state and the independent forward-light limit", () => {
    const position: [number, number, number] = [1, 2, 3]
    const light = new PointLight({ position })
    const changes: number[] = []
    light.subscribeChanges(() => changes.push(changes.length + 1))
    position[0] = 99
    expect(light.getPosition()).toEqual([1, 2, 3])
    const copy = light.getPosition() as [number, number, number]
    copy[0] = 88
    expect(light.getPosition()).toEqual([1, 2, 3])
    expect(light.range).toBeUndefined()
    light.setPosition([1, 2, 3])
    light.setRange(undefined)
    expect(changes).toHaveLength(0)
    light.setPosition([2, 3, 4])
    light.setRange(10)
    light.setRange(undefined)
    expect(changes).toHaveLength(3)
    expect(() => new PointLight({ position: [Number.NaN, 0, 0] }))
      .toThrow("position[0] must be finite")
    expect(() => new PointLight({ position: [1e100, 0, 0] }))
      .toThrow("position[0] exceeds Float32 range")
    expect(() => new PointLight({ position: [0, 0, 0], range: 0 }))
      .toThrow("range must be greater than 0")

    const canvas = document.createElement("canvas")
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const points = Array.from({ length: 5 }, (_, index) =>
      new PointLight({ position: [index, 0, 1] }))
    expect(() => runtime.render([
      new Mesh({ geometry: litTriangle(), material: new LambertMaterial() }),
    ], camera(), points)).toThrow("at most 4 point lights")
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
        filterRadius: 1.5,
      },
    })
    const point = new PointLight({ position: [1, 2, 3], intensity: 4 })

    runtime.render([caster, receiver], camera(), [point, light])
    runtime.render([caster, receiver], camera(), [point, light])

    expect(gl.spies.createFramebuffer).toHaveBeenCalledTimes(3)
    expect(gl.spies.createTexture).toHaveBeenCalledTimes(2)
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
    expect(gl.spies.uniform2f.mock.calls).toContainEqual([
      expect.anything(),
      1.5 / 512,
      1.5 / 512,
    ])
    expect(gl.spies.texParameteri.mock.calls).toContainEqual([
      gl.spies.TEXTURE_2D,
      gl.spies.TEXTURE_COMPARE_MODE,
      gl.spies.COMPARE_REF_TO_TEXTURE,
    ])
    expect(gl.spies.shaderSource.mock.calls.some(([, source]) =>
      String(source).includes("precision highp sampler2DShadow")
      && String(source).includes("uniform sampler2DShadow u_shadow_map")
      && String(source).includes("u_shadow_filter_step")
      && String(source).includes("texture(u_shadow_map, vec3(sample_uv, receiver_depth))")))
      .toBe(true)

    runtime.dispose()
    expect(gl.spies.deleteFramebuffer).toHaveBeenCalledTimes(3)
    expect(gl.spies.deleteTexture).toHaveBeenCalledTimes(2)
  })

  it("casts Glass volume attenuation through a persistent transmissive shadow map", () => {
    const canvas = document.createElement("canvas")
    canvas.width = 240
    canvas.height = 160
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const caster = new Mesh({
      geometry: litTriangle(),
      material: new GlassMaterial({
        attenuationColor: [0.2, 0.65, 0.95],
        attenuationDistance: 0.5,
        thickness: 0.25,
      }),
      castShadow: true,
    })
    const receiver = new Mesh({
      geometry: litTriangle(-1),
      material: new LambertMaterial(),
      receiveShadow: true,
    })
    const light = new DirectionalLight({
      directionToLight: [0.4, 0.7, 1],
      shadow: { mapSize: 256 },
    })

    runtime.render([caster, receiver], camera(), [light])
    runtime.render([caster, receiver], camera(), [light])

    expect(gl.spies.createFramebuffer).toHaveBeenCalledTimes(3)
    expect(gl.spies.createTexture).toHaveBeenCalledTimes(3)
    expect(gl.spies.texImage2D).toHaveBeenCalledWith(
      gl.spies.TEXTURE_2D,
      0,
      gl.spies.RGBA8,
      256,
      256,
      0,
      gl.spies.RGBA,
      gl.spies.UNSIGNED_BYTE,
      null,
    )
    expect(gl.spies.shaderSource.mock.calls.some(([, source]) =>
      String(source).includes("out vec4 output_transmittance")
      && String(source).includes("u_surface_transmission * volume_attenuation(")))
      .toBe(true)
    expect(gl.spies.shaderSource.mock.calls.some(([, source]) =>
      String(source).includes("vec3 shadow_transmittance()")
      && String(source).includes("u_transmissive_shadow_color_map")))
      .toBe(true)
    expect(gl.spies.drawElements).toHaveBeenCalledTimes(6)

    runtime.dispose()
    expect(gl.spies.deleteFramebuffer).toHaveBeenCalledTimes(3)
    expect(gl.spies.deleteTexture).toHaveBeenCalledTimes(3)
  })

  it("keeps opaque occlusion independent from the nearest Glass transmittance", () => {
    const canvas = document.createElement("canvas")
    const gl = createRecordingWebGL2Context(canvas)
    const runtime = new WebGL2SceneRuntime(gl.context)
    const opaqueCaster = new Mesh({ geometry: triangle(), castShadow: true })
    const glassCaster = new Mesh({
      geometry: litTriangle(-0.25),
      material: new GlassMaterial({
        attenuationColor: [0.5, 0.8, 1],
        attenuationDistance: 1,
        thickness: 0.4,
      }),
      castShadow: true,
    })
    const receiver = new Mesh({
      geometry: litTriangle(-1),
      material: new LambertMaterial(),
      receiveShadow: true,
    })
    const light = new DirectionalLight({
      directionToLight: [0.4, 0.7, 1],
      shadow: { mapSize: 128 },
    })

    runtime.render([opaqueCaster, glassCaster, receiver], camera(), [light])

    expect(gl.spies.createFramebuffer).toHaveBeenCalledTimes(4)
    expect(gl.spies.createTexture).toHaveBeenCalledTimes(4)
    expect(gl.spies.shaderSource.mock.calls.some(([, source]) =>
      String(source).includes("float opaque_visibility")
      && String(source).includes("float glass_visibility")
      && String(source).includes("opaque_visibility * mix(")))
      .toBe(true)
    expect(gl.spies.texParameteri.mock.calls.filter(([, name, value]) =>
      name === gl.spies.TEXTURE_COMPARE_MODE
      && value === gl.spies.COMPARE_REF_TO_TEXTURE)).toHaveLength(2)
    expect(gl.spies.drawElements).toHaveBeenCalledTimes(5)

    runtime.dispose()
    expect(gl.spies.deleteFramebuffer).toHaveBeenCalledTimes(4)
    expect(gl.spies.deleteTexture).toHaveBeenCalledTimes(4)
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
    light.setShadow({ mapSize: 256, filterRadius: 2 })
    runtime.render([caster, receiver], camera(), [light])
    expect(gl.spies.createFramebuffer).toHaveBeenCalledTimes(3)
    expect(gl.spies.deleteFramebuffer).not.toHaveBeenCalled()
    expect(gl.spies.uniform2f.mock.calls).toContainEqual([
      expect.anything(),
      2 / 256,
      2 / 256,
    ])

    light.setShadow({ mapSize: 512, filterRadius: 2 })
    runtime.render([caster, receiver], camera(), [light])
    expect(gl.spies.createFramebuffer).toHaveBeenCalledTimes(4)
    expect(gl.spies.deleteFramebuffer).toHaveBeenCalledOnce()
    expect(gl.spies.deleteTexture).toHaveBeenCalledOnce()

    gl.setLost(true)
    gl.setLost(false)
    runtime.restoreContext()
    runtime.render([caster, receiver], camera(), [light])
    expect(gl.spies.createFramebuffer).toHaveBeenCalledTimes(7)
    expect(gl.spies.createTexture).toHaveBeenCalledTimes(5)
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
    expect(gl.spies.createFramebuffer).toHaveBeenCalledTimes(3)
    expect(gl.spies.createVertexArray).toHaveBeenCalledTimes(4)
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
    expect(new DirectionalLight({
      directionToLight: [0, 0, 1],
      shadow: {},
    }).getShadow()?.filterRadius).toBe(1)
    expect(new DirectionalLight({
      directionToLight: [0, 0, 1],
      shadow: { filterRadius: 0 },
    }).getShadow()?.filterRadius).toBe(0)
    expect(() => new DirectionalLight({
      directionToLight: [0, 0, 1],
      shadow: { filterRadius: -0.1 },
    })).toThrow("filterRadius must not be negative")
    expect(() => new DirectionalLight({
      directionToLight: [0, 0, 1],
      shadow: { filterRadius: Number.POSITIVE_INFINITY },
    })).toThrow("filterRadius must be finite")
  })

  it("rejects incomplete lit CPU state before committing Mesh changes", () => {
    const defaultStandard = new StandardMaterial()
    expect(defaultStandard.metallic).toBe(0)
    expect(defaultStandard.roughness).toBe(1)
    const defaultGlass = new GlassMaterial()
    expect(defaultGlass.attenuationColor).toEqual([1, 1, 1])
    expect(defaultGlass.attenuationDistance).toBeUndefined()
    expect(new GlassMaterial({
      attenuationColor: [0, 0.5, 1],
      attenuationDistance: 1,
      thickness: 0,
    }).thickness).toBe(0)
    expect(() => new Mesh({
      geometry: triangle(),
      material: new LambertMaterial(),
    })).toThrow("requires normals")
    expect(() => new Mesh({
      geometry: triangle(),
      material: new StandardMaterial(),
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
    expect(() => new StandardMaterial({ color: [1, 1, 1, 0.5] }))
      .toThrow("alpha must be 1")
    expect(() => new StandardMaterial({ metallic: -0.1 }))
      .toThrow("metallic must be between 0 and 1")
    expect(() => new StandardMaterial({ metallic: Number.NaN }))
      .toThrow("metallic must be finite")
    expect(() => new StandardMaterial({ roughness: 1.1 }))
      .toThrow("roughness must be between 0 and 1")
    expect(() => new GlassMaterial({ color: [1, 1, 1, 1] }))
      .toThrow("greater than 0 and less than 1")
    expect(() => new GlassMaterial({ color: [1, 1, 1, 0] }))
      .toThrow("greater than 0 and less than 1")
    expect(() => new GlassMaterial({ ior: 1 })).toThrow("ior must be greater than 1")
    expect(() => new GlassMaterial({ ior: 1 + Number.EPSILON }))
      .toThrow("ior must be greater than 1 in Float32 range")
    expect(() => new GlassMaterial({ ior: Number.MAX_VALUE }))
      .toThrow("ior exceeds Float32 range")
    expect(() => new GlassMaterial({ ior: Number.NaN })).toThrow("ior must be finite")
    expect(() => new GlassMaterial({ roughness: -0.1 }))
      .toThrow("roughness must be between 0 and 1")
    expect(() => new GlassMaterial({ roughness: -Number.MIN_VALUE }))
      .toThrow("roughness must be between 0 and 1")
    expect(() => new GlassMaterial({ roughness: 1.1 }))
      .toThrow("roughness must be between 0 and 1")
    expect(() => new GlassMaterial({ roughness: null as never }))
      .toThrow("roughness must be finite")
    expect(() => new GlassMaterial({ attenuationColor: [-0.1, 0.5, 1] }))
      .toThrow("attenuationColor must be between 0 and 1")
    expect(() => new GlassMaterial({ attenuationColor: [0.1, Number.NaN, 1] }))
      .toThrow("attenuationColor[1] must be finite")
    expect(() => new GlassMaterial({ attenuationDistance: 0 }))
      .toThrow("attenuationDistance must be greater than 0")
    expect(() => new GlassMaterial({ attenuationDistance: -0.1 }))
      .toThrow("attenuationDistance must be greater than 0")
    expect(() => new GlassMaterial({ attenuationDistance: Number.MIN_VALUE }))
      .toThrow("attenuationDistance must be greater than 0 in Float32 range")
    expect(() => new GlassMaterial({ attenuationDistance: Number.MAX_VALUE }))
      .toThrow("attenuationDistance exceeds Float32 range")
    expect(() => new GlassMaterial({ thickness: -0.1 }))
      .toThrow("thickness must be greater than or equal to 0")
    expect(() => new GlassMaterial({ thickness: -Number.MIN_VALUE }))
      .toThrow("thickness must be greater than or equal to 0")
    expect(() => new GlassMaterial({ thickness: Number.MAX_VALUE }))
      .toThrow("thickness exceeds Float32 range")
    expect(() => new EnvironmentMap({ ...environmentImage(), width: 3 }))
      .toThrow("2:1 equirectangular image")
    expect(() => new EnvironmentMap({
      width: 4,
      height: 2,
      data: new Uint8Array(31),
    })).toThrow("exactly 32 RGBA8 values")
    expect(() => new EnvironmentMap({ ...environmentImage(), intensity: -0.1 }))
      .toThrow("intensity must be greater than or equal to 0")
    expect(() => new Mesh({
      geometry: triangle(),
      material: new GlassMaterial(),
    })).toThrow("Lit Mesh geometry requires normals")
    expect(() => mesh.setMaterial({
      kind: "lambert",
      color: [1, 1, 1, 1],
    } as never)).toThrow(
      "must be an UnlitMaterial, ImageMaterial, TransparentImageMaterial, LambertMaterial, StandardMaterial, or GlassMaterial"
    )
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

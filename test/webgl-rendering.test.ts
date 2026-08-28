// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"

import { Rectangle } from "react-stay-canvas"
import { createLayerRenderPlan } from "../src/stay/rendering/renderPlan"
import {
  createProjectiveClipVertices,
  executeWebGLRenderPlan,
} from "../src/stay/rendering/webGLExecutor"
import {
  createFiniteProjectiveMapping,
  mapProjectiveLocalToContentPoint,
  type ProjectiveMatrix2D,
} from "../src/stay/transforms/projective2D"
import { createStage } from "./helpers/stage"

function perspectivePlane(matrixScale = 1) {
  return createFiniteProjectiveMapping({
    m00: 1.1 * matrixScale,
    m01: 0,
    m02: 20 * matrixScale,
    m10: 0.1 * matrixScale,
    m11: 1 * matrixScale,
    m12: 20 * matrixScale,
    m20: 0.005 * matrixScale,
    m21: 0,
    m22: 1 * matrixScale,
  }, { x: 0, y: 0, width: 80, height: 60 })
}

function createRecordingContext(
  canvas: HTMLCanvasElement,
  options: { lost?: boolean; maxTextureSize?: number } = {}
) {
  let lost = options.lost ?? false
  let nextHandle = 0
  const handle = () => ({ id: ++nextHandle })
  const context = {
    canvas,
    drawingBufferWidth: canvas.width,
    drawingBufferHeight: canvas.height,
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    STATIC_DRAW: 0x88e4,
    STREAM_DRAW: 0x88e0,
    FLOAT: 0x1406,
    TRIANGLES: 0x0004,
    UNSIGNED_SHORT: 0x1403,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    FRAMEBUFFER: 0x8d40,
    CULL_FACE: 0x0b44,
    DEPTH_TEST: 0x0b71,
    SCISSOR_TEST: 0x0c11,
    STENCIL_TEST: 0x0b90,
    BLEND: 0x0be2,
    SAMPLE_COVERAGE: 0x80a0,
    SAMPLE_ALPHA_TO_COVERAGE: 0x809e,
    ONE: 1,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    FUNC_ADD: 0x8006,
    COLOR_BUFFER_BIT: 0x4000,
    TEXTURE0: 0x84c0,
    TEXTURE_2D: 0x0de1,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    CLAMP_TO_EDGE: 0x812f,
    LINEAR: 0x2601,
    UNPACK_FLIP_Y_WEBGL: 0x9240,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    MAX_TEXTURE_SIZE: 0x0d33,
    NO_ERROR: 0,
    CONTEXT_LOST_WEBGL: 0x9242,
    isContextLost: vi.fn(() => lost),
    getError: vi.fn(() => 0),
    getParameter: vi.fn(() => options.maxTextureSize ?? 4096),
    createShader: vi.fn(handle),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ""),
    deleteShader: vi.fn(),
    createProgram: vi.fn(handle),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ""),
    deleteProgram: vi.fn(),
    createBuffer: vi.fn(handle),
    deleteBuffer: vi.fn(),
    createTexture: vi.fn(handle),
    deleteTexture: vi.fn(),
    getAttribLocation: vi.fn((_: unknown, name: string) =>
      name === "a_clip_position" ? 0 : 1),
    getUniformLocation: vi.fn(() => handle()),
    bindFramebuffer: vi.fn(),
    viewport: vi.fn(),
    disable: vi.fn(),
    depthMask: vi.fn(),
    colorMask: vi.fn(),
    enable: vi.fn(),
    blendFunc: vi.fn(),
    blendEquation: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    useProgram: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    disableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    activeTexture: vi.fn(),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    pixelStorei: vi.fn(),
    uniform1i: vi.fn(),
    texImage2D: vi.fn(),
    drawElements: vi.fn(),
  }
  return {
    context: context as unknown as WebGLRenderingContext,
    setLost(value: boolean) { lost = value },
    spies: context,
  }
}

const identityFrame = { offsetX: 0, offsetY: 0, scale: 1 }

describe("internal WebGL projective RenderPlan executor", () => {
  it("clears an empty pass with stale clipping and write masks disabled", () => {
    const canvas = document.createElement("canvas")
    canvas.width = 200
    canvas.height = 120
    const gl = createRecordingContext(canvas)

    executeWebGLRenderPlan({
      context: gl.context,
      items: [],
      getNow: () => 0,
      width: 200,
      height: 120,
      contentToView: identityFrame,
      getProjectiveRasterScale: () => 1,
    })

    expect(gl.spies.disable).toHaveBeenCalledWith(gl.spies.SCISSOR_TEST)
    expect(gl.spies.colorMask).toHaveBeenCalledWith(true, true, true, true)
    expect(gl.spies.viewport).toHaveBeenCalledWith(0, 0, 200, 120)
    expect(gl.spies.clear).toHaveBeenCalledWith(gl.spies.COLOR_BUFFER_BIT)
    expect(gl.spies.blendEquation).toHaveBeenCalledWith(gl.spies.FUNC_ADD)
    expect(gl.spies.disable).toHaveBeenCalledWith(gl.spies.SAMPLE_COVERAGE)
    expect(gl.spies.disable).toHaveBeenCalledWith(gl.spies.SAMPLE_ALPHA_TO_COVERAGE)
    expect(gl.spies.createShader).not.toHaveBeenCalled()
  })

  it("builds scale-invariant positive-w clip vertices from Content mappings", () => {
    const mapping = perspectivePlane(-1e120)
    const projection = { mapping }
    const vertices = createProjectiveClipVertices(
      projection,
      { scale: 1, width: 80, height: 60 },
      200,
      120,
      { offsetX: 7, offsetY: 9, scale: 1.5 }
    )
    const { x, y, width, height } = mapping.localDomain
    const corners = [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ]

    corners.forEach((corner, index) => {
      const content = mapProjectiveLocalToContentPoint(mapping, corner)!
      const offset = index * 5
      const w = vertices[offset + 2]
      expect(w).toBeGreaterThan(0)
      expect(vertices[offset] / w)
        .toBeCloseTo(2 * (content.x * 1.5 + 7) / 200 - 1, 5)
      expect(vertices[offset + 1] / w)
        .toBeCloseTo(1 - 2 * (content.y * 1.5 + 9) / 120, 5)
    })
    expect(Array.from(vertices).filter((_, index) => index % 5 >= 3))
      .toEqual([0, 1, 1, 1, 1, 0, 0, 0])
  })

  it("excludes ceil padding from projective texture coordinates", () => {
    const mapping = createFiniteProjectiveMapping({
      m00: 1, m01: 0, m02: 0,
      m10: 0, m11: 1, m12: 0,
      m20: 0, m21: 0, m22: 1,
    }, { x: 0, y: 0, width: 3, height: 3 })
    const vertices = createProjectiveClipVertices(
      { mapping },
      { scale: 0.5, width: 2, height: 2 },
      10,
      10,
      identityFrame
    )

    expect(Array.from(vertices).filter((_, index) => index % 5 >= 3))
      .toEqual([0, 1, 0.75, 1, 0.75, 0.25, 0, 0.25])
  })

  it("rasterizes projective Shapes once in RenderPlan order and frees every resource", () => {
    const { stage, layers } = createStage({ width: 200, height: 120, layers: 1 })
    const order: string[] = []
    const later = stage.tools.appendChild({
      className: "later",
      shape: new Rectangle({
        x: 0, y: 0, width: 80, height: 60, zIndex: 2,
        stateDrawFuncMap: { default: { afterDraw: () => order.push("later") } },
      }),
    })
    const earlier = stage.tools.appendChild({
      className: "earlier",
      shape: new Rectangle({
        x: 0, y: 0, width: 80, height: 60, zIndex: 1,
        stateDrawFuncMap: { default: { afterDraw: () => order.push("earlier") } },
      }),
    })
    const plan = createLayerRenderPlan(
      [later, earlier],
      0,
      undefined,
      () => ({ mapping: perspectivePlane() })
    )
    const gl = createRecordingContext(layers[0])
    const getNow = vi.fn(() => 42)

    executeWebGLRenderPlan({
      context: gl.context,
      items: plan.items,
      getNow,
      width: 200,
      height: 120,
      contentToView: identityFrame,
      getProjectiveRasterScale: () => 2,
      forceDraw: true,
    })

    expect(order).toEqual(["earlier", "later"])
    expect(getNow).toHaveBeenCalledTimes(2)
    expect(gl.spies.texImage2D).toHaveBeenCalledTimes(2)
    expect(gl.spies.drawElements).toHaveBeenCalledTimes(2)
    expect(gl.spies.deleteTexture).toHaveBeenCalledOnce()
    expect(gl.spies.deleteBuffer).toHaveBeenCalledTimes(2)
    expect(gl.spies.deleteProgram).toHaveBeenCalledOnce()
    expect(gl.spies.deleteShader).toHaveBeenCalledTimes(2)
    stage.destroy()
  })

  it("batches consecutive affine items without changing mixed RenderPlan order", () => {
    const { stage, layers } = createStage({ width: 200, height: 120, layers: 1 })
    const order: string[] = []
    const append = (name: string, zIndex: number) => stage.tools.appendChild({
      className: name,
      placement: name === "affine-2"
        ? { type: "affine", x: 15, y: 7 }
        : undefined,
      shape: new Rectangle({
        x: 0, y: 0, width: 80, height: 60, zIndex,
        fillConfig: { color: { r: 40, g: 90, b: 180, a: 1 } },
        stateDrawFuncMap: {
          default: {
            fill({ context }) {
              context.fillRect(this.x, this.y, this.width, this.height)
            },
            afterDraw: () => order.push(name),
          },
        },
      }),
    })
    const children = [
      append("projected-2", 5),
      append("affine-2", 4),
      append("affine-1", 1),
      append("projected-1", 3),
      append("affine-middle", 2),
    ]
    const plan = createLayerRenderPlan(
      children,
      0,
      undefined,
      (child) => child.className.startsWith("projected")
        ? { mapping: perspectivePlane() }
        : undefined
    )
    const gl = createRecordingContext(layers[0])

    executeWebGLRenderPlan({
      context: gl.context,
      items: plan.items,
      getNow: () => 42,
      width: 200,
      height: 120,
      contentToView: { offsetX: 8, offsetY: 6, scale: 1.25 },
      getProjectiveRasterScale: () => 2,
      forceDraw: true,
    })

    expect(order).toEqual([
      "affine-1",
      "affine-middle",
      "projected-1",
      "affine-2",
      "projected-2",
    ])
    // Two contiguous affine runs and two projective items become four ordered
    // texture draws, while the first two affine Shapes share one raster.
    expect(gl.spies.texImage2D).toHaveBeenCalledTimes(4)
    expect(gl.spies.drawElements).toHaveBeenCalledTimes(4)
    const firstAffineSurface = gl.spies.texImage2D.mock.calls[0][5] as HTMLCanvasElement
    const secondAffineSurface = gl.spies.texImage2D.mock.calls[2][5] as HTMLCanvasElement
    expect(firstAffineSurface.getContext("2d")!.getImageData(10, 10, 1, 1).data[3])
      .toBeGreaterThan(0)
    expect(secondAffineSurface.getContext("2d")!.getImageData(30, 20, 1, 1).data[3])
      .toBeGreaterThan(0)
    stage.destroy()
  })

  it("resolves Child placement kind and mapping at each WebGL draw boundary", () => {
    const { stage, layers } = createStage({ width: 200, height: 150, layers: 1 })
    const order: string[] = []
    const projectivePlacement = (x: number, y: number) => ({
      type: "projective" as const,
      matrix: {
        m00: 1, m01: 0, m02: x,
        m10: 0, m11: 1, m12: y,
        m20: 0.002, m21: 0, m22: 1,
      },
      domain: { x: 0, y: 0, width: 40, height: 30 },
    })
    const shape = (name: string, zIndex: number) => new Rectangle({
      x: 0, y: 0, width: 40, height: 30, zIndex,
      stateDrawFuncMap: { default: { afterDraw: () => order.push(name) } },
    })
    const affineToProjective = stage.tools.appendChild({
      className: "affine-to-projective",
      shape: shape("affine-to-projective", 1),
    })
    const projectiveToAffine = stage.tools.appendChild({
      className: "projective-to-affine",
      shape: shape("projective-to-affine", 2),
      placement: projectivePlacement(20, 60),
    })
    const projectiveToProjective = stage.tools.appendChild({
      className: "projective-to-projective",
      shape: shape("projective-to-projective", 3),
      placement: projectivePlacement(20, 100),
    })
    stage.tools.appendChild({
      className: "mutator",
      shape: new Rectangle({
        x: 0, y: 0, width: 2, height: 2, zIndex: 0,
        stateDrawFuncMap: {
          default: {
            afterDraw: () => {
              order.push("mutator")
              affineToProjective.setPlacement(projectivePlacement(20, 10))
              projectiveToAffine.setPlacement({ type: "affine", x: 100, y: 60 })
              projectiveToProjective.setPlacement(projectivePlacement(100, 100))
            },
          },
        },
      }),
    })
    const gl = createRecordingContext(layers[0])
    const projectiveMappings: unknown[] = []

    executeWebGLRenderPlan({
      context: gl.context,
      items: createLayerRenderPlan(stage.tools.getChildrenWithoutRoot(), 0).items,
      getNow: () => 0,
      width: 200,
      height: 150,
      contentToView: identityFrame,
      getProjectiveRasterScale: ({ projection }) => {
        projectiveMappings.push(projection?.mapping)
        return 1
      },
      forceDraw: true,
    })

    expect(order).toEqual([
      "mutator",
      "affine-to-projective",
      "projective-to-affine",
      "projective-to-projective",
    ])
    expect(gl.spies.texImage2D).toHaveBeenCalledTimes(4)
    expect(projectiveMappings.slice(-2)).toEqual([
      affineToProjective.getProjectiveMapping(),
      projectiveToProjective.getProjectiveMapping(),
    ])
    stage.destroy()
  })

  it("keeps one affine composition batch when projective reclassifies before its boundary", () => {
    const { stage, layers } = createStage({ width: 200, height: 120, layers: 1 })
    const later = stage.tools.appendChild({
      className: "later",
      shape: new Rectangle({
        x: 0, y: 0, width: 80, height: 60, zIndex: 2,
        fillConfig: { color: { r: 20, g: 80, b: 180, a: 1 } },
      }),
      placement: {
        type: "projective",
        matrix: {
          m00: 1, m01: 0, m02: 0,
          m10: 0, m11: 1, m12: 0,
          m20: 0.002, m21: 0, m22: 1,
        },
        domain: { x: 0, y: 0, width: 80, height: 60 },
      },
    })
    const earlier = stage.tools.appendChild({
      className: "earlier",
      shape: new Rectangle({
        x: 0, y: 0, width: 80, height: 60, zIndex: 1,
        fillConfig: { color: { r: 20, g: 80, b: 180, a: 1 } },
        stateDrawFuncMap: {
          default: {
            afterDraw: () => {
              later.setPlacement({ type: "affine" })
              later.shape.globalConfig.gco = "destination-out"
            },
          },
        },
      }),
    })
    const gl = createRecordingContext(layers[0])

    executeWebGLRenderPlan({
      context: gl.context,
      items: createLayerRenderPlan([earlier, later], 0).items,
      getNow: () => 0,
      width: 200,
      height: 120,
      contentToView: identityFrame,
      getProjectiveRasterScale: () => 1,
      forceDraw: true,
    })
    expect(gl.spies.texImage2D).toHaveBeenCalledOnce()
    const surface = gl.spies.texImage2D.mock.calls[0][5] as HTMLCanvasElement
    expect(surface.getContext("2d")!.getImageData(10, 10, 1, 1).data[3]).toBe(0)
    expect(gl.spies.deleteTexture).toHaveBeenCalledOnce()
    stage.destroy()
  })

  it("does not preflight a mutable projective raster that becomes affine before drawing", () => {
    const { stage, layers } = createStage({ width: 60, height: 40, layers: 1 })
    const order: string[] = []
    const later = stage.tools.appendChild({
      className: "later",
      shape: new Rectangle({
        x: 10, y: 0, width: 40, height: 30, zIndex: 2,
        stateDrawFuncMap: { default: { afterDraw: () => order.push("later") } },
      }),
      placement: {
        type: "projective",
        matrix: {
          m00: 1, m01: 0, m02: 0,
          m10: 0, m11: 1, m12: 0,
          m20: 0.002, m21: 0, m22: 1,
        },
        domain: { x: 0, y: 0, width: 40, height: 30 },
      },
    })
    const earlier = stage.tools.appendChild({
      className: "earlier",
      shape: new Rectangle({
        x: 0, y: 0, width: 10, height: 10, zIndex: 1,
        stateDrawFuncMap: {
          default: {
            afterDraw: () => {
              order.push("earlier")
              later.setPlacement({ type: "affine" })
            },
          },
        },
      }),
    })
    const gl = createRecordingContext(layers[0], { maxTextureSize: 64 })
    const getProjectiveRasterScale = vi.fn(() => 2)

    executeWebGLRenderPlan({
      context: gl.context,
      items: createLayerRenderPlan([earlier, later], 0).items,
      getNow: () => 0,
      width: 60,
      height: 40,
      contentToView: identityFrame,
      getProjectiveRasterScale,
      forceDraw: true,
    })

    expect(order).toEqual(["earlier", "later"])
    expect(getProjectiveRasterScale).not.toHaveBeenCalled()
    expect(gl.spies.texImage2D).toHaveBeenCalledOnce()
    stage.destroy()
  })

  it("checks mixed composition from the value used at each affine draw boundary", () => {
    const placement = {
      type: "projective" as const,
      matrix: {
        m00: 1, m01: 0, m02: 20,
        m10: 0, m11: 1, m12: 20,
        m20: 0.002, m21: 0, m22: 1,
      },
      domain: { x: 0, y: 0, width: 40, height: 30 },
    }
    const run = (initialGco: GlobalCompositeOperation, changedGco: GlobalCompositeOperation) => {
      const { stage, layers } = createStage({ width: 100, height: 80, layers: 1 })
      const later = stage.tools.appendChild({
        className: "later",
        shape: new Rectangle({ x: 0, y: 0, width: 40, height: 30, zIndex: 2 }),
      })
      const earlier = stage.tools.appendChild({
        className: "earlier",
        shape: new Rectangle({
          x: 0, y: 0, width: 40, height: 30, zIndex: 1,
          globalConfig: { gco: initialGco },
          stateDrawFuncMap: {
            default: {
              afterDraw() {
                this.globalConfig.gco = changedGco
                later.setPlacement(placement)
              },
            },
          },
        }),
      })
      const gl = createRecordingContext(layers[0])
      const execute = () => executeWebGLRenderPlan({
        context: gl.context,
        items: createLayerRenderPlan([earlier, later], 0).items,
        getNow: () => 0,
        width: 100,
        height: 80,
        contentToView: identityFrame,
        getProjectiveRasterScale: () => 1,
        forceDraw: true,
      })
      return { stage, gl, execute }
    }

    const allowed = run("source-over", "destination-out")
    allowed.execute()
    expect(allowed.gl.spies.texImage2D).toHaveBeenCalledTimes(2)
    allowed.stage.destroy()

    const rejected = run("destination-out", "source-over")
    expect(rejected.execute).toThrow("currently supports source-over Shapes")
    expect(rejected.gl.spies.texImage2D).not.toHaveBeenCalled()
    expect(rejected.gl.spies.deleteTexture).toHaveBeenCalledOnce()
    rejected.stage.destroy()
  })

  it("validates affine texture size only when a mutable affine batch is realized", () => {
    const projectivePlacement = {
      type: "projective" as const,
      matrix: {
        m00: 1, m01: 0, m02: 0,
        m10: 0, m11: 1, m12: 0,
        m20: 0.002, m21: 0, m22: 1,
      },
      domain: { x: 0, y: 0, width: 20, height: 20 },
    }
    const createPair = (laterStartsProjective: boolean) => {
      const { stage, layers } = createStage({ width: 200, height: 120, layers: 1 })
      const later = stage.tools.appendChild({
        className: "later",
        shape: new Rectangle({ x: 0, y: 0, width: 20, height: 20, zIndex: 2 }),
        placement: laterStartsProjective ? projectivePlacement : undefined,
      })
      const earlier = stage.tools.appendChild({
        className: "earlier",
        shape: new Rectangle({
          x: 0, y: 0, width: 20, height: 20, zIndex: 1,
          stateDrawFuncMap: {
            default: {
              afterDraw: () => later.setPlacement(
                laterStartsProjective ? { type: "affine" } : projectivePlacement
              ),
            },
          },
        }),
        placement: projectivePlacement,
      })
      const gl = createRecordingContext(layers[0], { maxTextureSize: 64 })
      const execute = () => executeWebGLRenderPlan({
        context: gl.context,
        items: createLayerRenderPlan([earlier, later], 0).items,
        getNow: () => 0,
        width: 200,
        height: 120,
        contentToView: identityFrame,
        getProjectiveRasterScale: () => 1,
        forceDraw: true,
      })
      return { stage, gl, execute }
    }

    const staysProjective = createPair(false)
    staysProjective.execute()
    expect(staysProjective.gl.spies.texImage2D).toHaveBeenCalledTimes(2)
    staysProjective.stage.destroy()

    const becomesAffine = createPair(true)
    expect(becomesAffine.execute)
      .toThrow("affine batch raster 200x120 exceeds WebGL texture limit 64")
    expect(becomesAffine.gl.spies.texImage2D).toHaveBeenCalledOnce()
    expect(becomesAffine.gl.spies.deleteTexture).toHaveBeenCalledOnce()
    becomesAffine.stage.destroy()
  })

  it("preserves Canvas2D composition inside an affine-only WebGL batch", () => {
    const { stage, layers } = createStage({ width: 200, height: 120, layers: 1 })
    const first = stage.tools.appendChild({
      className: "source",
      shape: new Rectangle({ x: 0, y: 0, width: 80, height: 60, zIndex: 1 }),
    })
    const second = stage.tools.appendChild({
      className: "mask",
      shape: new Rectangle({
        x: 20, y: 10, width: 20, height: 20, zIndex: 2,
        globalConfig: { gco: "destination-out" },
      }),
    })
    const gl = createRecordingContext(layers[0])

    executeWebGLRenderPlan({
      context: gl.context,
      items: createLayerRenderPlan([first, second], 0).items,
      getNow: () => 0,
      width: 200,
      height: 120,
      contentToView: identityFrame,
      getProjectiveRasterScale: () => 1,
      forceDraw: true,
    })

    expect(gl.spies.texImage2D).toHaveBeenCalledOnce()
    expect(gl.spies.drawElements).toHaveBeenCalledOnce()
    stage.destroy()
  })

  it("rejects mixed destination-dependent composition before allocating GPU resources", () => {
    const { stage, layers } = createStage({ width: 200, height: 120, layers: 1 })
    const projected = stage.tools.appendChild({
      className: "projected",
      shape: new Rectangle({ x: 0, y: 0, width: 80, height: 60 }),
    })
    const mask = stage.tools.appendChild({
      className: "mask",
      shape: new Rectangle({
        x: 20, y: 10, width: 20, height: 20,
        globalConfig: { gco: "destination-out" },
      }),
    })
    const plan = createLayerRenderPlan(
      [projected, mask], 0, undefined,
      (child) => child === projected
        ? { mapping: perspectivePlane() }
        : undefined
    )
    const gl = createRecordingContext(layers[0])

    expect(() => executeWebGLRenderPlan({
      context: gl.context,
      items: plan.items,
      getNow: () => 0,
      width: 200,
      height: 120,
      contentToView: identityFrame,
      getProjectiveRasterScale: () => 1,
      forceDraw: true,
    })).toThrow("currently supports source-over Shapes")
    expect(gl.spies.createShader).not.toHaveBeenCalled()
    stage.destroy()
  })

  it("rejects a later affine item made destination-dependent during mixed drawing", () => {
    const { stage, layers } = createStage({ width: 200, height: 120, layers: 1 })
    const affine = stage.tools.appendChild({
      className: "affine",
      shape: new Rectangle({ x: 0, y: 0, width: 80, height: 60, zIndex: 2 }),
    })
    const projected = stage.tools.appendChild({
      className: "projected",
      shape: new Rectangle({
        x: 0, y: 0, width: 80, height: 60, zIndex: 1,
        stateDrawFuncMap: {
          default: {
            afterDraw: () => {
              affine.shape.globalConfig.gco = "destination-out"
            },
          },
        },
      }),
    })
    const plan = createLayerRenderPlan(
      [affine, projected], 0, undefined,
      (child) => child === projected
        ? { mapping: perspectivePlane() }
        : undefined
    )
    const gl = createRecordingContext(layers[0])

    expect(() => executeWebGLRenderPlan({
      context: gl.context,
      items: plan.items,
      getNow: () => 0,
      width: 200,
      height: 120,
      contentToView: identityFrame,
      getProjectiveRasterScale: () => 1,
      forceDraw: true,
    })).toThrow("currently supports source-over Shapes")
    expect(gl.spies.texImage2D).toHaveBeenCalledOnce()
    expect(gl.spies.deleteTexture).toHaveBeenCalledOnce()
    expect(gl.spies.deleteBuffer).toHaveBeenCalledTimes(2)
    expect(gl.spies.deleteProgram).toHaveBeenCalledOnce()
    stage.destroy()
  })

  it("rejects oversized affine and projective rasters before allocating GPU resources", () => {
    const { stage, layers } = createStage({ width: 200, height: 120, layers: 1 })
    const child = stage.tools.appendChild({
      className: "affine",
      shape: new Rectangle({ x: 0, y: 0, width: 80, height: 60 }),
    })
    const affinePlan = createLayerRenderPlan([child], 0)
    const gl = createRecordingContext(layers[0], { maxTextureSize: 64 })
    const props = {
      context: gl.context,
      getNow: () => 0,
      width: 200,
      height: 120,
      contentToView: identityFrame,
      getProjectiveRasterScale: () => 1,
      forceDraw: true,
    }

    expect(() => executeWebGLRenderPlan({ ...props, items: affinePlan.items }))
      .toThrow("affine batch raster 200x120 exceeds WebGL texture limit 64")
    expect(gl.spies.createShader).not.toHaveBeenCalled()

    const projectedPlan = createLayerRenderPlan(
      [child], 0, undefined,
      () => ({ mapping: perspectivePlane() })
    )
    expect(() => executeWebGLRenderPlan({
      ...props,
      items: projectedPlan.items,
      getProjectiveRasterScale: () => 2,
    })).toThrow("exceeds WebGL texture limit 64")
    expect(gl.spies.createShader).not.toHaveBeenCalled()
    stage.destroy()
  })

  it("cleans transient resources when Shape drawing fails", () => {
    const { stage, layers } = createStage({ width: 200, height: 120, layers: 1 })
    const failure = new Error("WebGL source Shape failed")
    const child = stage.tools.appendChild({
      className: "projected",
      shape: new Rectangle({
        x: 0, y: 0, width: 80, height: 60,
        stateDrawFuncMap: {
          default: { commonDraw: () => { throw failure } },
        },
      }),
    })
    const plan = createLayerRenderPlan(
      [child], 0, undefined,
      () => ({ mapping: perspectivePlane() })
    )
    const gl = createRecordingContext(layers[0])

    expect(() => executeWebGLRenderPlan({
      context: gl.context,
      items: plan.items,
      getNow: () => 0,
      width: 200,
      height: 120,
      contentToView: identityFrame,
      getProjectiveRasterScale: () => 1,
      forceDraw: true,
    })).toThrow(failure)
    expect(gl.spies.drawElements).not.toHaveBeenCalled()
    expect(gl.spies.deleteTexture).toHaveBeenCalledOnce()
    expect(gl.spies.deleteBuffer).toHaveBeenCalledTimes(2)
    expect(gl.spies.deleteProgram).toHaveBeenCalledOnce()
    stage.destroy()
  })

  it("cleans transient resources when affine batch drawing fails", () => {
    const { stage, layers } = createStage({ width: 200, height: 120, layers: 1 })
    const failure = new Error("WebGL affine Shape failed")
    const child = stage.tools.appendChild({
      className: "affine",
      shape: new Rectangle({
        x: 0, y: 0, width: 80, height: 60,
        stateDrawFuncMap: {
          default: { commonDraw: () => { throw failure } },
        },
      }),
    })
    const gl = createRecordingContext(layers[0])

    expect(() => executeWebGLRenderPlan({
      context: gl.context,
      items: createLayerRenderPlan([child], 0).items,
      getNow: () => 0,
      width: 200,
      height: 120,
      contentToView: identityFrame,
      getProjectiveRasterScale: () => 1,
      forceDraw: true,
    })).toThrow(failure)
    expect(gl.spies.texImage2D).not.toHaveBeenCalled()
    expect(gl.spies.deleteTexture).toHaveBeenCalledOnce()
    expect(gl.spies.deleteBuffer).toHaveBeenCalledTimes(2)
    expect(gl.spies.deleteProgram).toHaveBeenCalledOnce()
    stage.destroy()
  })

  it("fails while context is lost and rebuilds from no retained state after restore", () => {
    const { stage, layers } = createStage({ width: 200, height: 120, layers: 1 })
    const child = stage.tools.appendChild({
      className: "projected",
      shape: new Rectangle({ x: 0, y: 0, width: 80, height: 60 }),
    })
    const plan = createLayerRenderPlan(
      [child], 0, undefined,
      () => ({ mapping: perspectivePlane() })
    )
    const gl = createRecordingContext(layers[0], { lost: true })
    const props = {
      context: gl.context,
      items: plan.items,
      getNow: () => 0,
      width: 200,
      height: 120,
      contentToView: identityFrame,
      getProjectiveRasterScale: () => 1,
      forceDraw: true,
    }

    expect(() => executeWebGLRenderPlan(props)).toThrow("context is lost")
    expect(gl.spies.createShader).not.toHaveBeenCalled()
    gl.setLost(false)
    executeWebGLRenderPlan(props)
    expect(gl.spies.createProgram).toHaveBeenCalledOnce()
    expect(gl.spies.drawElements).toHaveBeenCalledOnce()
    stage.destroy()
  })

  it("rejects a plane that collapses when converted to WebGL float coordinates", () => {
    const matrix: ProjectiveMatrix2D = {
      m00: 1, m01: 0, m02: 1e15,
      m10: 0, m11: 1, m12: 0,
      m20: 0, m21: 0, m22: 1,
    }
    const projection = {
      mapping: createFiniteProjectiveMapping(
        matrix,
        { x: 0, y: 0, width: 1, height: 1 }
      ),
      mesh: { columns: 1, rows: 1 },
    }
    expect(() => createProjectiveClipVertices(
      projection,
      { scale: 1, width: 1, height: 1 },
      200,
      120,
      identityFrame
    )).toThrow("collapses at float precision")
  })
})

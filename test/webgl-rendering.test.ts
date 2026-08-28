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
    const projection = { mapping, mesh: { columns: 8, rows: 6 } }
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
      { mapping, mesh: { columns: 1, rows: 1 } },
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
      () => ({ mapping: perspectivePlane(), mesh: { columns: 4, rows: 3 } })
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

  it("rejects unsupported plans and capabilities before allocating GPU resources", () => {
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
      .toThrow("requires every RenderItem to have a projection")
    expect(gl.spies.createShader).not.toHaveBeenCalled()

    const projectedPlan = createLayerRenderPlan(
      [child], 0, undefined,
      () => ({ mapping: perspectivePlane(), mesh: { columns: 2, rows: 2 } })
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
      () => ({ mapping: perspectivePlane(), mesh: { columns: 2, rows: 2 } })
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

  it("fails while context is lost and rebuilds from no retained state after restore", () => {
    const { stage, layers } = createStage({ width: 200, height: 120, layers: 1 })
    const child = stage.tools.appendChild({
      className: "projected",
      shape: new Rectangle({ x: 0, y: 0, width: 80, height: 60 }),
    })
    const plan = createLayerRenderPlan(
      [child], 0, undefined,
      () => ({ mapping: perspectivePlane(), mesh: { columns: 2, rows: 2 } })
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

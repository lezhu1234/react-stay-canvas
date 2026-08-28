import type { InstantShape } from "../../shapes/instantShape"
import type { CoordinateFrame } from "../coordinates/coordinateSystem"
import {
  mapProjectiveLocalToContentPoint,
  type FiniteProjectiveMapping,
} from "../transforms/projective2D"
import {
  assertProjectiveShapeCanRasterize,
  positiveFinite,
  positiveInteger,
  rasterizeProjectiveShape,
  resolveProjectiveRasterSpec,
  type ProjectiveRasterSpec,
} from "./projectiveRaster"
import {
  resolveRenderItemProjection,
  type ProjectiveRenderProjection,
  type RenderItem,
} from "./renderPlan"
import { rasterizeWebGLAffineBatch } from "./webGLAffineBatch"

interface WebGLRenderProps {
  readonly context: WebGLRenderingContext
  readonly items: readonly RenderItem[]
  readonly getNow: () => number
  readonly width: number
  readonly height: number
  readonly contentToView: CoordinateFrame["contentToView"]
  readonly getProjectiveRasterScale: (item: RenderItem) => number
  readonly forceDraw?: boolean
}

interface PreparedProjectiveItem {
  readonly kind: "projective"
  readonly item: RenderItem & { readonly projection: ProjectiveRenderProjection }
  readonly raster: ProjectiveRasterSpec
  readonly vertices: Float32Array
}

interface WebGLResources {
  readonly program: WebGLProgram
  readonly vertexBuffer: WebGLBuffer
  readonly indexBuffer: WebGLBuffer
  readonly texture: WebGLTexture
  readonly positionLocation: number
  readonly textureLocation: number
  readonly samplerLocation: WebGLUniformLocation
}

const VERTEX_SHADER = `
attribute vec3 a_clip_position;
attribute vec2 a_texture_coordinate;
varying vec2 v_texture_coordinate;

void main() {
  gl_Position = vec4(a_clip_position.xy, 0.0, a_clip_position.z);
  v_texture_coordinate = a_texture_coordinate;
}
`

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_texture;
varying vec2 v_texture_coordinate;

void main() {
  gl_FragColor = texture2D(u_texture, v_texture_coordinate);
}
`

const QUAD_INDICES = new Uint16Array([0, 1, 2, 0, 2, 3])
const FULL_SURFACE_VERTICES = new Float32Array([
  -1, 1, 1, 0, 1,
  1, 1, 1, 1, 1,
  1, -1, 1, 1, 0,
  -1, -1, 1, 0, 0,
])

function finite(value: number, name: string) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`)
  return value
}

function assertContextAvailable(context: WebGLRenderingContext) {
  if (context.isContextLost()) {
    throw new Error("WebGL projective rendering cannot run while the context is lost")
  }
}

function assertNoWebGLError(context: WebGLRenderingContext, operation: string) {
  const error = context.getError()
  if (error === context.NO_ERROR) return
  if (error === context.CONTEXT_LOST_WEBGL || context.isContextLost()) {
    throw new Error("WebGL projective rendering cannot run while the context is lost")
  }
  throw new Error(`WebGL projective rendering failed during ${operation}: ${error}`)
}

function projectiveCorners(mapping: FiniteProjectiveMapping) {
  const { x, y, width, height } = mapping.localDomain
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ] as const
}

function normalizedDenominators(mapping: FiniteProjectiveMapping) {
  const corners = projectiveCorners(mapping)
  const matrix = mapping.localToContent
  const pointScale = Math.max(
    1,
    ...corners.flatMap(({ x, y }) => [Math.abs(x), Math.abs(y)])
  )
  const matrixScale = Math.max(
    Math.abs(matrix.m20),
    Math.abs(matrix.m21),
    Math.abs(matrix.m22)
  )
  if (matrixScale === 0) {
    throw new RangeError("projective mapping must have a non-zero denominator")
  }
  return corners.map(({ x, y }) =>
    matrix.m20 / matrixScale * (x / pointScale) +
    matrix.m21 / matrixScale * (y / pointScale) +
    matrix.m22 / matrixScale / pointScale
  )
}

function triangleArea(
  first: readonly [number, number],
  second: readonly [number, number],
  third: readonly [number, number]
) {
  return (second[0] - first[0]) * (third[1] - first[1]) -
    (second[1] - first[1]) * (third[0] - first[0])
}

/** @internal Builds four homogeneous clip-space vertices for one projective plane. */
export function createProjectiveClipVertices(
  projection: ProjectiveRenderProjection,
  raster: ProjectiveRasterSpec,
  width: number,
  height: number,
  contentToView: CoordinateFrame["contentToView"]
) {
  positiveFinite(width, "WebGL logical width")
  positiveFinite(height, "WebGL logical height")
  const offsetX = finite(contentToView.offsetX, "WebGL Content-to-View offsetX")
  const offsetY = finite(contentToView.offsetY, "WebGL Content-to-View offsetY")
  const viewScale = positiveFinite(
    contentToView.scale,
    "WebGL Content-to-View scale"
  )
  const corners = projectiveCorners(projection.mapping)
  const denominators = normalizedDenominators(projection.mapping)
  const denominatorSign = Math.sign(denominators[0])
  if (denominatorSign === 0 || denominators.some((value) =>
    !Number.isFinite(value) || Math.sign(value) !== denominatorSign)) {
    throw new RangeError("projective WebGL plane must have finite positive clip w")
  }

  const homogeneous = corners.map((corner, index) => {
    const content = mapProjectiveLocalToContentPoint(projection.mapping, corner)
    if (!content) {
      throw new RangeError("projective WebGL corner must have a finite mapping")
    }
    const viewX = content.x * viewScale + offsetX
    const viewY = content.y * viewScale + offsetY
    const ndcX = 2 * viewX / width - 1
    const ndcY = 1 - 2 * viewY / height
    const w = denominators[index] * denominatorSign
    const clip = { x: ndcX * w, y: ndcY * w, w }
    if (!Number.isFinite(clip.x) || !Number.isFinite(clip.y) || !Number.isFinite(w)) {
      throw new RangeError("projective WebGL clip position must be finite")
    }
    return clip
  })
  const positionScale = Math.max(
    ...homogeneous.flatMap(({ x, y, w }) => [Math.abs(x), Math.abs(y), Math.abs(w)])
  )
  if (!Number.isFinite(positionScale) || positionScale === 0) {
    throw new RangeError("projective WebGL clip plane must be representable")
  }

  const rasterScale = positiveFinite(raster.scale, "projective raster scale")
  const rasterWidth = positiveInteger(raster.width, "projective raster width")
  const rasterHeight = positiveInteger(raster.height, "projective raster height")
  const sampledWidth = projection.mapping.localDomain.width * rasterScale
  const sampledHeight = projection.mapping.localDomain.height * rasterScale
  const textureRight = sampledWidth / rasterWidth
  const textureBottom = 1 - sampledHeight / rasterHeight
  if (textureRight <= 0 || textureRight > 1 ||
      textureBottom < 0 || textureBottom >= 1) {
    throw new RangeError("projective WebGL raster spec must cover its local domain")
  }
  const textureCoordinates = [
    [0, 1],
    [textureRight, 1],
    [textureRight, textureBottom],
    [0, textureBottom],
  ] as const
  const vertices = new Float32Array(4 * 5)
  homogeneous.forEach(({ x, y, w }, index) => {
    const offset = index * 5
    vertices[offset] = x / positionScale
    vertices[offset + 1] = y / positionScale
    vertices[offset + 2] = w / positionScale
    vertices[offset + 3] = textureCoordinates[index][0]
    vertices[offset + 4] = textureCoordinates[index][1]
    if (vertices[offset + 2] === 0) {
      throw new RangeError("projective WebGL clip w exceeds float precision")
    }
  })

  const ndc = Array.from({ length: 4 }, (_, index) => {
    const offset = index * 5
    return [
      vertices[offset] / vertices[offset + 2],
      vertices[offset + 1] / vertices[offset + 2],
    ] as const
  })
  if (triangleArea(ndc[0], ndc[1], ndc[2]) === 0 ||
      triangleArea(ndc[0], ndc[2], ndc[3]) === 0) {
    throw new RangeError("projective WebGL plane collapses at float precision")
  }
  return vertices
}

function compileShader(
  context: WebGLRenderingContext,
  type: number,
  source: string
) {
  const shader = context.createShader(type)
  if (!shader) throw new Error("Unable to create WebGL shader")
  context.shaderSource(shader, source)
  context.compileShader(shader)
  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    const info = context.getShaderInfoLog(shader) || "unknown shader error"
    context.deleteShader(shader)
    throw new Error(`Unable to compile WebGL shader: ${info}`)
  }
  return shader
}

function createProgram(context: WebGLRenderingContext) {
  const vertexShader = compileShader(context, context.VERTEX_SHADER, VERTEX_SHADER)
  let fragmentShader: WebGLShader | undefined
  let program: WebGLProgram | undefined
  try {
    fragmentShader = compileShader(context, context.FRAGMENT_SHADER, FRAGMENT_SHADER)
    program = context.createProgram() ?? undefined
    if (!program) throw new Error("Unable to create WebGL program")
    context.attachShader(program, vertexShader)
    context.attachShader(program, fragmentShader)
    context.linkProgram(program)
    if (!context.getProgramParameter(program, context.LINK_STATUS)) {
      const info = context.getProgramInfoLog(program) || "unknown program error"
      throw new Error(`Unable to link WebGL program: ${info}`)
    }
    return program
  } catch (error) {
    if (program) context.deleteProgram(program)
    throw error
  } finally {
    context.deleteShader(vertexShader)
    if (fragmentShader) context.deleteShader(fragmentShader)
  }
}

function requireBuffer(context: WebGLRenderingContext, name: string) {
  const buffer = context.createBuffer()
  if (!buffer) throw new Error(`Unable to create WebGL ${name} buffer`)
  return buffer
}

function createResources(context: WebGLRenderingContext): WebGLResources {
  const program = createProgram(context)
  let vertexBuffer: WebGLBuffer | undefined
  let indexBuffer: WebGLBuffer | undefined
  let texture: WebGLTexture | undefined
  try {
    vertexBuffer = requireBuffer(context, "vertex")
    indexBuffer = requireBuffer(context, "index")
    texture = context.createTexture() ?? undefined
    if (!texture) throw new Error("Unable to create WebGL texture")
    const positionLocation = context.getAttribLocation(program, "a_clip_position")
    const textureLocation = context.getAttribLocation(program, "a_texture_coordinate")
    const samplerLocation = context.getUniformLocation(program, "u_texture")
    if (positionLocation < 0 || textureLocation < 0 || !samplerLocation) {
      throw new Error("Unable to resolve WebGL projective shader inputs")
    }
    return {
      program,
      vertexBuffer,
      indexBuffer,
      texture,
      positionLocation,
      textureLocation,
      samplerLocation,
    }
  } catch (error) {
    if (texture) context.deleteTexture(texture)
    if (indexBuffer) context.deleteBuffer(indexBuffer)
    if (vertexBuffer) context.deleteBuffer(vertexBuffer)
    context.deleteProgram(program)
    throw error
  }
}

function deleteResources(
  context: WebGLRenderingContext,
  resources: WebGLResources
) {
  context.disableVertexAttribArray(resources.textureLocation)
  context.disableVertexAttribArray(resources.positionLocation)
  context.bindTexture(context.TEXTURE_2D, null)
  context.bindBuffer(context.ELEMENT_ARRAY_BUFFER, null)
  context.bindBuffer(context.ARRAY_BUFFER, null)
  context.useProgram(null)
  context.deleteTexture(resources.texture)
  context.deleteBuffer(resources.indexBuffer)
  context.deleteBuffer(resources.vertexBuffer)
  context.deleteProgram(resources.program)
}

function prepareProjectiveItem(
  item: RenderItem,
  projection: ProjectiveRenderProjection,
  maxTextureSize: number,
  props: WebGLRenderProps
): PreparedProjectiveItem {
  const projectiveItem = { ...item, projection }
  const raster = resolveProjectiveRasterSpec(
    projection.mapping,
    props.getProjectiveRasterScale(projectiveItem)
  )
  if (raster.width > maxTextureSize || raster.height > maxTextureSize) {
    throw new RangeError(
      `projective raster ${raster.width}x${raster.height} exceeds WebGL texture limit ${maxTextureSize}`
    )
  }
  return {
    kind: "projective",
    item: projectiveItem,
    raster,
    vertices: createProjectiveClipVertices(
      projection,
      raster,
      props.width,
      props.height,
      props.contentToView
    ),
  }
}

interface InitialPlanValidation {
  readonly maxTextureSize: number
  readonly preparedProjectiveItems: ReadonlyMap<RenderItem, PreparedProjectiveItem>
  readonly requiresSourceOver: boolean
}

function assertAffineRasterWithinTextureLimit(
  context: WebGLRenderingContext,
  maxTextureSize: number
) {
  const rasterWidth = positiveInteger(
    context.drawingBufferWidth,
    "WebGL affine batch raster width"
  )
  const rasterHeight = positiveInteger(
    context.drawingBufferHeight,
    "WebGL affine batch raster height"
  )
  if (rasterWidth > maxTextureSize || rasterHeight > maxTextureSize) {
    throw new RangeError(
      `affine batch raster ${rasterWidth}x${rasterHeight} exceeds WebGL texture limit ${maxTextureSize}`
    )
  }
}

function validateInitialPlan(props: WebGLRenderProps): InitialPlanValidation {
  const { context, items, width, height } = props
  const maxTextureSize = context.getParameter(context.MAX_TEXTURE_SIZE) as number
  positiveFinite(maxTextureSize, "WebGL maximum texture size")
  positiveFinite(width, "WebGL logical width")
  positiveFinite(height, "WebGL logical height")

  const hasStableProjectiveItems = items.some(({ projection }) => Boolean(projection))
  if (hasStableProjectiveItems) {
    // Once a projective item splits affine drawing into intermediate passes,
    // destination-dependent composition can no longer observe one shared 2D
    // destination. Reject it before drawing rather than changing its meaning.
    items.forEach(({ shape }) => assertProjectiveShapeCanRasterize(shape))
  }

  const preparedProjectiveItems = new Map<RenderItem, PreparedProjectiveItem>()
  items.forEach((item) => {
    if (!item.projection) return
    preparedProjectiveItems.set(
      item,
      prepareProjectiveItem(item, item.projection, maxTextureSize, props)
    )
  })

  // Only the first item's current kind is authoritative before callbacks run.
  // Later Child-owned placements are resolved at their own draw boundaries.
  if (items[0] && !resolveRenderItemProjection(items[0])) {
    assertAffineRasterWithinTextureLimit(context, maxTextureSize)
  }
  return {
    maxTextureSize,
    preparedProjectiveItems,
    requiresSourceOver: hasStableProjectiveItems,
  }
}

function clearTarget(context: WebGLRenderingContext) {
  context.bindFramebuffer(context.FRAMEBUFFER, null)
  context.viewport(0, 0, context.drawingBufferWidth, context.drawingBufferHeight)
  context.disable(context.CULL_FACE)
  context.disable(context.DEPTH_TEST)
  context.disable(context.SCISSOR_TEST)
  context.disable(context.STENCIL_TEST)
  context.disable(context.SAMPLE_COVERAGE)
  context.disable(context.SAMPLE_ALPHA_TO_COVERAGE)
  context.depthMask(false)
  context.colorMask(true, true, true, true)
  context.enable(context.BLEND)
  context.blendEquation(context.FUNC_ADD)
  context.blendFunc(context.ONE, context.ONE_MINUS_SRC_ALPHA)
  context.clearColor(0, 0, 0, 0)
  context.clear(context.COLOR_BUFFER_BIT)
}

function configurePass(
  context: WebGLRenderingContext,
  resources: WebGLResources
) {
  clearTarget(context)
  context.useProgram(resources.program)
  context.bindBuffer(context.ELEMENT_ARRAY_BUFFER, resources.indexBuffer)
  context.bufferData(context.ELEMENT_ARRAY_BUFFER, QUAD_INDICES, context.STATIC_DRAW)
  context.bindBuffer(context.ARRAY_BUFFER, resources.vertexBuffer)
  const stride = 5 * Float32Array.BYTES_PER_ELEMENT
  context.enableVertexAttribArray(resources.positionLocation)
  context.vertexAttribPointer(
    resources.positionLocation,
    3,
    context.FLOAT,
    false,
    stride,
    0
  )
  context.enableVertexAttribArray(resources.textureLocation)
  context.vertexAttribPointer(
    resources.textureLocation,
    2,
    context.FLOAT,
    false,
    stride,
    3 * Float32Array.BYTES_PER_ELEMENT
  )
  context.activeTexture(context.TEXTURE0)
  context.bindTexture(context.TEXTURE_2D, resources.texture)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR)
  context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, 1)
  context.pixelStorei(context.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1)
  context.uniform1i(resources.samplerLocation, 0)
}

function uploadAndDraw(
  context: WebGLRenderingContext,
  resources: WebGLResources,
  vertices: Float32Array,
  surface: HTMLCanvasElement | OffscreenCanvas,
  operation: string
) {
  context.bindBuffer(context.ARRAY_BUFFER, resources.vertexBuffer)
  context.bufferData(context.ARRAY_BUFFER, vertices, context.STREAM_DRAW)
  context.bindTexture(context.TEXTURE_2D, resources.texture)
  context.texImage2D(
    context.TEXTURE_2D,
    0,
    context.RGBA,
    context.RGBA,
    context.UNSIGNED_BYTE,
    surface
  )
  context.drawElements(context.TRIANGLES, QUAD_INDICES.length, context.UNSIGNED_SHORT, 0)
  assertNoWebGLError(context, operation)
}

function drawProjectiveItem(
  context: WebGLRenderingContext,
  resources: WebGLResources,
  prepared: PreparedProjectiveItem,
  props: WebGLRenderProps
) {
  const { item, raster, vertices } = prepared
  const surface = rasterizeProjectiveShape({
    targetCanvas: context.canvas,
    shape: item.shape as InstantShape,
    mapping: item.projection.mapping,
    spec: raster,
    now: props.getNow(),
    width: props.width,
    height: props.height,
    forceDraw: props.forceDraw,
  })
  uploadAndDraw(context, resources, vertices, surface, "projective draw")
}

function prepareAffineBatchSurface(
  context: WebGLRenderingContext,
  items: readonly RenderItem[],
  requiresSourceOver: boolean,
  maxTextureSize: number,
  props: WebGLRenderProps
) {
  assertAffineRasterWithinTextureLimit(context, maxTextureSize)
  return rasterizeWebGLAffineBatch({
    targetCanvas: context.canvas,
    rasterWidth: context.drawingBufferWidth,
    rasterHeight: context.drawingBufferHeight,
    logicalWidth: props.width,
    logicalHeight: props.height,
    contentToView: props.contentToView,
    items,
    requiresSourceOver,
    getNow: props.getNow,
    forceDraw: props.forceDraw,
  })
}

/**
 * @internal Executes one affine/projective RenderPlan pass in global item
 * order. Consecutive affine items share a transparent full-surface raster; a
 * projective item remains its own finite-domain raster. The caller owns the
 * WebGL context and its loss/restore events; this function owns no persistent
 * state and releases every GPU resource it creates before returning.
 */
export function executeWebGLRenderPlan(props: WebGLRenderProps) {
  const { context } = props
  assertContextAvailable(context)
  assertNoWebGLError(context, "pass start")
  const initialPlan = validateInitialPlan(props)
  if (props.items.length === 0) {
    clearTarget(context)
    assertNoWebGLError(context, "empty projective pass")
    return
  }

  const resources = createResources(context)
  try {
    configurePass(context, resources)
    let index = 0
    let projectiveSeen = false
    while (index < props.items.length) {
      const item = props.items[index]
      const projection = resolveRenderItemProjection(item)
      if (projection) {
        assertProjectiveShapeCanRasterize(item.shape)
        const cached = initialPlan.preparedProjectiveItems.get(item)
        const prepared = cached?.item.projection.mapping === projection.mapping
          ? cached
          : prepareProjectiveItem(
              item,
              projection,
              initialPlan.maxTextureSize,
              props
            )
        drawProjectiveItem(context, resources, prepared, props)
        projectiveSeen = true
        index += 1
        continue
      }

      // Pass the whole remaining run to the rasterizer. It resolves every
      // later Child only after earlier Shape callbacks have completed and
      // stops at the first projective boundary actually realized.
      const candidates = props.items.slice(index)
      const requiresSourceOver = initialPlan.requiresSourceOver ||
        projectiveSeen
      const affineBatch = prepareAffineBatchSurface(
        context,
        candidates,
        requiresSourceOver,
        initialPlan.maxTextureSize,
        props
      )
      if (affineBatch.consumed === 0) continue

      const nextIndex = index + affineBatch.consumed
      const realizedProjectiveBoundary = !requiresSourceOver &&
        nextIndex < props.items.length &&
        Boolean(resolveRenderItemProjection(props.items[nextIndex]))
      if (realizedProjectiveBoundary && !affineBatch.consumedAllSourceOver) {
        throw new RangeError(
          "projective rendering currently supports source-over Shapes"
        )
      }
      uploadAndDraw(
        context,
        resources,
        FULL_SURFACE_VERTICES,
        affineBatch.canvas,
        "affine batch draw"
      )
      index = nextIndex
    }
    assertContextAvailable(context)
  } finally {
    deleteResources(context, resources)
  }
}

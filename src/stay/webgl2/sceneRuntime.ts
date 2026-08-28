import { multiplyMatrix4 } from "./math3D"
import { Mesh } from "./mesh"
import { PerspectiveCamera } from "./perspectiveCamera"

interface PipelineResources {
  readonly program: WebGLProgram
  readonly modelViewProjectionLocation: WebGLUniformLocation
  readonly colorLocation: WebGLUniformLocation
}

interface MeshResources {
  readonly vertexArray: WebGLVertexArrayObject
  readonly positionBuffer: WebGLBuffer
  readonly indexBuffer: WebGLBuffer
  geometryRevision: number
  indexCount: number
}

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 a_position;
uniform mat4 u_model_view_projection;

void main() {
  gl_Position = u_model_view_projection * vec4(a_position, 1.0);
}
`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 output_color;

void main() {
  output_color = u_color;
}
`

function assertContextAvailable(context: WebGL2RenderingContext) {
  if (context.isContextLost()) {
    throw new Error("WebGL2 scene rendering cannot run while the context is lost")
  }
}

function assertWebGL2Context(context: WebGL2RenderingContext) {
  if (typeof context.createVertexArray !== "function" ||
      typeof context.bindVertexArray !== "function") {
    throw new TypeError("WebGL2 scene runtime requires a WebGL2 context")
  }
}

function assertNoWebGLError(context: WebGL2RenderingContext, operation: string) {
  const error = context.getError()
  if (error === context.NO_ERROR) return
  if (error === context.CONTEXT_LOST_WEBGL || context.isContextLost()) {
    throw new Error("WebGL2 scene rendering cannot run while the context is lost")
  }
  throw new Error(`WebGL2 scene rendering failed during ${operation}: ${error}`)
}

function compileShader(
  context: WebGL2RenderingContext,
  type: number,
  source: string
) {
  const shader = context.createShader(type)
  if (!shader) throw new Error("Unable to create WebGL2 shader")
  context.shaderSource(shader, source)
  context.compileShader(shader)
  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    const info = context.getShaderInfoLog(shader) || "unknown shader error"
    context.deleteShader(shader)
    throw new Error(`Unable to compile WebGL2 shader: ${info}`)
  }
  return shader
}

function createPipeline(context: WebGL2RenderingContext): PipelineResources {
  const vertexShader = compileShader(context, context.VERTEX_SHADER, VERTEX_SHADER)
  let fragmentShader: WebGLShader | undefined
  let program: WebGLProgram | undefined
  try {
    fragmentShader = compileShader(context, context.FRAGMENT_SHADER, FRAGMENT_SHADER)
    program = context.createProgram() ?? undefined
    if (!program) throw new Error("Unable to create WebGL2 program")
    context.attachShader(program, vertexShader)
    context.attachShader(program, fragmentShader)
    context.linkProgram(program)
    if (!context.getProgramParameter(program, context.LINK_STATUS)) {
      const info = context.getProgramInfoLog(program) || "unknown program error"
      throw new Error(`Unable to link WebGL2 program: ${info}`)
    }
    const modelViewProjectionLocation = context.getUniformLocation(
      program,
      "u_model_view_projection"
    )
    const colorLocation = context.getUniformLocation(program, "u_color")
    if (!modelViewProjectionLocation || !colorLocation) {
      throw new Error("Unable to resolve WebGL2 scene shader inputs")
    }
    return { program, modelViewProjectionLocation, colorLocation }
  } catch (error) {
    if (program) context.deleteProgram(program)
    throw error
  } finally {
    context.deleteShader(vertexShader)
    if (fragmentShader) context.deleteShader(fragmentShader)
  }
}

function requireBuffer(context: WebGL2RenderingContext, name: string) {
  const buffer = context.createBuffer()
  if (!buffer) throw new Error(`Unable to create WebGL2 ${name} buffer`)
  return buffer
}

function createMeshResources(
  context: WebGL2RenderingContext,
  mesh: Mesh
): MeshResources {
  const vertexArray = context.createVertexArray()
  if (!vertexArray) throw new Error("Unable to create WebGL2 vertex array")
  let positionBuffer: WebGLBuffer | undefined
  let indexBuffer: WebGLBuffer | undefined
  try {
    positionBuffer = requireBuffer(context, "position")
    indexBuffer = requireBuffer(context, "index")
    const geometry = mesh.copyGeometrySnapshot()
    context.bindVertexArray(vertexArray)
    context.bindBuffer(context.ARRAY_BUFFER, positionBuffer)
    context.bufferData(context.ARRAY_BUFFER, geometry.positions, context.STATIC_DRAW)
    context.enableVertexAttribArray(0)
    context.vertexAttribPointer(0, 3, context.FLOAT, false, 0, 0)
    context.bindBuffer(context.ELEMENT_ARRAY_BUFFER, indexBuffer)
    context.bufferData(context.ELEMENT_ARRAY_BUFFER, geometry.indices, context.STATIC_DRAW)
    assertNoWebGLError(context, "Mesh geometry upload")
    context.bindVertexArray(null)
    return {
      vertexArray,
      positionBuffer,
      indexBuffer,
      geometryRevision: geometry.revision,
      indexCount: geometry.indices.length,
    }
  } catch (error) {
    context.bindVertexArray(null)
    if (indexBuffer) context.deleteBuffer(indexBuffer)
    if (positionBuffer) context.deleteBuffer(positionBuffer)
    context.deleteVertexArray(vertexArray)
    throw error
  }
}

function uploadChangedGeometry(
  context: WebGL2RenderingContext,
  mesh: Mesh,
  resources: MeshResources
) {
  if (resources.geometryRevision === mesh.geometryRevision) return
  const geometry = mesh.copyGeometrySnapshot()
  context.bindVertexArray(resources.vertexArray)
  context.bindBuffer(context.ARRAY_BUFFER, resources.positionBuffer)
  context.bufferData(context.ARRAY_BUFFER, geometry.positions, context.STATIC_DRAW)
  context.bindBuffer(context.ELEMENT_ARRAY_BUFFER, resources.indexBuffer)
  context.bufferData(context.ELEMENT_ARRAY_BUFFER, geometry.indices, context.STATIC_DRAW)
  assertNoWebGLError(context, "Mesh geometry upload")
  resources.geometryRevision = geometry.revision
  resources.indexCount = geometry.indices.length
}

/**
 * @internal Owns one WebGL2 context's derived GPU cache. Mesh and Camera CPU
 * state stay authoritative; context restoration forgets every invalid handle
 * and recreates it lazily on the next render.
 */
export class WebGL2SceneRuntime {
  #context: WebGL2RenderingContext
  #pipeline?: PipelineResources
  readonly #meshes = new Map<Mesh, MeshResources>()
  #disposed = false

  constructor(context: WebGL2RenderingContext) {
    assertWebGL2Context(context)
    assertContextAvailable(context)
    this.#context = context
  }

  render(meshes: readonly Mesh[], camera: PerspectiveCamera) {
    this.#assertActive()
    const context = this.#context
    assertContextAvailable(context)
    assertNoWebGLError(context, "frame start")
    const width = context.drawingBufferWidth
    const height = context.drawingBufferHeight
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      throw new RangeError("WebGL2 drawing buffer must have positive dimensions")
    }

    this.#pruneMeshResources(new Set(meshes))
    this.#configureFrame(width, height)
    if (meshes.length === 0) {
      assertNoWebGLError(context, "empty frame")
      return
    }

    const pipeline = this.#pipeline ??= createPipeline(context)
    const viewProjection = camera.getViewProjection(width / height)
    context.useProgram(pipeline.program)
    try {
      meshes.forEach((mesh) => {
        const resources = this.#meshResources(mesh)
        uploadChangedGeometry(context, mesh, resources)
        context.bindVertexArray(resources.vertexArray)
        context.uniformMatrix4fv(
          pipeline.modelViewProjectionLocation,
          false,
          multiplyMatrix4(viewProjection, mesh.getModelMatrix())
        )
        context.uniform4fv(pipeline.colorLocation, new Float32Array(mesh.getColor()))
        context.drawElements(
          context.TRIANGLES,
          resources.indexCount,
          context.UNSIGNED_SHORT,
          0
        )
      })
      assertNoWebGLError(context, "frame draw")
      assertContextAvailable(context)
    } finally {
      context.bindVertexArray(null)
      context.useProgram(null)
    }
  }

  restoreContext(context: WebGL2RenderingContext = this.#context) {
    this.#assertActive()
    assertWebGL2Context(context)
    assertContextAvailable(context)
    if (context !== this.#context && !this.#context.isContextLost()) {
      this.#deleteResources()
    } else {
      this.#forgetResources()
    }
    this.#context = context
  }

  dispose() {
    if (this.#disposed) return
    if (this.#context.isContextLost()) {
      this.#forgetResources()
    } else {
      this.#deleteResources()
    }
    this.#disposed = true
  }

  #assertActive() {
    if (this.#disposed) throw new Error("WebGL2 scene runtime has been disposed")
  }

  #configureFrame(width: number, height: number) {
    const context = this.#context
    context.bindFramebuffer(context.FRAMEBUFFER, null)
    context.viewport(0, 0, width, height)
    context.disable(context.CULL_FACE)
    context.disable(context.BLEND)
    context.disable(context.SCISSOR_TEST)
    context.disable(context.STENCIL_TEST)
    context.colorMask(true, true, true, true)
    context.enable(context.DEPTH_TEST)
    context.depthFunc(context.LEQUAL)
    context.depthMask(true)
    context.clearColor(0, 0, 0, 0)
    context.clearDepth(1)
    context.clear(context.COLOR_BUFFER_BIT | context.DEPTH_BUFFER_BIT)
  }

  #meshResources(mesh: Mesh) {
    const existing = this.#meshes.get(mesh)
    if (existing) return existing
    const created = createMeshResources(this.#context, mesh)
    this.#meshes.set(mesh, created)
    return created
  }

  #pruneMeshResources(liveMeshes: ReadonlySet<Mesh>) {
    this.#meshes.forEach((resources, mesh) => {
      if (liveMeshes.has(mesh)) return
      this.#deleteMeshResources(resources)
      this.#meshes.delete(mesh)
    })
  }

  #deleteMeshResources(resources: MeshResources) {
    this.#context.deleteBuffer(resources.indexBuffer)
    this.#context.deleteBuffer(resources.positionBuffer)
    this.#context.deleteVertexArray(resources.vertexArray)
  }

  #deleteResources() {
    this.#meshes.forEach((resources) => this.#deleteMeshResources(resources))
    this.#meshes.clear()
    if (this.#pipeline) this.#context.deleteProgram(this.#pipeline.program)
    this.#pipeline = undefined
  }

  #forgetResources() {
    this.#meshes.clear()
    this.#pipeline = undefined
  }
}

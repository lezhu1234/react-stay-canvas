import {
  webGL2DirectionalLightLimit,
  type WebGLLight,
} from "./light"
import {
  multiplyMatrix4,
  normalMatrix3FromMatrix4,
  type Matrix4,
} from "./math3D"
import { Mesh } from "./mesh"
import {
  meshMaterialIsTransparent,
  type MeshMaterial,
} from "./material"
import { PerspectiveCamera } from "./perspectiveCamera"

interface UnlitPipelineResources {
  readonly kind: "unlit"
  readonly program: WebGLProgram
  readonly modelViewProjectionLocation: WebGLUniformLocation
  readonly colorLocation: WebGLUniformLocation
}

interface LambertPipelineResources {
  readonly kind: "lambert"
  readonly program: WebGLProgram
  readonly viewProjectionLocation: WebGLUniformLocation
  readonly modelLocation: WebGLUniformLocation
  readonly normalMatrixLocation: WebGLUniformLocation
  readonly colorLocation: WebGLUniformLocation
  readonly ambientLightLocation: WebGLUniformLocation
  readonly directionalLightCountLocation: WebGLUniformLocation
  readonly directionToLightsLocation: WebGLUniformLocation
  readonly directionalLightColorsLocation: WebGLUniformLocation
}

interface GlassPipelineResources {
  readonly kind: "glass"
  readonly program: WebGLProgram
  readonly viewProjectionLocation: WebGLUniformLocation
  readonly modelLocation: WebGLUniformLocation
  readonly normalMatrixLocation: WebGLUniformLocation
  readonly colorLocation: WebGLUniformLocation
  readonly ambientLightLocation: WebGLUniformLocation
  readonly directionalLightCountLocation: WebGLUniformLocation
  readonly directionToLightsLocation: WebGLUniformLocation
  readonly directionalLightColorsLocation: WebGLUniformLocation
  readonly cameraPositionLocation: WebGLUniformLocation
}

type LitPipelineResources = LambertPipelineResources | GlassPipelineResources
type PipelineResources = UnlitPipelineResources | LitPipelineResources

interface MeshResources {
  readonly vertexArray: WebGLVertexArrayObject
  readonly positionBuffer: WebGLBuffer
  readonly normalBuffer: WebGLBuffer
  readonly indexBuffer: WebGLBuffer
  geometryRevision: number
  indexCount: number
}

interface LightingSnapshot {
  readonly ambient: Float32Array
  readonly directionToLights: Float32Array
  readonly directionalColors: Float32Array
  readonly directionalCount: number
}

interface DrawItem {
  readonly mesh: Mesh
  readonly material: MeshMaterial
}

interface TransparentDrawItem extends DrawItem {
  readonly inputOrder: number
  readonly viewDepth: number
}

const UNLIT_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 a_position;
uniform mat4 u_model_view_projection;

void main() {
  gl_Position = u_model_view_projection * vec4(a_position, 1.0);
}
`

const LAMBERT_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
uniform mat4 u_view_projection;
uniform mat4 u_model;
uniform mat3 u_normal_matrix;
out vec3 world_normal;

void main() {
  gl_Position = u_view_projection * u_model * vec4(a_position, 1.0);
  world_normal = normalize(u_normal_matrix * a_normal);
}
`

const GLASS_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
uniform mat4 u_view_projection;
uniform mat4 u_model;
uniform mat3 u_normal_matrix;
out vec3 world_normal;
out vec3 world_position;

void main() {
  vec4 world = u_model * vec4(a_position, 1.0);
  gl_Position = u_view_projection * world;
  world_normal = normalize(u_normal_matrix * a_normal);
  world_position = world.xyz;
}
`

const UNLIT_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 output_color;

void main() {
  output_color = u_color;
}
`

const LAMBERT_FRAGMENT_SHADER = `#version 300 es
precision highp float;
#define MAX_DIRECTIONAL_LIGHTS ${webGL2DirectionalLightLimit}
uniform vec4 u_color;
uniform vec3 u_ambient_light;
uniform int u_directional_light_count;
uniform vec3 u_direction_to_lights[MAX_DIRECTIONAL_LIGHTS];
uniform vec3 u_directional_light_colors[MAX_DIRECTIONAL_LIGHTS];
in vec3 world_normal;
out vec4 output_color;

void main() {
  vec3 normal = normalize(world_normal);
  if (!gl_FrontFacing) normal = -normal;
  vec3 illumination = u_ambient_light;
  for (int index = 0; index < MAX_DIRECTIONAL_LIGHTS; index++) {
    if (index >= u_directional_light_count) break;
    float diffuse = max(dot(normal, u_direction_to_lights[index]), 0.0);
    illumination += u_directional_light_colors[index] * diffuse;
  }
  output_color = vec4(u_color.rgb * illumination, 1.0);
}
`

const GLASS_FRAGMENT_SHADER = `#version 300 es
precision highp float;
#define MAX_DIRECTIONAL_LIGHTS ${webGL2DirectionalLightLimit}
uniform vec4 u_color;
uniform vec3 u_ambient_light;
uniform int u_directional_light_count;
uniform vec3 u_direction_to_lights[MAX_DIRECTIONAL_LIGHTS];
uniform vec3 u_directional_light_colors[MAX_DIRECTIONAL_LIGHTS];
uniform vec3 u_camera_position;
in vec3 world_normal;
in vec3 world_position;
out vec4 output_color;

void main() {
  vec3 normal = normalize(world_normal);
  if (!gl_FrontFacing) normal = -normal;
  vec3 illumination = u_ambient_light;
  for (int index = 0; index < MAX_DIRECTIONAL_LIGHTS; index++) {
    if (index >= u_directional_light_count) break;
    float diffuse = max(dot(normal, u_direction_to_lights[index]), 0.0);
    illumination += u_directional_light_colors[index] * diffuse;
  }
  vec3 view_direction = normalize(u_camera_position - world_position);
  float fresnel = pow(1.0 - abs(dot(normal, view_direction)), 3.0);
  vec3 lit_tint = u_color.rgb * illumination;
  vec3 surface_color = mix(lit_tint, vec3(1.0), fresnel * 0.42);
  float alpha = u_color.a + (1.0 - u_color.a) * fresnel * 0.34;
  output_color = vec4(surface_color * alpha, alpha);
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

function requireUniform(
  context: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string
) {
  const location = context.getUniformLocation(program, name)
  if (location === null) throw new Error(`Unable to resolve WebGL2 scene shader input ${name}`)
  return location
}

function createPipeline(
  context: WebGL2RenderingContext,
  kind: MeshMaterial["kind"]
): PipelineResources {
  const vertexSource = kind === "unlit"
    ? UNLIT_VERTEX_SHADER
    : kind === "lambert"
      ? LAMBERT_VERTEX_SHADER
      : GLASS_VERTEX_SHADER
  const fragmentSource = kind === "unlit"
    ? UNLIT_FRAGMENT_SHADER
    : kind === "lambert"
      ? LAMBERT_FRAGMENT_SHADER
      : GLASS_FRAGMENT_SHADER
  const vertexShader = compileShader(context, context.VERTEX_SHADER, vertexSource)
  let fragmentShader: WebGLShader | undefined
  let program: WebGLProgram | undefined
  try {
    fragmentShader = compileShader(context, context.FRAGMENT_SHADER, fragmentSource)
    program = context.createProgram() ?? undefined
    if (!program) throw new Error("Unable to create WebGL2 program")
    context.attachShader(program, vertexShader)
    context.attachShader(program, fragmentShader)
    context.linkProgram(program)
    if (!context.getProgramParameter(program, context.LINK_STATUS)) {
      const info = context.getProgramInfoLog(program) || "unknown program error"
      throw new Error(`Unable to link WebGL2 program: ${info}`)
    }
    const colorLocation = requireUniform(context, program, "u_color")
    if (kind === "unlit") {
      return {
        kind,
        program,
        colorLocation,
        modelViewProjectionLocation: requireUniform(
          context,
          program,
          "u_model_view_projection"
        ),
      }
    }
    const litPipeline = {
      program,
      colorLocation,
      viewProjectionLocation: requireUniform(context, program, "u_view_projection"),
      modelLocation: requireUniform(context, program, "u_model"),
      normalMatrixLocation: requireUniform(context, program, "u_normal_matrix"),
      ambientLightLocation: requireUniform(context, program, "u_ambient_light"),
      directionalLightCountLocation: requireUniform(
        context,
        program,
        "u_directional_light_count"
      ),
      directionToLightsLocation: requireUniform(
        context,
        program,
        "u_direction_to_lights[0]"
      ),
      directionalLightColorsLocation: requireUniform(
        context,
        program,
        "u_directional_light_colors[0]"
      ),
    }
    if (kind === "lambert") return { kind, ...litPipeline }
    return {
      kind,
      ...litPipeline,
      cameraPositionLocation: requireUniform(context, program, "u_camera_position"),
    }
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

function uploadGeometry(
  context: WebGL2RenderingContext,
  geometry: ReturnType<Mesh["copyGeometrySnapshot"]>,
  resources: Pick<MeshResources, "vertexArray" | "positionBuffer" | "normalBuffer" | "indexBuffer">
) {
  context.bindVertexArray(resources.vertexArray)
  context.bindBuffer(context.ARRAY_BUFFER, resources.positionBuffer)
  context.bufferData(context.ARRAY_BUFFER, geometry.positions, context.STATIC_DRAW)
  context.bindBuffer(context.ARRAY_BUFFER, resources.normalBuffer)
  context.bufferData(
    context.ARRAY_BUFFER,
    geometry.normals ?? new Float32Array(),
    context.STATIC_DRAW
  )
  context.bindBuffer(context.ELEMENT_ARRAY_BUFFER, resources.indexBuffer)
  context.bufferData(context.ELEMENT_ARRAY_BUFFER, geometry.indices, context.STATIC_DRAW)
  assertNoWebGLError(context, "Mesh geometry upload")
}

function createMeshResources(
  context: WebGL2RenderingContext,
  mesh: Mesh
): MeshResources {
  const vertexArray = context.createVertexArray()
  if (!vertexArray) throw new Error("Unable to create WebGL2 vertex array")
  let positionBuffer: WebGLBuffer | undefined
  let normalBuffer: WebGLBuffer | undefined
  let indexBuffer: WebGLBuffer | undefined
  try {
    positionBuffer = requireBuffer(context, "position")
    normalBuffer = requireBuffer(context, "normal")
    indexBuffer = requireBuffer(context, "index")
    const geometry = mesh.copyGeometrySnapshot()
    uploadGeometry(context, geometry, {
      vertexArray,
      positionBuffer,
      normalBuffer,
      indexBuffer,
    })
    context.bindBuffer(context.ARRAY_BUFFER, positionBuffer)
    context.enableVertexAttribArray(0)
    context.vertexAttribPointer(0, 3, context.FLOAT, false, 0, 0)
    context.bindBuffer(context.ARRAY_BUFFER, normalBuffer)
    context.enableVertexAttribArray(1)
    context.vertexAttribPointer(1, 3, context.FLOAT, false, 0, 0)
    context.bindVertexArray(null)
    return {
      vertexArray,
      positionBuffer,
      normalBuffer,
      indexBuffer,
      geometryRevision: geometry.revision,
      indexCount: geometry.indices.length,
    }
  } catch (error) {
    context.bindVertexArray(null)
    if (indexBuffer) context.deleteBuffer(indexBuffer)
    if (normalBuffer) context.deleteBuffer(normalBuffer)
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
  uploadGeometry(context, geometry, resources)
  resources.geometryRevision = geometry.revision
  resources.indexCount = geometry.indices.length
}

function lightingSnapshot(lights: readonly WebGLLight[]): LightingSnapshot {
  const ambient = new Float32Array(3)
  const directions: number[] = []
  const colors: number[] = []
  lights.forEach((light) => {
    const color = light.getColor()
    if (light.kind === "ambient") {
      ambient[0] += color[0] * light.intensity
      ambient[1] += color[1] * light.intensity
      ambient[2] += color[2] * light.intensity
      return
    }
    if (directions.length / 3 >= webGL2DirectionalLightLimit) {
      throw new RangeError(
        `WebGL2 Lambert rendering supports at most ${webGL2DirectionalLightLimit} directional lights`
      )
    }
    directions.push(...light.getDirectionToLight())
    colors.push(
      color[0] * light.intensity,
      color[1] * light.intensity,
      color[2] * light.intensity
    )
  })
  return {
    ambient,
    directionToLights: new Float32Array(directions),
    directionalColors: new Float32Array(colors),
    directionalCount: directions.length / 3,
  }
}

function viewDepth(mesh: Mesh, viewMatrix: Matrix4) {
  const center = mesh.getWorldBoundsCenter()
  return viewMatrix[2] * center[0]
    + viewMatrix[6] * center[1]
    + viewMatrix[10] * center[2]
    + viewMatrix[14]
}

function buildRenderQueues(meshes: readonly Mesh[], camera: PerspectiveCamera) {
  const opaque: DrawItem[] = []
  const transparent: TransparentDrawItem[] = []
  let viewMatrix: Matrix4 | undefined
  meshes.forEach((mesh, inputOrder) => {
    const material = mesh.getMaterial()
    if (!meshMaterialIsTransparent(material)) {
      opaque.push({ mesh, material })
      return
    }
    viewMatrix ??= camera.getViewMatrix()
    transparent.push({
      mesh,
      material,
      inputOrder,
      viewDepth: viewDepth(mesh, viewMatrix),
    })
  })
  transparent.sort((first, second) =>
    first.viewDepth - second.viewDepth || first.inputOrder - second.inputOrder)
  return { opaque, transparent }
}

/**
 * @internal Owns one WebGL2 context's derived GPU cache. Mesh, Material, Light,
 * and Camera CPU state stay authoritative; restoration recreates handles lazily.
 */
export class WebGL2SceneRuntime {
  #context: WebGL2RenderingContext
  readonly #pipelines = new Map<MeshMaterial["kind"], PipelineResources>()
  readonly #meshes = new Map<Mesh, MeshResources>()
  #disposed = false

  constructor(context: WebGL2RenderingContext) {
    assertWebGL2Context(context)
    assertContextAvailable(context)
    this.#context = context
  }

  render(
    meshes: readonly Mesh[],
    camera: PerspectiveCamera,
    lights: readonly WebGLLight[] = []
  ) {
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

    const viewProjection = camera.getViewProjection(width / height)
    const queues = buildRenderQueues(meshes, camera)
    let lighting: LightingSnapshot | undefined
    let activePipeline: PipelineResources | undefined
    const draw = ({ mesh, material }: DrawItem) => {
      const pipeline = this.#pipeline(material.kind)
      if (pipeline !== activePipeline) {
        context.useProgram(pipeline.program)
        activePipeline = pipeline
        if (pipeline.kind !== "unlit") {
          lighting ??= lightingSnapshot(lights)
          this.#applyLitFrameUniforms(pipeline, viewProjection, lighting)
          if (pipeline.kind === "glass") {
            context.uniform3fv(
              pipeline.cameraPositionLocation,
              new Float32Array(camera.getPosition())
            )
          }
        }
      }
      const resources = this.#meshResources(mesh)
      uploadChangedGeometry(context, mesh, resources)
      context.bindVertexArray(resources.vertexArray)
      if (pipeline.kind === "unlit") {
        context.uniformMatrix4fv(
          pipeline.modelViewProjectionLocation,
          false,
          multiplyMatrix4(viewProjection, mesh.getModelMatrix())
        )
      } else {
        const model = mesh.getModelMatrix()
        context.uniformMatrix4fv(pipeline.modelLocation, false, model)
        context.uniformMatrix3fv(
          pipeline.normalMatrixLocation,
          false,
          normalMatrix3FromMatrix4(model)
        )
      }
      context.uniform4fv(pipeline.colorLocation, new Float32Array(material.color))
      context.drawElements(
        context.TRIANGLES,
        resources.indexCount,
        context.UNSIGNED_SHORT,
        0
      )
    }
    try {
      queues.opaque.forEach(draw)
      if (queues.transparent.length > 0) {
        this.#configureTransparentPass()
        queues.transparent.forEach(draw)
      }
      assertNoWebGLError(context, "frame draw")
      assertContextAvailable(context)
    } finally {
      context.depthMask(true)
      context.disable(context.BLEND)
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

  #configureTransparentPass() {
    const context = this.#context
    context.enable(context.BLEND)
    context.blendEquation(context.FUNC_ADD)
    context.blendFunc(context.ONE, context.ONE_MINUS_SRC_ALPHA)
    context.depthMask(false)
  }

  #pipeline(kind: MeshMaterial["kind"]) {
    const existing = this.#pipelines.get(kind)
    if (existing) return existing
    const created = createPipeline(this.#context, kind)
    this.#pipelines.set(kind, created)
    return created
  }

  #applyLitFrameUniforms(
    pipeline: LitPipelineResources,
    viewProjection: Matrix4,
    lighting: LightingSnapshot
  ) {
    const context = this.#context
    context.uniformMatrix4fv(pipeline.viewProjectionLocation, false, viewProjection)
    context.uniform3fv(pipeline.ambientLightLocation, lighting.ambient)
    context.uniform1i(pipeline.directionalLightCountLocation, lighting.directionalCount)
    context.uniform3fv(pipeline.directionToLightsLocation, lighting.directionToLights)
    context.uniform3fv(
      pipeline.directionalLightColorsLocation,
      lighting.directionalColors
    )
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
    this.#context.deleteBuffer(resources.normalBuffer)
    this.#context.deleteBuffer(resources.positionBuffer)
    this.#context.deleteVertexArray(resources.vertexArray)
  }

  #deleteResources() {
    this.#meshes.forEach((resources) => this.#deleteMeshResources(resources))
    this.#meshes.clear()
    this.#pipelines.forEach((pipeline) => this.#context.deleteProgram(pipeline.program))
    this.#pipelines.clear()
  }

  #forgetResources() {
    this.#meshes.clear()
    this.#pipelines.clear()
  }
}

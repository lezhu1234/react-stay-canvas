export interface ShadowPipelineResources {
  readonly program: WebGLProgram
  readonly modelLightViewProjectionLocation: WebGLUniformLocation
}

export interface ShadowMapResources {
  readonly framebuffer: WebGLFramebuffer
  readonly depthTexture: WebGLTexture
  readonly mapSize: number
}

const SHADOW_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 a_position;
uniform mat4 u_model_light_view_projection;

void main() {
  gl_Position = u_model_light_view_projection * vec4(a_position, 1.0);
}
`

const SHADOW_FRAGMENT_SHADER = `#version 300 es
precision highp float;

void main() {}
`

function compileShader(
  context: WebGL2RenderingContext,
  type: number,
  source: string
) {
  const shader = context.createShader(type)
  if (!shader) throw new Error("Unable to create WebGL2 shadow shader")
  context.shaderSource(shader, source)
  context.compileShader(shader)
  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    const info = context.getShaderInfoLog(shader) || "unknown shader error"
    context.deleteShader(shader)
    throw new Error(`Unable to compile WebGL2 shadow shader: ${info}`)
  }
  return shader
}

function requireUniform(
  context: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string
) {
  const location = context.getUniformLocation(program, name)
  if (location === null) {
    throw new Error(`Unable to resolve WebGL2 shadow shader input ${name}`)
  }
  return location
}

function assertShadowMapReady(context: WebGL2RenderingContext) {
  const error = context.getError()
  if (error === context.NO_ERROR) return
  if (error === context.CONTEXT_LOST_WEBGL || context.isContextLost()) {
    throw new Error("WebGL2 scene rendering cannot run while the context is lost")
  }
  throw new Error(`WebGL2 scene rendering failed during shadow map creation: ${error}`)
}

export function createShadowPipeline(
  context: WebGL2RenderingContext
): ShadowPipelineResources {
  const vertexShader = compileShader(context, context.VERTEX_SHADER, SHADOW_VERTEX_SHADER)
  let fragmentShader: WebGLShader | undefined
  let program: WebGLProgram | undefined
  try {
    fragmentShader = compileShader(context, context.FRAGMENT_SHADER, SHADOW_FRAGMENT_SHADER)
    program = context.createProgram() ?? undefined
    if (!program) throw new Error("Unable to create WebGL2 shadow program")
    context.attachShader(program, vertexShader)
    context.attachShader(program, fragmentShader)
    context.linkProgram(program)
    if (!context.getProgramParameter(program, context.LINK_STATUS)) {
      const info = context.getProgramInfoLog(program) || "unknown program error"
      throw new Error(`Unable to link WebGL2 shadow program: ${info}`)
    }
    return {
      program,
      modelLightViewProjectionLocation: requireUniform(
        context,
        program,
        "u_model_light_view_projection"
      ),
    }
  } catch (error) {
    if (program) context.deleteProgram(program)
    throw error
  } finally {
    context.deleteShader(vertexShader)
    if (fragmentShader) context.deleteShader(fragmentShader)
  }
}

export function createShadowMapResources(
  context: WebGL2RenderingContext,
  mapSize: number
): ShadowMapResources {
  const maximum = context.getParameter(context.MAX_TEXTURE_SIZE) as number
  if (!Number.isFinite(maximum) || mapSize > maximum) {
    throw new RangeError(
      `DirectionalLight shadow mapSize ${mapSize} exceeds WebGL2 MAX_TEXTURE_SIZE ${maximum}`
    )
  }
  const depthTexture = context.createTexture()
  if (!depthTexture) throw new Error("Unable to create WebGL2 shadow depth texture")
  let framebuffer: WebGLFramebuffer | undefined
  try {
    context.bindTexture(context.TEXTURE_2D, depthTexture)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.NEAREST)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.NEAREST)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE)
    context.texImage2D(
      context.TEXTURE_2D,
      0,
      context.DEPTH_COMPONENT24,
      mapSize,
      mapSize,
      0,
      context.DEPTH_COMPONENT,
      context.UNSIGNED_INT,
      null
    )
    framebuffer = context.createFramebuffer() ?? undefined
    if (!framebuffer) throw new Error("Unable to create WebGL2 shadow framebuffer")
    context.bindFramebuffer(context.FRAMEBUFFER, framebuffer)
    context.framebufferTexture2D(
      context.FRAMEBUFFER,
      context.DEPTH_ATTACHMENT,
      context.TEXTURE_2D,
      depthTexture,
      0
    )
    context.drawBuffers([context.NONE])
    context.readBuffer(context.NONE)
    if (context.checkFramebufferStatus(context.FRAMEBUFFER) !== context.FRAMEBUFFER_COMPLETE) {
      throw new Error("Unable to create complete WebGL2 shadow framebuffer")
    }
    assertShadowMapReady(context)
    return { framebuffer, depthTexture, mapSize }
  } catch (error) {
    if (framebuffer) context.deleteFramebuffer(framebuffer)
    context.deleteTexture(depthTexture)
    throw error
  } finally {
    context.bindTexture(context.TEXTURE_2D, null)
    context.bindFramebuffer(context.FRAMEBUFFER, null)
  }
}

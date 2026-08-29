import { SRGB_TRANSFER_GLSL } from "./colorSpace"

export interface OutputPipelineResources {
  readonly program: WebGLProgram
  readonly vertexArray: WebGLVertexArrayObject
  readonly sceneColorLocation: WebGLUniformLocation
  readonly hasAlphaLocation: WebGLUniformLocation
  readonly premultipliedAlphaLocation: WebGLUniformLocation
}

const OUTPUT_VERTEX_SHADER = `#version 300 es
out vec2 texture_uv;

void main() {
  vec2 position = vec2(
    float((gl_VertexID << 1) & 2),
    float(gl_VertexID & 2)
  );
  texture_uv = position;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
`

const OUTPUT_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_scene_color;
uniform bool u_has_alpha;
uniform bool u_premultiplied_alpha;
in vec2 texture_uv;
out vec4 output_color;
${SRGB_TRANSFER_GLSL}

void main() {
  vec4 scene_color = texture(u_scene_color, texture_uv);
  float alpha = u_has_alpha ? scene_color.a : 1.0;
  vec3 straight_linear = scene_color.a > 0.00001
    ? scene_color.rgb / scene_color.a
    : vec3(0.0);
  vec3 linear_output = u_has_alpha ? straight_linear : scene_color.rgb;
  vec3 encoded = clamp(linear_to_srgb(linear_output), 0.0, 1.0);
  output_color = vec4(
    u_premultiplied_alpha ? encoded * alpha : encoded,
    alpha
  );
}
`

function compileShader(
  context: WebGL2RenderingContext,
  type: number,
  source: string,
) {
  const shader = context.createShader(type)
  if (!shader) throw new Error("Unable to create WebGL2 output shader")
  context.shaderSource(shader, source)
  context.compileShader(shader)
  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    const info = context.getShaderInfoLog(shader) || "unknown shader error"
    context.deleteShader(shader)
    throw new Error(`Unable to compile WebGL2 output shader: ${info}`)
  }
  return shader
}

function requireUniform(
  context: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
) {
  const location = context.getUniformLocation(program, name)
  if (location === null) throw new Error(`Unable to resolve WebGL2 output shader input ${name}`)
  return location
}

export function createOutputPipeline(
  context: WebGL2RenderingContext,
): OutputPipelineResources {
  const vertexShader = compileShader(context, context.VERTEX_SHADER, OUTPUT_VERTEX_SHADER)
  let fragmentShader: WebGLShader | undefined
  let program: WebGLProgram | undefined
  let vertexArray: WebGLVertexArrayObject | undefined
  try {
    fragmentShader = compileShader(context, context.FRAGMENT_SHADER, OUTPUT_FRAGMENT_SHADER)
    program = context.createProgram() ?? undefined
    if (!program) throw new Error("Unable to create WebGL2 output program")
    context.attachShader(program, vertexShader)
    context.attachShader(program, fragmentShader)
    context.linkProgram(program)
    if (!context.getProgramParameter(program, context.LINK_STATUS)) {
      const info = context.getProgramInfoLog(program) || "unknown program error"
      throw new Error(`Unable to link WebGL2 output program: ${info}`)
    }
    vertexArray = context.createVertexArray() ?? undefined
    if (!vertexArray) throw new Error("Unable to create WebGL2 output vertex array")
    return {
      program,
      vertexArray,
      sceneColorLocation: requireUniform(context, program, "u_scene_color"),
      hasAlphaLocation: requireUniform(context, program, "u_has_alpha"),
      premultipliedAlphaLocation: requireUniform(
        context,
        program,
        "u_premultiplied_alpha",
      ),
    }
  } catch (error) {
    if (vertexArray) context.deleteVertexArray(vertexArray)
    if (program) context.deleteProgram(program)
    throw error
  } finally {
    context.deleteShader(vertexShader)
    if (fragmentShader) context.deleteShader(fragmentShader)
  }
}

export function presentScene(
  context: WebGL2RenderingContext,
  resources: OutputPipelineResources,
  sceneColor: WebGLTexture,
  width: number,
  height: number,
) {
  const attributes = context.getContextAttributes()
  const hasAlpha = attributes?.alpha ?? true
  const premultipliedAlpha = hasAlpha && (attributes?.premultipliedAlpha ?? true)
  context.bindFramebuffer(context.FRAMEBUFFER, null)
  context.viewport(0, 0, width, height)
  context.disable(context.CULL_FACE)
  context.disable(context.BLEND)
  context.disable(context.DEPTH_TEST)
  context.disable(context.SCISSOR_TEST)
  context.disable(context.STENCIL_TEST)
  context.colorMask(true, true, true, true)
  context.useProgram(resources.program)
  context.bindVertexArray(resources.vertexArray)
  context.uniform1i(resources.sceneColorLocation, 0)
  context.uniform1i(resources.hasAlphaLocation, hasAlpha ? 1 : 0)
  context.uniform1i(
    resources.premultipliedAlphaLocation,
    premultipliedAlpha ? 1 : 0,
  )
  context.activeTexture(context.TEXTURE0)
  context.bindTexture(context.TEXTURE_2D, sceneColor)
  context.drawArrays(context.TRIANGLES, 0, 3)
}

export function deleteOutputPipeline(
  context: WebGL2RenderingContext,
  resources: OutputPipelineResources,
) {
  context.deleteVertexArray(resources.vertexArray)
  context.deleteProgram(resources.program)
}

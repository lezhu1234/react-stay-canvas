import {
  DirectionalLight,
  directionalLightShadowViewProjection,
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
import { EnvironmentMap } from "./environmentMap"
import {
  createEnvironmentTextureResources,
  uploadEnvironmentTexture,
  type EnvironmentTextureResources,
} from "./environmentResources"
import {
  createSceneColorResources,
  type SceneColorResources,
} from "./sceneColorResources"
import {
  createShadowMapResources,
  createShadowPipeline,
  createTransmissiveShadowMapResources,
  createTransmissiveShadowPipeline,
  type ShadowMapResources,
  type ShadowPipelineResources,
  type TransmissiveShadowMapResources,
  type TransmissiveShadowPipelineResources,
} from "./shadowResources"
import {
  VOLUME_ATTENUATION_GLSL,
  volumeAttenuationUniforms,
} from "./volumeAttenuation"

interface UnlitPipelineResources {
  readonly kind: "unlit"
  readonly program: WebGLProgram
  readonly modelViewProjectionLocation: WebGLUniformLocation
  readonly colorLocation: WebGLUniformLocation
}

interface LitPipelineBaseResources {
  readonly program: WebGLProgram
  readonly viewProjectionLocation: WebGLUniformLocation
  readonly modelLocation: WebGLUniformLocation
  readonly normalMatrixLocation: WebGLUniformLocation
  readonly colorLocation: WebGLUniformLocation
  readonly ambientLightLocation: WebGLUniformLocation
  readonly directionalLightCountLocation: WebGLUniformLocation
  readonly directionToLightsLocation: WebGLUniformLocation
  readonly directionalLightColorsLocation: WebGLUniformLocation
  readonly shadowLightIndexLocation: WebGLUniformLocation
  readonly shadowViewProjectionLocation: WebGLUniformLocation
  readonly shadowMapLocation: WebGLUniformLocation
  readonly hasOpaqueShadowMapLocation: WebGLUniformLocation
  readonly transmissiveShadowDepthMapLocation: WebGLUniformLocation
  readonly transmissiveShadowColorMapLocation: WebGLUniformLocation
  readonly hasTransmissiveShadowMapLocation: WebGLUniformLocation
  readonly shadowFilterStepLocation: WebGLUniformLocation
  readonly shadowBiasLocation: WebGLUniformLocation
  readonly receiveShadowLocation: WebGLUniformLocation
}

interface EnvironmentPipelineResources {
  readonly cameraPositionLocation: WebGLUniformLocation
  readonly environmentMapLocation: WebGLUniformLocation
  readonly environmentIntensityLocation: WebGLUniformLocation
  readonly environmentMaxLodLocation: WebGLUniformLocation
  readonly hasEnvironmentLocation: WebGLUniformLocation
}

interface LambertPipelineResources extends LitPipelineBaseResources {
  readonly kind: "lambert"
}

interface StandardPipelineResources
  extends LitPipelineBaseResources, EnvironmentPipelineResources {
  readonly kind: "standard"
  readonly metallicLocation: WebGLUniformLocation
  readonly roughnessLocation: WebGLUniformLocation
}

interface GlassPipelineResources
  extends LitPipelineBaseResources, EnvironmentPipelineResources {
  readonly kind: "glass"
  readonly viewLocation: WebGLUniformLocation
  readonly projectionLocation: WebGLUniformLocation
  readonly sceneColorLocation: WebGLUniformLocation
  readonly sceneColorMaxLodLocation: WebGLUniformLocation
  readonly attenuationColorLocation: WebGLUniformLocation
  readonly hasVolumeAttenuationLocation: WebGLUniformLocation
  readonly logAttenuationExponentLocation: WebGLUniformLocation
  readonly iorLocation: WebGLUniformLocation
  readonly roughnessLocation: WebGLUniformLocation
  readonly thicknessLocation: WebGLUniformLocation
}

type LitPipelineResources =
  | LambertPipelineResources
  | StandardPipelineResources
  | GlassPipelineResources
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

interface ShadowFrame {
  readonly lightIndex: number
  readonly lightViewProjection: Matrix4
  readonly bias: number
  readonly mapSize: number
  readonly filterRadius: number
  readonly opaque?: ShadowMapResources
  readonly transmissive?: TransmissiveShadowMapResources
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
out vec3 world_position;

void main() {
  vec4 world = u_model * vec4(a_position, 1.0);
  gl_Position = u_view_projection * world;
  world_normal = normalize(u_normal_matrix * a_normal);
  world_position = world.xyz;
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

const SHADOW_FRAGMENT_INPUTS = `
precision highp sampler2DShadow;
uniform int u_shadow_light_index;
uniform mat4 u_shadow_view_projection;
uniform sampler2DShadow u_shadow_map;
uniform bool u_has_opaque_shadow_map;
uniform sampler2DShadow u_transmissive_shadow_depth_map;
uniform sampler2D u_transmissive_shadow_color_map;
uniform bool u_has_transmissive_shadow_map;
uniform vec2 u_shadow_filter_step;
uniform float u_shadow_bias;
uniform bool u_receive_shadow;
in vec3 world_position;

vec3 shadow_transmittance() {
  if (!u_receive_shadow || u_shadow_light_index < 0) return vec3(1.0);
  vec4 light_clip = u_shadow_view_projection * vec4(world_position, 1.0);
  vec3 shadow_coordinate = light_clip.xyz / light_clip.w * 0.5 + 0.5;
  if (shadow_coordinate.x < 0.0 || shadow_coordinate.x > 1.0
      || shadow_coordinate.y < 0.0 || shadow_coordinate.y > 1.0
      || shadow_coordinate.z < 0.0 || shadow_coordinate.z > 1.0) return vec3(1.0);
  float receiver_depth = shadow_coordinate.z - u_shadow_bias;
  vec3 transmitted = vec3(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 sample_uv = shadow_coordinate.xy
        + vec2(float(x), float(y)) * u_shadow_filter_step;
      float opaque_visibility = u_has_opaque_shadow_map
        ? texture(u_shadow_map, vec3(sample_uv, receiver_depth))
        : 1.0;
      float glass_visibility = u_has_transmissive_shadow_map
        ? texture(u_transmissive_shadow_depth_map, vec3(sample_uv, receiver_depth))
        : 1.0;
      vec3 glass_transmittance = u_has_transmissive_shadow_map
        ? texture(u_transmissive_shadow_color_map, sample_uv).rgb
        : vec3(1.0);
      transmitted += opaque_visibility * mix(
        glass_transmittance,
        vec3(1.0),
        glass_visibility
      );
    }
  }
  return transmitted / 9.0;
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
${SHADOW_FRAGMENT_INPUTS}

void main() {
  vec3 normal = normalize(world_normal);
  if (!gl_FrontFacing) normal = -normal;
  vec3 illumination = u_ambient_light;
  for (int index = 0; index < MAX_DIRECTIONAL_LIGHTS; index++) {
    if (index >= u_directional_light_count) break;
    float diffuse = max(dot(normal, u_direction_to_lights[index]), 0.0);
    vec3 transmittance = index == u_shadow_light_index
      ? shadow_transmittance()
      : vec3(1.0);
    illumination += u_directional_light_colors[index] * diffuse * transmittance;
  }
  output_color = vec4(u_color.rgb * illumination, 1.0);
}
`

const ENVIRONMENT_FRAGMENT_INPUTS = `
uniform vec3 u_camera_position;
uniform sampler2D u_environment_map;
uniform float u_environment_intensity;
uniform float u_environment_max_lod;
uniform bool u_has_environment;

vec3 environment_radiance(vec3 direction, float roughness) {
  vec2 environment_uv = vec2(
    atan(direction.z, direction.x) / 6.28318530718 + 0.5,
    0.5 - asin(clamp(direction.y, -1.0, 1.0)) / 3.14159265359
  );
  return textureLod(
    u_environment_map,
    environment_uv,
    roughness * u_environment_max_lod
  ).rgb * u_environment_intensity;
}
`

const STANDARD_FRAGMENT_SHADER = `#version 300 es
precision highp float;
#define MAX_DIRECTIONAL_LIGHTS ${webGL2DirectionalLightLimit}
const float PI = 3.14159265359;
uniform vec4 u_color;
uniform float u_metallic;
uniform float u_roughness;
uniform vec3 u_ambient_light;
uniform int u_directional_light_count;
uniform vec3 u_direction_to_lights[MAX_DIRECTIONAL_LIGHTS];
uniform vec3 u_directional_light_colors[MAX_DIRECTIONAL_LIGHTS];
in vec3 world_normal;
out vec4 output_color;
${SHADOW_FRAGMENT_INPUTS}
${ENVIRONMENT_FRAGMENT_INPUTS}

vec3 fresnel_schlick(float cosine, vec3 reflectance) {
  return reflectance + (1.0 - reflectance) * pow(1.0 - cosine, 5.0);
}

float distribution_ggx(vec3 normal, vec3 half_direction, float roughness) {
  float alpha = max(roughness * roughness, 0.002025);
  float alpha_squared = alpha * alpha;
  float normal_half = max(dot(normal, half_direction), 0.0);
  float denominator = normal_half * normal_half * (alpha_squared - 1.0) + 1.0;
  return alpha_squared / max(PI * denominator * denominator, 0.000001);
}

float geometry_schlick_ggx(float normal_direction, float roughness) {
  float remapped = roughness + 1.0;
  float k = remapped * remapped / 8.0;
  return normal_direction / max(normal_direction * (1.0 - k) + k, 0.000001);
}

void main() {
  vec3 normal = normalize(world_normal);
  if (!gl_FrontFacing) normal = -normal;
  vec3 view_direction = normalize(u_camera_position - world_position);
  float normal_view = max(dot(normal, view_direction), 0.0);
  vec3 base_color = u_color.rgb;
  vec3 reflectance = mix(vec3(0.04), base_color, u_metallic);
  vec3 result = u_ambient_light * base_color * (1.0 - u_metallic);
  for (int index = 0; index < MAX_DIRECTIONAL_LIGHTS; index++) {
    if (index >= u_directional_light_count) break;
    vec3 light_direction = u_direction_to_lights[index];
    float normal_light = max(dot(normal, light_direction), 0.0);
    if (normal_light <= 0.0) continue;
    vec3 half_direction = normalize(view_direction + light_direction);
    vec3 fresnel = fresnel_schlick(
      max(dot(half_direction, view_direction), 0.0),
      reflectance
    );
    float distribution = distribution_ggx(normal, half_direction, u_roughness);
    float geometry = geometry_schlick_ggx(normal_view, u_roughness)
      * geometry_schlick_ggx(normal_light, u_roughness);
    vec3 specular = distribution * geometry * fresnel
      / max(4.0 * normal_view * normal_light, 0.000001);
    // Keep diffuse intensity compatible with LambertMaterial's normalized light scale.
    vec3 diffuse = (1.0 - fresnel) * (1.0 - u_metallic) * base_color;
    vec3 transmittance = index == u_shadow_light_index
      ? shadow_transmittance()
      : vec3(1.0);
    result += (diffuse + specular)
      * u_directional_light_colors[index]
      * normal_light
      * transmittance;
  }
  if (u_has_environment) {
    vec3 reflected_direction = normalize(reflect(-view_direction, normal));
    vec3 fresnel = fresnel_schlick(normal_view, reflectance);
    result += environment_radiance(
      reflected_direction,
      u_roughness
    ) * fresnel;
  }
  output_color = vec4(result, 1.0);
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
uniform mat4 u_view;
uniform mat4 u_projection;
uniform sampler2D u_scene_color;
uniform float u_scene_color_max_lod;
uniform vec3 u_attenuation_color;
uniform bool u_has_volume_attenuation;
uniform float u_log_attenuation_exponent;
uniform float u_ior;
uniform float u_roughness;
uniform float u_thickness;
in vec3 world_normal;
out vec4 output_color;
${SHADOW_FRAGMENT_INPUTS}
${ENVIRONMENT_FRAGMENT_INPUTS}
${VOLUME_ATTENUATION_GLSL}

void main() {
  vec3 normal = normalize(world_normal);
  if (!gl_FrontFacing) normal = -normal;
  vec3 illumination = u_ambient_light;
  for (int index = 0; index < MAX_DIRECTIONAL_LIGHTS; index++) {
    if (index >= u_directional_light_count) break;
    float diffuse = max(dot(normal, u_direction_to_lights[index]), 0.0);
    vec3 transmittance = index == u_shadow_light_index
      ? shadow_transmittance()
      : vec3(1.0);
    illumination += u_directional_light_colors[index] * diffuse * transmittance;
  }
  vec3 view_direction = normalize(u_camera_position - world_position);
  float cosine = abs(dot(normal, view_direction));
  float f0 = pow((u_ior - 1.0) / (u_ior + 1.0), 2.0);
  float fresnel = f0 + (1.0 - f0) * pow(1.0 - cosine, 5.0);
  vec3 view_position = (u_view * vec4(world_position, 1.0)).xyz;
  vec3 view_normal = normalize(mat3(u_view) * normal);
  vec3 incident = normalize(view_position);
  vec3 refracted_direction = refract(incident, view_normal, 1.0 / u_ior);
  vec3 refracted_position = view_position + refracted_direction * u_thickness;
  vec4 refracted_clip = u_projection * vec4(refracted_position, 1.0);
  vec2 refracted_uv = refracted_clip.xy / refracted_clip.w * 0.5 + 0.5;
  vec2 half_texel = 0.5 / vec2(textureSize(u_scene_color, 0));
  refracted_uv = clamp(refracted_uv, half_texel, vec2(1.0) - half_texel);
  vec4 scene_color = textureLod(
    u_scene_color,
    refracted_uv,
    u_roughness * u_scene_color_max_lod
  );
  vec3 lit_tint = u_color.rgb * illumination;
  float transmission = scene_color.a * (1.0 - u_color.a) * (1.0 - fresnel);
  vec3 volume_transmittance = volume_attenuation(
    u_attenuation_color,
    u_has_volume_attenuation,
    u_log_attenuation_exponent
  );
  vec3 refracted_color = scene_color.a > 0.00001
    ? scene_color.rgb / scene_color.a * u_color.rgb * volume_transmittance
    : vec3(0.0);
  vec3 surface_color = mix(lit_tint, refracted_color, transmission);
  vec3 reflection_color = vec3(1.0);
  if (u_has_environment) {
    vec3 reflected_direction = normalize(reflect(-view_direction, normal));
    reflection_color = environment_radiance(reflected_direction, u_roughness);
  }
  if (u_has_environment) {
    float alpha = u_color.a + (1.0 - u_color.a) * fresnel;
    vec3 premultiplied_color = surface_color * (alpha - fresnel)
      + reflection_color * fresnel;
    output_color = vec4(premultiplied_color, alpha);
  } else {
    surface_color = mix(surface_color, vec3(1.0), fresnel * 0.42);
    float alpha = u_color.a + (1.0 - u_color.a) * fresnel * 0.34;
    output_color = vec4(surface_color * alpha, alpha);
  }
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

function pipelineShaderSources(kind: MeshMaterial["kind"]) {
  if (kind === "unlit") {
    return { vertex: UNLIT_VERTEX_SHADER, fragment: UNLIT_FRAGMENT_SHADER }
  }
  if (kind === "lambert") {
    return { vertex: LAMBERT_VERTEX_SHADER, fragment: LAMBERT_FRAGMENT_SHADER }
  }
  if (kind === "standard") {
    return { vertex: LAMBERT_VERTEX_SHADER, fragment: STANDARD_FRAGMENT_SHADER }
  }
  return { vertex: GLASS_VERTEX_SHADER, fragment: GLASS_FRAGMENT_SHADER }
}

function environmentPipelineLocations(
  context: WebGL2RenderingContext,
  program: WebGLProgram,
): EnvironmentPipelineResources {
  return {
    cameraPositionLocation: requireUniform(context, program, "u_camera_position"),
    environmentMapLocation: requireUniform(context, program, "u_environment_map"),
    environmentIntensityLocation: requireUniform(
      context,
      program,
      "u_environment_intensity",
    ),
    environmentMaxLodLocation: requireUniform(
      context,
      program,
      "u_environment_max_lod",
    ),
    hasEnvironmentLocation: requireUniform(context, program, "u_has_environment"),
  }
}

function createPipeline(
  context: WebGL2RenderingContext,
  kind: MeshMaterial["kind"]
): PipelineResources {
  const sources = pipelineShaderSources(kind)
  const vertexShader = compileShader(context, context.VERTEX_SHADER, sources.vertex)
  let fragmentShader: WebGLShader | undefined
  let program: WebGLProgram | undefined
  try {
    fragmentShader = compileShader(context, context.FRAGMENT_SHADER, sources.fragment)
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
      shadowLightIndexLocation: requireUniform(context, program, "u_shadow_light_index"),
      shadowViewProjectionLocation: requireUniform(
        context,
        program,
        "u_shadow_view_projection"
      ),
      shadowMapLocation: requireUniform(context, program, "u_shadow_map"),
      hasOpaqueShadowMapLocation: requireUniform(
        context,
        program,
        "u_has_opaque_shadow_map",
      ),
      transmissiveShadowDepthMapLocation: requireUniform(
        context,
        program,
        "u_transmissive_shadow_depth_map",
      ),
      transmissiveShadowColorMapLocation: requireUniform(
        context,
        program,
        "u_transmissive_shadow_color_map",
      ),
      hasTransmissiveShadowMapLocation: requireUniform(
        context,
        program,
        "u_has_transmissive_shadow_map",
      ),
      shadowFilterStepLocation: requireUniform(
        context,
        program,
        "u_shadow_filter_step",
      ),
      shadowBiasLocation: requireUniform(context, program, "u_shadow_bias"),
      receiveShadowLocation: requireUniform(context, program, "u_receive_shadow"),
    }
    if (kind === "lambert") return { kind, ...litPipeline }
    const environmentPipeline = environmentPipelineLocations(context, program)
    if (kind === "standard") {
      return {
        kind,
        ...litPipeline,
        ...environmentPipeline,
        metallicLocation: requireUniform(context, program, "u_metallic"),
        roughnessLocation: requireUniform(context, program, "u_roughness"),
      }
    }
    return {
      kind,
      ...litPipeline,
      ...environmentPipeline,
      viewLocation: requireUniform(context, program, "u_view"),
      projectionLocation: requireUniform(context, program, "u_projection"),
      sceneColorLocation: requireUniform(context, program, "u_scene_color"),
      sceneColorMaxLodLocation: requireUniform(context, program, "u_scene_color_max_lod"),
      attenuationColorLocation: requireUniform(context, program, "u_attenuation_color"),
      hasVolumeAttenuationLocation: requireUniform(
        context,
        program,
        "u_has_volume_attenuation"
      ),
      logAttenuationExponentLocation: requireUniform(
        context,
        program,
        "u_log_attenuation_exponent"
      ),
      iorLocation: requireUniform(context, program, "u_ior"),
      roughnessLocation: requireUniform(context, program, "u_roughness"),
      thicknessLocation: requireUniform(context, program, "u_thickness"),
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
        `WebGL2 lit rendering supports at most ${webGL2DirectionalLightLimit} directional lights`
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

function findShadowLight(lights: readonly WebGLLight[]) {
  let directionalIndex = 0
  let found: { light: DirectionalLight; lightIndex: number } | undefined
  lights.forEach((light) => {
    if (light.kind !== "directional") return
    if (light.getShadow()) {
      if (found) {
        throw new RangeError(
          "WebGL2 rendering supports at most one shadow-casting directional light"
        )
      }
      found = { light, lightIndex: directionalIndex }
    }
    directionalIndex += 1
  })
  return found
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

function renderQueuesUseEnvironment(queues: ReturnType<typeof buildRenderQueues>) {
  const usesEnvironment = ({ material }: DrawItem) =>
    material.kind === "standard" || material.kind === "glass"
  return queues.opaque.some(usesEnvironment) || queues.transparent.some(usesEnvironment)
}

/**
 * @internal Owns one WebGL2 context's derived GPU cache. Mesh, Material, Light,
 * and Camera CPU state stay authoritative; restoration recreates handles lazily.
 */
export class WebGL2SceneRuntime {
  #context: WebGL2RenderingContext
  readonly #pipelines = new Map<MeshMaterial["kind"], PipelineResources>()
  readonly #meshes = new Map<Mesh, MeshResources>()
  #shadowPipeline?: ShadowPipelineResources
  #shadowMap?: ShadowMapResources
  #transmissiveShadowPipeline?: TransmissiveShadowPipelineResources
  #transmissiveShadowMap?: TransmissiveShadowMapResources
  #sceneColor?: SceneColorResources
  #environmentTexture?: EnvironmentTextureResources
  #disposed = false

  constructor(context: WebGL2RenderingContext) {
    assertWebGL2Context(context)
    assertContextAvailable(context)
    this.#context = context
  }

  render(
    meshes: readonly Mesh[],
    camera: PerspectiveCamera,
    lights: readonly WebGLLight[] = [],
    environment?: EnvironmentMap,
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
    const shadowLight = findShadowLight(lights)
    if (meshes.length === 0) {
      this.#configureFrame(width, height)
      assertNoWebGLError(context, "empty frame")
      return
    }

    const shadow = this.#renderShadowPass(meshes, shadowLight)
    const queues = buildRenderQueues(meshes, camera)
    const sceneColor = queues.transparent.length > 0
      ? this.#sceneColorResources(width, height)
      : undefined
    const environmentTexture = environment && renderQueuesUseEnvironment(queues)
      ? this.#environmentTextureResources(environment)
      : undefined
    this.#configureFrame(width, height)
    const aspect = width / height
    const view = camera.getViewMatrix()
    const projection = camera.getProjectionMatrix(aspect)
    const viewProjection = multiplyMatrix4(projection, view)
    let lighting: LightingSnapshot | undefined
    let activePipeline: PipelineResources | undefined
    const draw = ({ mesh, material }: DrawItem) => {
      const pipeline = this.#pipeline(material.kind)
      if (pipeline !== activePipeline) {
        context.useProgram(pipeline.program)
        activePipeline = pipeline
        if (pipeline.kind !== "unlit") {
          lighting ??= lightingSnapshot(lights)
          this.#applyLitFrameUniforms(pipeline, viewProjection, lighting, shadow)
          if (pipeline.kind === "standard" || pipeline.kind === "glass") {
            this.#applyEnvironmentFrameUniforms(
              pipeline,
              camera,
              environment,
              environmentTexture,
            )
          }
          if (pipeline.kind === "glass") {
            context.uniformMatrix4fv(pipeline.viewLocation, false, view)
            context.uniformMatrix4fv(pipeline.projectionLocation, false, projection)
            context.uniform1i(pipeline.sceneColorLocation, 1)
            context.activeTexture(context.TEXTURE1)
            context.bindTexture(context.TEXTURE_2D, sceneColor?.texture ?? null)
            context.uniform1f(
              pipeline.sceneColorMaxLodLocation,
              sceneColor?.maxMipLevel ?? 0,
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
        context.uniform1i(
          pipeline.receiveShadowLocation,
          shadow && mesh.receiveShadow ? 1 : 0
        )
      }
      context.uniform4fv(pipeline.colorLocation, new Float32Array(material.color))
      if (pipeline.kind === "standard" && material.kind === "standard") {
        context.uniform1f(pipeline.metallicLocation, material.metallic)
        context.uniform1f(pipeline.roughnessLocation, material.roughness)
      }
      if (pipeline.kind === "glass" && material.kind === "glass") {
        context.uniform3fv(
          pipeline.attenuationColorLocation,
          new Float32Array(material.attenuationColor),
        )
        const attenuation = volumeAttenuationUniforms(material)
        context.uniform1i(
          pipeline.hasVolumeAttenuationLocation,
          attenuation.enabled ? 1 : 0,
        )
        context.uniform1f(
          pipeline.logAttenuationExponentLocation,
          attenuation.logExponent,
        )
        context.uniform1f(pipeline.iorLocation, material.ior)
        context.uniform1f(pipeline.roughnessLocation, material.roughness)
        context.uniform1f(pipeline.thicknessLocation, material.thickness)
      }
      context.drawElements(
        context.TRIANGLES,
        resources.indexCount,
        context.UNSIGNED_SHORT,
        0
      )
    }
    try {
      queues.opaque.forEach(draw)
      if (sceneColor) {
        this.#resolveSceneColor(sceneColor)
        this.#configureTransparentPass(width, height)
        queues.transparent.forEach(draw)
      }
      assertNoWebGLError(context, "frame draw")
      assertContextAvailable(context)
    } finally {
      context.depthMask(true)
      context.disable(context.BLEND)
      context.bindFramebuffer(context.FRAMEBUFFER, null)
      context.activeTexture(context.TEXTURE2)
      context.bindTexture(context.TEXTURE_2D, null)
      context.activeTexture(context.TEXTURE4)
      context.bindTexture(context.TEXTURE_2D, null)
      context.activeTexture(context.TEXTURE3)
      context.bindTexture(context.TEXTURE_2D, null)
      context.activeTexture(context.TEXTURE1)
      context.bindTexture(context.TEXTURE_2D, null)
      context.activeTexture(context.TEXTURE0)
      context.bindTexture(context.TEXTURE_2D, null)
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

  #configureTransparentPass(
    width: number,
    height: number,
  ) {
    const context = this.#context
    context.bindFramebuffer(context.FRAMEBUFFER, null)
    context.viewport(0, 0, width, height)
    context.enable(context.BLEND)
    context.blendEquation(context.FUNC_ADD)
    context.blendFunc(context.ONE, context.ONE_MINUS_SRC_ALPHA)
    context.depthMask(false)
  }

  #resolveSceneColor(resources: SceneColorResources) {
    const context = this.#context
    context.bindFramebuffer(context.READ_FRAMEBUFFER, null)
    context.bindFramebuffer(context.DRAW_FRAMEBUFFER, resources.framebuffer)
    context.blitFramebuffer(
      0,
      0,
      resources.width,
      resources.height,
      0,
      0,
      resources.width,
      resources.height,
      context.COLOR_BUFFER_BIT,
      context.NEAREST,
    )
    context.bindFramebuffer(context.FRAMEBUFFER, null)
    context.activeTexture(context.TEXTURE1)
    context.bindTexture(context.TEXTURE_2D, resources.texture)
    context.generateMipmap(context.TEXTURE_2D)
  }

  #renderShadowPass(
    meshes: readonly Mesh[],
    selected: ReturnType<typeof findShadowLight>
  ): ShadowFrame | undefined {
    if (!selected) return undefined
    const opaqueCasters = meshes.filter((mesh) =>
      mesh.castShadow && mesh.getMaterial().kind !== "glass")
    const transmissiveCasters = meshes.filter((mesh) =>
      mesh.castShadow && mesh.getMaterial().kind === "glass")
    const hasLitReceiver = meshes.some((mesh) =>
      mesh.receiveShadow && mesh.getMaterial().kind !== "unlit")
    if ((opaqueCasters.length === 0 && transmissiveCasters.length === 0)
        || !hasLitReceiver) {
      return undefined
    }
    const shadow = selected.light.getShadow()
    const lightViewProjection = directionalLightShadowViewProjection(selected.light)
    if (!shadow || !lightViewProjection) return undefined
    const context = this.#context
    let opaque: ShadowMapResources | undefined
    let transmissive: TransmissiveShadowMapResources | undefined
    try {
      if (opaqueCasters.length > 0) {
        opaque = this.#shadowMapResources(shadow.mapSize)
        this.#renderOpaqueShadowCasters(opaqueCasters, lightViewProjection, opaque)
      }
      if (transmissiveCasters.length > 0) {
        transmissive = this.#transmissiveShadowMapResources(shadow.mapSize)
        this.#renderTransmissiveShadowCasters(
          transmissiveCasters,
          lightViewProjection,
          transmissive,
        )
      }
      assertNoWebGLError(context, "shadow pass")
      return {
        lightIndex: selected.lightIndex,
        lightViewProjection,
        bias: shadow.bias,
        mapSize: shadow.mapSize,
        filterRadius: shadow.filterRadius,
        opaque,
        transmissive,
      }
    } finally {
      context.bindVertexArray(null)
      context.useProgram(null)
      context.bindFramebuffer(context.FRAMEBUFFER, null)
      context.colorMask(true, true, true, true)
      context.depthMask(true)
    }
  }

  #renderOpaqueShadowCasters(
    casters: readonly Mesh[],
    lightViewProjection: Matrix4,
    resources: ShadowMapResources,
  ) {
    const context = this.#context
    const pipeline = this.#shadowPipelineResources()
    context.bindFramebuffer(context.FRAMEBUFFER, resources.framebuffer)
    this.#configureShadowPass(resources.mapSize, false)
    context.clear(context.DEPTH_BUFFER_BIT)
    context.useProgram(pipeline.program)
    casters.forEach((mesh) => {
      this.#drawShadowMesh(mesh, lightViewProjection, pipeline)
    })
  }

  #renderTransmissiveShadowCasters(
    casters: readonly Mesh[],
    lightViewProjection: Matrix4,
    resources: TransmissiveShadowMapResources,
  ) {
    const context = this.#context
    const pipeline = this.#transmissiveShadowPipelineResources()
    context.bindFramebuffer(context.FRAMEBUFFER, resources.framebuffer)
    this.#configureShadowPass(resources.mapSize, true)
    context.clearColor(1, 1, 1, 1)
    context.clear(context.COLOR_BUFFER_BIT | context.DEPTH_BUFFER_BIT)
    context.useProgram(pipeline.program)
    casters.forEach((mesh) => {
      const material = mesh.getMaterial()
      if (material.kind !== "glass") return
      const attenuation = volumeAttenuationUniforms(material)
      context.uniform3fv(pipeline.attenuationColorLocation, attenuation.color)
      context.uniform1i(
        pipeline.hasVolumeAttenuationLocation,
        attenuation.enabled ? 1 : 0,
      )
      context.uniform1f(
        pipeline.logAttenuationExponentLocation,
        attenuation.logExponent,
      )
      context.uniform1f(pipeline.surfaceTransmissionLocation, 1 - material.color[3])
      this.#drawShadowMesh(mesh, lightViewProjection, pipeline)
    })
  }

  #configureShadowPass(mapSize: number, writesColor: boolean) {
    const context = this.#context
    context.viewport(0, 0, mapSize, mapSize)
    context.colorMask(writesColor, writesColor, writesColor, writesColor)
    context.disable(context.BLEND)
    context.enable(context.DEPTH_TEST)
    context.depthFunc(context.LEQUAL)
    context.depthMask(true)
    context.clearDepth(1)
  }

  #drawShadowMesh(
    mesh: Mesh,
    lightViewProjection: Matrix4,
    pipeline: ShadowPipelineResources,
  ) {
    const context = this.#context
    const resources = this.#meshResources(mesh)
    uploadChangedGeometry(context, mesh, resources)
    context.bindVertexArray(resources.vertexArray)
    context.uniformMatrix4fv(
      pipeline.modelLightViewProjectionLocation,
      false,
      multiplyMatrix4(lightViewProjection, mesh.getModelMatrix()),
    )
    context.drawElements(
      context.TRIANGLES,
      resources.indexCount,
      context.UNSIGNED_SHORT,
      0,
    )
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
    lighting: LightingSnapshot,
    shadow?: ShadowFrame
  ) {
    const context = this.#context
    context.uniformMatrix4fv(pipeline.viewProjectionLocation, false, viewProjection)
    context.uniform3fv(pipeline.ambientLightLocation, lighting.ambient)
    context.uniform1i(pipeline.directionalLightCountLocation, lighting.directionalCount)
    if (lighting.directionalCount > 0) {
      context.uniform3fv(pipeline.directionToLightsLocation, lighting.directionToLights)
      context.uniform3fv(
        pipeline.directionalLightColorsLocation,
        lighting.directionalColors
      )
    }
    context.uniform1i(pipeline.shadowLightIndexLocation, shadow?.lightIndex ?? -1)
    context.uniform1f(pipeline.shadowBiasLocation, shadow?.bias ?? 0)
    context.uniform1i(pipeline.shadowMapLocation, 0)
    context.uniform1i(pipeline.hasOpaqueShadowMapLocation, shadow?.opaque ? 1 : 0)
    context.uniform1i(pipeline.transmissiveShadowDepthMapLocation, 3)
    context.uniform1i(pipeline.transmissiveShadowColorMapLocation, 4)
    context.uniform1i(
      pipeline.hasTransmissiveShadowMapLocation,
      shadow?.transmissive ? 1 : 0,
    )
    const filterStep = shadow ? shadow.filterRadius / shadow.mapSize : 0
    context.uniform2f(
      pipeline.shadowFilterStepLocation,
      filterStep,
      filterStep,
    )
    context.activeTexture(context.TEXTURE0)
    context.bindTexture(context.TEXTURE_2D, shadow?.opaque?.depthTexture ?? null)
    context.activeTexture(context.TEXTURE3)
    context.bindTexture(
      context.TEXTURE_2D,
      shadow?.transmissive?.depthTexture ?? null,
    )
    context.activeTexture(context.TEXTURE4)
    context.bindTexture(
      context.TEXTURE_2D,
      shadow?.transmissive?.transmittanceTexture ?? null,
    )
    if (shadow) {
      context.uniformMatrix4fv(
        pipeline.shadowViewProjectionLocation,
        false,
        shadow.lightViewProjection
      )
    }
    context.activeTexture(context.TEXTURE0)
  }

  #applyEnvironmentFrameUniforms(
    pipeline: StandardPipelineResources | GlassPipelineResources,
    camera: PerspectiveCamera,
    environment: EnvironmentMap | undefined,
    environmentTexture: EnvironmentTextureResources | undefined,
  ) {
    const context = this.#context
    context.uniform3fv(
      pipeline.cameraPositionLocation,
      new Float32Array(camera.getPosition()),
    )
    context.uniform1i(pipeline.environmentMapLocation, 2)
    context.uniform1i(pipeline.hasEnvironmentLocation, environmentTexture ? 1 : 0)
    context.uniform1f(pipeline.environmentIntensityLocation, environment?.intensity ?? 0)
    context.uniform1f(
      pipeline.environmentMaxLodLocation,
      environmentTexture?.maxMipLevel ?? 0,
    )
    context.activeTexture(context.TEXTURE2)
    context.bindTexture(context.TEXTURE_2D, environmentTexture?.texture ?? null)
    context.activeTexture(context.TEXTURE0)
  }

  #shadowPipelineResources() {
    this.#shadowPipeline ??= createShadowPipeline(this.#context)
    return this.#shadowPipeline
  }

  #transmissiveShadowPipelineResources() {
    this.#transmissiveShadowPipeline ??= createTransmissiveShadowPipeline(this.#context)
    return this.#transmissiveShadowPipeline
  }

  #shadowMapResources(mapSize: number) {
    if (this.#shadowMap?.mapSize === mapSize) return this.#shadowMap
    if (this.#shadowMap) this.#deleteShadowMap(this.#shadowMap)
    this.#shadowMap = undefined
    const created = createShadowMapResources(this.#context, mapSize)
    this.#shadowMap = created
    return created
  }

  #transmissiveShadowMapResources(mapSize: number) {
    if (this.#transmissiveShadowMap?.mapSize === mapSize) {
      return this.#transmissiveShadowMap
    }
    if (this.#transmissiveShadowMap) {
      this.#deleteTransmissiveShadowMap(this.#transmissiveShadowMap)
    }
    this.#transmissiveShadowMap = undefined
    const created = createTransmissiveShadowMapResources(this.#context, mapSize)
    this.#transmissiveShadowMap = created
    return created
  }

  #sceneColorResources(width: number, height: number) {
    if (this.#sceneColor?.width === width && this.#sceneColor.height === height) {
      return this.#sceneColor
    }
    if (this.#sceneColor) this.#deleteSceneColor(this.#sceneColor)
    this.#sceneColor = undefined
    const created = createSceneColorResources(this.#context, width, height)
    this.#sceneColor = created
    return created
  }

  #environmentTextureResources(environment: EnvironmentMap) {
    const context = this.#context
    context.activeTexture(context.TEXTURE2)
    try {
      if (!this.#environmentTexture) {
        this.#environmentTexture = createEnvironmentTextureResources(
          context,
          environment.copyImageSnapshot(),
        )
      } else if (this.#environmentTexture.imageRevision !== environment.imageRevision) {
        uploadEnvironmentTexture(
          context,
          this.#environmentTexture,
          environment.copyImageSnapshot(),
        )
      }
      return this.#environmentTexture
    } finally {
      context.activeTexture(context.TEXTURE0)
    }
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

  #deleteShadowMap(resources: ShadowMapResources) {
    this.#context.deleteFramebuffer(resources.framebuffer)
    this.#context.deleteTexture(resources.depthTexture)
  }

  #deleteTransmissiveShadowMap(resources: TransmissiveShadowMapResources) {
    this.#context.deleteFramebuffer(resources.framebuffer)
    this.#context.deleteTexture(resources.depthTexture)
    this.#context.deleteTexture(resources.transmittanceTexture)
  }

  #deleteSceneColor(resources: SceneColorResources) {
    this.#context.deleteFramebuffer(resources.framebuffer)
    this.#context.deleteTexture(resources.texture)
  }

  #deleteEnvironmentTexture(resources: EnvironmentTextureResources) {
    this.#context.deleteTexture(resources.texture)
  }

  #deleteResources() {
    this.#meshes.forEach((resources) => this.#deleteMeshResources(resources))
    this.#meshes.clear()
    this.#pipelines.forEach((pipeline) => this.#context.deleteProgram(pipeline.program))
    this.#pipelines.clear()
    if (this.#shadowPipeline) this.#context.deleteProgram(this.#shadowPipeline.program)
    if (this.#transmissiveShadowPipeline) {
      this.#context.deleteProgram(this.#transmissiveShadowPipeline.program)
    }
    if (this.#shadowMap) this.#deleteShadowMap(this.#shadowMap)
    if (this.#transmissiveShadowMap) {
      this.#deleteTransmissiveShadowMap(this.#transmissiveShadowMap)
    }
    if (this.#sceneColor) this.#deleteSceneColor(this.#sceneColor)
    if (this.#environmentTexture) {
      this.#deleteEnvironmentTexture(this.#environmentTexture)
    }
    this.#shadowPipeline = undefined
    this.#shadowMap = undefined
    this.#transmissiveShadowPipeline = undefined
    this.#transmissiveShadowMap = undefined
    this.#sceneColor = undefined
    this.#environmentTexture = undefined
  }

  #forgetResources() {
    this.#meshes.clear()
    this.#pipelines.clear()
    this.#shadowPipeline = undefined
    this.#shadowMap = undefined
    this.#transmissiveShadowPipeline = undefined
    this.#transmissiveShadowMap = undefined
    this.#sceneColor = undefined
    this.#environmentTexture = undefined
  }
}

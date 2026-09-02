import type { GlassMaterial } from "./material"

export interface VolumeAttenuationUniforms {
  readonly color: Float32Array
  readonly enabled: boolean
  readonly logExponent: number
}

export const VOLUME_ATTENUATION_GLSL = `
float volume_attenuation_channel(float color, float log_attenuation_exponent) {
  if (color <= 0.0) return 0.0;
  if (color >= 1.0) return 1.0;
  // Beyond this range every non-endpoint Float32 channel rounds to its 0 or 1 limit.
  float attenuation_exponent = exp(clamp(log_attenuation_exponent, -80.0, 80.0));
  return exp(log(color) * attenuation_exponent);
}

vec3 volume_attenuation(
  vec3 attenuation_color,
  bool has_volume_attenuation,
  float log_attenuation_exponent
) {
  if (!has_volume_attenuation) return vec3(1.0);
  return vec3(
    volume_attenuation_channel(attenuation_color.r, log_attenuation_exponent),
    volume_attenuation_channel(attenuation_color.g, log_attenuation_exponent),
    volume_attenuation_channel(attenuation_color.b, log_attenuation_exponent)
  );
}
`

export function volumeAttenuationUniforms(
  material: GlassMaterial,
): VolumeAttenuationUniforms {
  const enabled = material.attenuationDistance !== undefined
    && material.thickness > 0
  return {
    color: new Float32Array(material.attenuationColor),
    enabled,
    logExponent: enabled
      ? Math.log(material.thickness) - Math.log(material.attenuationDistance!)
      : 0,
  }
}

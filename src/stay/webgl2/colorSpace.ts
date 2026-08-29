export const SRGB_TRANSFER_GLSL = `
float linear_to_srgb_channel(float value) {
  value = max(value, 0.0);
  return value <= 0.0031308
    ? value * 12.92
    : 1.055 * pow(value, 1.0 / 2.4) - 0.055;
}

vec3 linear_to_srgb(vec3 value) {
  return vec3(
    linear_to_srgb_channel(value.r),
    linear_to_srgb_channel(value.g),
    linear_to_srgb_channel(value.b)
  );
}
`

export function srgbChannelToLinear(value: number) {
  return Math.fround(value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4)
}

export function linearizeSrgbColor(color: ArrayLike<number>) {
  return new Float32Array([
    srgbChannelToLinear(color[0]),
    srgbChannelToLinear(color[1]),
    srgbChannelToLinear(color[2]),
  ])
}

export function linearizeSrgbColorWithAlpha(color: ArrayLike<number>) {
  return new Float32Array([
    srgbChannelToLinear(color[0]),
    srgbChannelToLinear(color[1]),
    srgbChannelToLinear(color[2]),
    color[3],
  ])
}

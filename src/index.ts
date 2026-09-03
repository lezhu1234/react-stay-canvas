export * from "./shapes"
export { default as StayCanvas } from "./stayCanvas"
export * from "./types"
export * from "./userConstants"
export * from "./utils"
import * as PredefinedEventList from "./predefinedEvents"
export { StayInstantChild } from "./stay/children/stayInstantChild"
export { StayAnimatedChild } from "./stay/children/stayAnimatedChild"
export { Mesh } from "./stay/webgl2/mesh"
export type {
  MeshGeometryInput,
  MeshGeometrySnapshot,
} from "./stay/webgl2/mesh"
export {
  GlassMaterial,
  ImageMaterial,
  LambertMaterial,
  StandardMaterial,
  TransparentImageMaterial,
  UnlitMaterial,
} from "./stay/webgl2/material"
export type {
  GlassAttenuationColor,
  GlassMaterialProps,
  ImageMaterialProps,
  LambertMaterialProps,
  MeshColor,
  MeshMaterial,
  MeshMaterialSnapshot,
  StandardMaterialProps,
  TransparentImageMaterialProps,
  UnlitMaterialProps,
} from "./stay/webgl2/material"
export { ImageTexture } from "./stay/webgl2/imageTexture"
export type {
  ImageTexturePixelData,
  ImageTextureAlphaMode,
  ImageTextureProps,
} from "./stay/webgl2/imageTexture"
export { AmbientLight, DirectionalLight, PointLight } from "./stay/webgl2/light"
export type {
  AmbientLightProps,
  DirectionalLightProps,
  DirectionalShadow,
  DirectionalShadowProps,
  LightColor,
  PointLightProps,
  WebGLLight,
} from "./stay/webgl2/light"
export { EnvironmentMap } from "./stay/webgl2/environmentMap"
export type {
  EnvironmentMapImage,
  EnvironmentMapPixelData,
  EnvironmentMapProps,
} from "./stay/webgl2/environmentMap"
export { PerspectiveCamera } from "./stay/webgl2/perspectiveCamera"
export { StayWebGLChild } from "./stay/webgl2/stayWebGLChild"
export type { StayWebGLChildProps } from "./stay/webgl2/stayWebGLChild"
export type {
  StayWebGLChildSnapshot,
  StayWebGLSceneChildFragment,
  StayWebGLSceneFragment,
  WebGLMeshSnapshot,
} from "./stay/webgl2/stayWebGLChildSnapshot"
export {
  identityMatrix4,
  multiplyMatrix4,
  translationMatrix4,
} from "./stay/webgl2/math3D"
export type { Matrix4, Vector3 } from "./stay/webgl2/math3D"

export { PredefinedEventList }

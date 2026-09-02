import {
  AmbientLight,
  DirectionalLight,
  EnvironmentMap,
  GlassMaterial,
  ImageMaterial,
  ImageTexture,
  LambertMaterial,
  Mesh,
  PerspectiveCamera,
  PointLight,
  StayWebGLChild,
  StandardMaterial,
  TransparentImageMaterial,
  type StayTools,
  type StayWebGLSceneFragment,
  type GlassAttenuationColor,
  type ImageTextureAlphaMode,
  type WebGL2LayerConfig,
  type PlanarReflection,
  translationMatrix4,
} from "react-stay-canvas"

const camera = new PerspectiveCamera({ position: [0, 0, 3], target: [0, 0, 0] })
camera.setPose([0.2, 0, 3], [0, 0, 0])
camera.setProjection(Math.PI / 3, 0.1, 20)

const mesh = new Mesh({
  geometry: {
    positions: [-0.8, -0.8, 0, 0.8, -0.8, 0, 0, 0.8, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    indices: [0, 1, 2],
  },
  material: new LambertMaterial({ color: [0.2, 0.5, 0.9, 1] }),
  castShadow: true,
  receiveShadow: true,
})
const pixels = new Uint8Array([
  255, 0, 0, 255,
  0, 255, 0, 255,
  0, 0, 255, 255,
  255, 255, 255, 255,
])
const imageTexture = new ImageTexture({ width: 2, height: 2, data: pixels })
const imageMesh = new Mesh({
  geometry: {
    positions: [-1, 1, 0, 1, 1, 0, 1, -1, 0, -1, -1, 0],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
  },
  material: new ImageMaterial({ texture: imageTexture }),
})
const transparentAlphaMode: ImageTextureAlphaMode = "straight"
const transparentTexture = new ImageTexture({
  width: 2,
  height: 2,
  alphaMode: transparentAlphaMode,
  data: new Uint8Array([
    255, 255, 255, 255,
    255, 255, 255, 128,
    255, 255, 255, 64,
    255, 255, 255, 0,
  ]),
})
const transparentImageMesh = new Mesh({
  geometry: {
    positions: [-1, 1, 0, 1, 1, 0, 1, -1, 0, -1, -1, 0],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
  },
  material: new TransparentImageMaterial({ texture: transparentTexture }),
  castShadow: false,
})
mesh.setModelMatrix(translationMatrix4(0.2, 0, 0))
mesh.setMaterial(new LambertMaterial({ color: [0.3, 0.6, 1, 1] }))
const standard = new StandardMaterial({
  color: [0.72, 0.76, 0.8, 1],
  metallic: 0.1,
  roughness: 0.28,
})
const standardMetallic: number = standard.metallic
const standardRoughness: number = standard.roughness
mesh.setMaterial(standard)
const glass = new GlassMaterial({
  attenuationColor: [0.82, 0.94, 1],
  attenuationDistance: 1.2,
  color: [0.6, 0.85, 1, 0.2],
  ior: 1.46,
  roughness: 0.24,
  thickness: 0.18,
})
const glassAttenuationColor: GlassAttenuationColor = glass.attenuationColor
const glassAttenuationDistance: number | undefined = glass.attenuationDistance
const glassIor: number = glass.ior
const glassRoughness: number = glass.roughness
const glassThickness: number = glass.thickness
mesh.setMaterial(glass)
mesh.setCastShadow(false)
mesh.setReceiveShadow(true)
mesh.setMaterial(standard)
mesh.setPlanarReflection({
  localPlane: { point: [0, 0, 0], normal: [0, 1, 0] },
  resolutionScale: 0.5,
})
const planarReflection: PlanarReflection | undefined = mesh.getPlanarReflection()
mesh.setPlanarReflection(undefined)

const ambient = new AmbientLight({ color: [0.9, 0.95, 1], intensity: 0.3 })
const key = new DirectionalLight({
  directionToLight: [0.2, 0.4, 1],
  intensity: 0.8,
  shadow: {
    target: [0, 0, 0],
    width: 6,
    height: 4,
    mapSize: 1024,
    filterRadius: 1.5,
  },
})
const point = new PointLight({
  position: [1, 2, 3],
  color: [1, 0.8, 0.6],
  intensity: 12,
  range: 8,
})
point.setPosition([2, 3, 4])
point.setColor([0.9, 0.8, 0.7])
point.setIntensity(10)
point.setRange(undefined)
const pointPosition = point.getPosition()
const pointRange: number | undefined = point.range
const environment = new EnvironmentMap({
  width: 4,
  height: 2,
  data: new Uint8Array(32),
  intensity: 0.8,
})
environment.setIntensity(0.6)
environment.setImage({ width: 8, height: 4, data: new Uint8ClampedArray(128) })
const layer: WebGL2LayerConfig = {
  backend: "webgl2",
  camera,
  environment,
  lights: [ambient, key, point],
}
key.setDirectionToLight([0.2, 0.4, 1])
key.setShadow({
  target: [0, 0, -1],
  distance: 8,
  near: 0.1,
  far: 20,
  filterRadius: 0,
})

declare const tools: StayTools
const child: StayWebGLChild = tools.webgl.appendChild({
  className: "plane",
  layer: 0,
  meshes: [mesh],
})
const matches: StayWebGLChild[] = tools.webgl.getChildrenBySelector(".plane")
const fragment: StayWebGLSceneFragment = tools.webgl.exportChildren(matches)
tools.webgl.importChildren(fragment)
tools.log()

// @ts-expect-error WebGL2SceneRuntime remains an internal GPU cache owner.
import { WebGL2SceneRuntime } from "react-stay-canvas"
// @ts-expect-error WebGL2LayerRuntime remains an internal Canvas owner.
import { WebGL2LayerRuntime } from "react-stay-canvas"

void camera
void child
void imageMesh
void transparentImageMesh
void layer
void glassIor
void glassAttenuationColor
void glassAttenuationDistance
void glassRoughness
void glassThickness
void standardMetallic
void standardRoughness
void pointPosition
void pointRange
void planarReflection
void WebGL2SceneRuntime
void WebGL2LayerRuntime

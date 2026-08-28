import {
  AmbientLight,
  DirectionalLight,
  GlassMaterial,
  LambertMaterial,
  Mesh,
  PerspectiveCamera,
  StayWebGLChild,
  type StayTools,
  type StayWebGLSceneFragment,
  type WebGL2LayerConfig,
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
})
mesh.setModelMatrix(translationMatrix4(0.2, 0, 0))
mesh.setMaterial(new LambertMaterial({ color: [0.3, 0.6, 1, 1] }))
mesh.setMaterial(new GlassMaterial({ color: [0.6, 0.85, 1, 0.2] }))

const ambient = new AmbientLight({ color: [0.9, 0.95, 1], intensity: 0.3 })
const key = new DirectionalLight({ directionToLight: [0, 0, 1], intensity: 0.8 })
const layer: WebGL2LayerConfig = { backend: "webgl2", camera, lights: [ambient, key] }
key.setDirectionToLight([0.2, 0.4, 1])

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
void layer
void WebGL2SceneRuntime
void WebGL2LayerRuntime

import {
  type CanvasLayerConfig,
  PerspectiveCamera,
  type StayCanvasProps,
  type WebGL2LayerConfig,
} from "react-stay-canvas"

const camera = new PerspectiveCamera({ position: [0, 0, 3], target: [0, 0, 0] })
const webgl: WebGL2LayerConfig = {
  backend: "webgl2",
  camera,
  context: (canvas) => canvas.getContext("webgl2", { alpha: true }),
  onContextLost: (event) => event.preventDefault(),
  onContextRestored: () => {},
}

const layers: CanvasLayerConfig[] = [
  { backend: "canvas2d" },
  (canvas) => canvas.getContext("2d"),
  webgl,
]

const props: StayCanvasProps = { layers }

// @ts-expect-error A WebGL2 layer resolver must return a WebGL2 context.
const invalidWebGL: WebGL2LayerConfig = { backend: "webgl2", camera, context: (canvas) => canvas.getContext("2d") }
// @ts-expect-error Backends are explicit and closed to supported values.
const invalidBackend: CanvasLayerConfig = { backend: "webgpu" }

void invalidWebGL
void invalidBackend
void props

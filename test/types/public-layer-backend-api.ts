import {
  type CanvasLayerConfig,
  type StayCanvasProps,
  type WebGLLayerConfig,
} from "react-stay-canvas"

const webgl: WebGLLayerConfig = {
  backend: "webgl",
  context: (canvas) => canvas.getContext("webgl", { alpha: true }),
  onContextLost: (event) => event.preventDefault(),
  onContextRestored: () => {},
}

const layers: CanvasLayerConfig[] = [
  { backend: "canvas2d" },
  (canvas) => canvas.getContext("2d"),
  webgl,
]

const props: StayCanvasProps = { layers }

// @ts-expect-error A WebGL layer resolver must return a WebGL context.
const invalidWebGL: WebGLLayerConfig = { backend: "webgl", context: (canvas) => canvas.getContext("2d") }
// @ts-expect-error Backends are explicit and closed to supported values.
const invalidBackend: CanvasLayerConfig = { backend: "webgpu" }

void invalidWebGL
void invalidBackend
void props

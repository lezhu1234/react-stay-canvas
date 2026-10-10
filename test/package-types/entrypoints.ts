import type { SceneStepSubmission, SceneSubmission } from "../../dist/index"
import { Rectangle, StayAnimatedChild } from "../../dist/index"
import {
  ViewportBackground, wrapSceneShape, createShapeTransitionRegistry,
  defaultShapeTransitionRegistry, type ShapeTransitionModule,
} from "../../dist/index"
import {
  Rectangle as WorkerRectangle,
  StayAnimatedChild as WorkerAnimatedChild,
  type CanvasWorkerInstallation,
  SceneTransitionShape as WorkerTransitionShape,
  ViewportBackground as WorkerViewportBackground,
} from "../../dist/worker"

const hold: ShapeTransitionModule = {
  id: "hold", contractVersion: 1,
  matches: ({ after }) => after.mode === "hold",
  sample: ({ before }) => before.components,
}
const registry = createShapeTransitionRegistry([hold, ...defaultShapeTransitionRegistry.modules])
const wrapped: WorkerTransitionShape = wrapSceneShape(new ViewportBackground({ fillConfig: { color: { r: 20, g: 30, b: 40, a: 1 } } }), "hold", registry)
const workerBackground: ViewportBackground = new WorkerViewportBackground()
void wrapped
void workerBackground

const shape: Rectangle = new WorkerRectangle({ x: 0, y: 0, width: 20, height: 20 })
const workerShape: WorkerRectangle = new Rectangle({ x: 0, y: 0, width: 20, height: 20 })
const target: SceneStepSubmission = {
  revision: "step", resourceRevision: "resources", durationMs: 0,
  children: [{ id: "value", className: "value", shapes: new Map([["body", workerShape]]) }],
}
const replacement: SceneSubmission = {
  revision: "replacement", resourceRevision: "resources",
  children: [{ id: "value", className: "value", slices: [{ name: "body", frames: [shape] }] }],
}
const installation: CanvasWorkerInstallation<void, number> = {
  setup: ({ yield: yieldTurn }) => {
    void yieldTurn()
  },
  run: async (_input, context) => {
    const epoch = context.canvas.scene.beginUpdate()
    const prepared = await context.canvas.scene.prepare(epoch, replacement, {
      signal: context.signal, transitionId: "shape", control: { kind: "timeline", durationMs: 0 },
    })
    await context.canvas.scene.commit(prepared)
    context.canvas.scene.appendStep(target, { signal: context.signal })
    context.emit(1)
  },
}
function nativeChildCompatibility(main: StayAnimatedChild, worker: WorkerAnimatedChild) {
  const workerFromMain: WorkerAnimatedChild = main
  const mainFromWorker: StayAnimatedChild = worker
  return { workerFromMain, mainFromWorker }
}
void installation
void nativeChildCompatibility

import {
  Rectangle, ViewportBackground, wrapSceneShape, createShapeTransitionRegistry,
  defaultShapeTransitionRegistry, type ShapeTransitionModule, type SceneStepSubmission,
} from "react-stay-canvas"

const hold: ShapeTransitionModule = {
  id: "hold", contractVersion: 1,
  matches: ({ after }) => after.mode === "hold",
  sample: ({ before }) => before.components.map(({ shape, opacity }) => ({
    shape: shape.copy() as typeof shape, opacity,
  })),
}
const registry = createShapeTransitionRegistry([hold, ...defaultShapeTransitionRegistry.modules])
const body = wrapSceneShape(new Rectangle({ x: 0, y: 0, width: 40, height: 30 }), "hold", registry)
const background = wrapSceneShape(new ViewportBackground({
  fillConfig: { color: { r: 240, g: 240, b: 240, a: 1 } },
}), "morph")
const submission: SceneStepSubmission = {
  revision: "step", resourceRevision: "resources", durationMs: 100,
  children: [{ id: "body", className: "body", shapes: new Map([["body", body]]) },
    { id: "background", className: "background", shapes: new Map([["surface", background]]) }],
}
void submission

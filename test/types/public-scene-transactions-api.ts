import {
  Rectangle,
  type SceneBatchSubmission,
  type SceneCommitReceipt,
  type SceneSubmission,
  type StayTools,
} from "react-stay-canvas"

declare const tools: StayTools

const target: SceneSubmission = {
  revision: "scene-2",
  resourceRevision: "font-2",
  children: [{
    id: "value",
    className: "value",
    slices: [{
      name: "body",
      frames: [new Rectangle({ x: 0, y: 0, width: 10, height: 10 })],
    }],
  }],
}

const epoch = tools.scene.beginUpdate()
const prepared = tools.scene.prepare(epoch, target, {
  transitionId: "shape",
  control: { kind: "timeline", durationMs: 150 },
  signal: new AbortController().signal,
})
const receipt: Promise<SceneCommitReceipt> = prepared.then((handle) => tools.scene.commit(handle))
tools.scene.cancel(epoch)

// @ts-expect-error Scene epochs are issued by the owning Canvas.
tools.scene.cancel({})
// @ts-expect-error Prepared handles are issued by the owning Canvas.
tools.scene.discard({ preparationId: "forged" })

void receipt

const batched: SceneBatchSubmission = {
  revision: "scene-batched",
  resourceRevision: "font-2",
  batches: (async function* () { yield target.children })(),
}
void tools.scene.prepare(tools.scene.beginUpdate(), batched, {
  transitionId: "shape",
  control: { kind: "timeline", durationMs: 150 },
  signal: new AbortController().signal,
})

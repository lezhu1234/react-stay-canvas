import {
  Rectangle,
  type SceneBatchSubmission,
  type SceneCommitReceipt,
  type SceneStepReceipt,
  type SceneStepChild,
  type SceneStepSubmission,
  type SceneStepSequenceSubmission,
  type SceneSubmission,
  type SceneTransitionPrepareOptions,
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
void prepared.then((handle) => {
  const sampled: readonly SceneStepChild[] = tools.scene.sample(handle, 0)
  void sampled
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

const completeStep: SceneStepSubmission = {
  revision: "step-1",
  resourceRevision: "font-2",
  durationMs: 150,
  children: [{
    id: "value",
    className: "value",
    shapes: new Map([
      ["body", new Rectangle({ x: 20, y: 0, width: 10, height: 10 })],
    ]),
  }],
}
const stepReceipt: SceneStepReceipt = tools.scene.appendStep(completeStep, {
  signal: new AbortController().signal,
})
const acceptedTimelineEnd: number = stepReceipt.endTimeMs
void acceptedTimelineEnd

const transitionOptions: SceneTransitionPrepareOptions = { signal: new AbortController().signal }
const controlled: Promise<SceneCommitReceipt> = tools.scene.prepareTransition(
  tools.scene.beginUpdate(), completeStep, transitionOptions
).then((handle) => tools.scene.commit(handle))
tools.scene.settleTransition()
void controlled

// @ts-expect-error Controlled transitions take one complete step, not a full timeline submission.
tools.scene.prepareTransition(tools.scene.beginUpdate(), target, transitionOptions)

const replacementSteps: SceneStepSequenceSubmission = {
  revision: "replacement",
  resourceRevision: "font-2",
  steps: (async function* () { yield completeStep })(),
}
void tools.scene.prepare(tools.scene.beginUpdate(), replacementSteps, {
  transitionId: "shape",
  control: { kind: "timeline", durationMs: 150 },
  signal: new AbortController().signal,
})

// @ts-expect-error Complete-step append is synchronous, not a display-frame promise.
const promisedStep: Promise<SceneStepReceipt> = tools.scene.appendStep(completeStep, {
  signal: new AbortController().signal,
})
void promisedStep

// @ts-expect-error Whole-scene submissions contain slices rather than one complete Shape map.
tools.scene.appendStep(target, { signal: new AbortController().signal })
// @ts-expect-error A step receipt records accepted timeline time, not a rendered frame number.
stepReceipt.acceptedAtFrame

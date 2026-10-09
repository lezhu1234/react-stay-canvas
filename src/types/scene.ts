import type { AnimatedShape } from "../shapes/animatedShape"
import type { ChildPlacement } from "./transform"

declare const sceneEpochBrand: unique symbol
declare const preparedSceneBrand: unique symbol

export interface SceneEpoch {
  readonly [sceneEpochBrand]: true
}

export interface PreparedScene {
  readonly [preparedSceneBrand]: true
  readonly preparationId: string
}

export interface SceneTimelineSlice {
  readonly name: string
  readonly frames: readonly AnimatedShape[]
  readonly prependZeroShape?: boolean
}

export interface SceneTimelineChild {
  readonly id: string
  readonly className: string
  readonly placement?: ChildPlacement
  readonly slices: readonly SceneTimelineSlice[]
}

export interface SceneSubmission {
  readonly revision: string
  readonly resourceRevision: string
  readonly children: readonly SceneTimelineChild[]
}

export interface SceneBatchSubmission {
  readonly revision: string
  readonly resourceRevision: string
  readonly batches: AsyncIterable<readonly SceneTimelineChild[]>
}

export interface SceneStepChild {
  readonly id: string
  readonly className: string
  /** Static placement, established when this Child first appears. */
  readonly placement?: ChildPlacement
  readonly shapes: ReadonlyMap<string, AnimatedShape>
}

export interface SceneStepSubmission {
  readonly revision: string
  readonly resourceRevision: string
  /** Length of this interval; each target retains its native easing. */
  readonly durationMs: number
  readonly children: readonly SceneStepChild[]
}

export interface SceneStepReceipt {
  readonly revision: string
  readonly resourceRevision: string
  readonly endTimeMs: number
}

/** Prepares a replacement timeline from complete steps without an application-owned history. */
export interface SceneStepSequenceSubmission {
  readonly revision: string
  readonly resourceRevision: string
  readonly steps: AsyncIterable<SceneStepSubmission>
}

export interface SceneResourceLease {
  readonly revision: string
  isCurrent(): boolean
  release(): void
}

export interface ScenePrepareOptions {
  readonly transitionId: "shape"
  readonly control:
    | { readonly kind: "timeline"; readonly durationMs: number }
    | { readonly kind: "time-domain"; readonly domain: string }
  readonly signal: AbortSignal
  readonly resourceLease?: SceneResourceLease
}

export interface SceneTransitionPrepareOptions {
  readonly signal: AbortSignal
  readonly resourceLease?: SceneResourceLease
}

export interface SceneCommitReceipt {
  readonly preparationId: string
  readonly revision: string
  readonly resourceRevision: string
  readonly acceptedAtFrame: number
}

export interface SceneTransactions {
  /** Accepts a complete step offline, without waiting for a display frame. */
  appendStep(target: SceneStepSubmission, options: { readonly signal: AbortSignal }): SceneStepReceipt
  beginUpdate(): SceneEpoch
  prepare(epoch: SceneEpoch, target: SceneSubmission | SceneBatchSubmission | SceneStepSequenceSubmission, options: ScenePrepareOptions): Promise<PreparedScene>
  /** Prepares one controlled interval from the displayed native shapes to a complete target. */
  prepareTransition(epoch: SceneEpoch, target: SceneStepSubmission, options: SceneTransitionPrepareOptions): Promise<PreparedScene>
  /** Retains the target at the endpoint, or the displayed pose mid-interval, as a zero-time scene. */
  settleTransition(): void
  /** Samples an owned offline preparation without publishing it to the Canvas. */
  sample(prepared: PreparedScene, timeMs: number): readonly SceneStepChild[]
  commit(prepared: PreparedScene): Promise<SceneCommitReceipt>
  cancel(epoch: SceneEpoch): void
  discard(prepared: PreparedScene): void
  readonly revision: string | undefined
}

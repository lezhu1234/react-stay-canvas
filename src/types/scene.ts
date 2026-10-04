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

export interface SceneCommitReceipt {
  readonly preparationId: string
  readonly revision: string
  readonly resourceRevision: string
  readonly acceptedAtFrame: number
}

export interface SceneTransactions {
  beginUpdate(): SceneEpoch
  prepare(epoch: SceneEpoch, target: SceneSubmission | SceneBatchSubmission, options: ScenePrepareOptions): Promise<PreparedScene>
  commit(prepared: PreparedScene): Promise<SceneCommitReceipt>
  cancel(epoch: SceneEpoch): void
  discard(prepared: PreparedScene): void
  readonly revision: string | undefined
}

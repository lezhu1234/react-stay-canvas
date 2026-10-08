import type { AnimatedShape } from "../../shapes/animatedShape"
import type {
  PreparedScene,
  SceneBatchSubmission,
  SceneCommitReceipt,
  SceneEpoch,
  ScenePrepareOptions,
  SceneResourceLease,
  SceneStepChild,
  SceneStepReceipt,
  SceneStepSubmission,
  SceneStepSequenceSubmission,
  SceneSubmission,
  SceneTimelineChild,
  SceneTransactions,
} from "../../types/scene"
import { uuid4 } from "../../utils/identifiers"
import { ChildrenStore } from "../children/childrenStore"
import { StayAnimatedChild } from "../children/stayAnimatedChild"
import type { StayChild } from "../children/stayChild"
import { Renderer } from "../renderer"
import { captureSceneChild } from "../sceneTransfer"
import type { SetShapeChildCurrentTime } from "../types"
import type Canvas from "../../canvas"

type UpdateState = "new" | "preparing" | "prepared" | "queued" | "committed" |
  "cancelled" | "discarded" | "stale" | "failed"

interface Update {
  generation: number
  state: UpdateState
  revision?: string
  resourceRevision?: string
  durationMs?: number
  timelineEndTimeMs?: number
  prepared?: PreparedScene
  children?: StayAnimatedChild[]
  receipt?: SceneCommitReceipt
  commitPromise?: Promise<SceneCommitReceipt>
  abortListener?: () => void
  lease?: SceneResourceLease
}

interface SceneHandoff {
  startedAt: number
  durationMs: number
  sources: Map<string, Map<string, AnimatedShape>>
  exiting: Map<string, StayAnimatedChild>
  exitingLeases: SceneResourceLease[]
}

function capturePreparedChild(child: StayAnimatedChild): SceneStepChild {
  const captured = captureSceneChild(child)
  return {
    id: captured.sourceId,
    className: captured.className,
    placement: captured.placement,
    shapes: captured.shapes,
  }
}

export class CanvasSceneTransactions implements SceneTransactions {
  #epochs = new WeakMap<object, Update>()
  #preparations = new WeakMap<object, Update>()
  #current?: Update
  #generation = 0
  #revision?: string
  #resourceRevision?: string
  #timelineEndTimeMs = 0
  #activeLease?: SceneResourceLease
  #handoff?: SceneHandoff
  #destroyed = false

  constructor(
    private readonly canvas: Canvas,
    private readonly children: ChildrenStore<StayChild>,
    private readonly renderer: Renderer,
    private readonly cancelPointerSession: () => void,
    private readonly currentSample: () => SetShapeChildCurrentTime
  ) {}

  get revision() {
    return this.#revision
  }

  appendStep(target: SceneStepSubmission, options: { readonly signal: AbortSignal }): SceneStepReceipt {
    this.#assertAlive()
    this.#assertStepResources(target, options.signal)
    const epoch = this.beginUpdate()
    const update = this.#ownedEpoch(epoch)
    const rollback: (() => void)[] = []
    try {
      const timelines = this.children.values().filter((child): child is StayAnimatedChild =>
        child instanceof StayAnimatedChild)
      const startTimeMs = timelines.reduce((end, child) => Math.max(end, child.totalDurationMs), this.#timelineEndTimeMs)
      const plans = this.#prepareStep(target, timelines, startTimeMs)
      this.#assertStepResources(target, options.signal)
      this.#assertCurrentStep(update)
      const sample = this.currentSample()
      plans.forEach(({ apply }) => rollback.push(apply(sample)))
      this.#assertStepResources(target, options.signal)
      this.#assertCurrentStep(update)
      plans.forEach(({ child }) => this.children.add(child))
      this.#revision = target.revision
      this.#resourceRevision = target.resourceRevision
      this.#timelineEndTimeMs = startTimeMs + target.durationMs
      update.state = "committed"
      this.renderer.forceUpdateAllLayers()
      return Object.freeze({
        revision: target.revision,
        resourceRevision: target.resourceRevision,
        endTimeMs: this.#timelineEndTimeMs,
      })
    } catch (error) {
      rollback.reverse().forEach((restore) => restore())
      this.#finish(update, "failed")
      throw error
    }
  }

  #prepareStep(
    target: SceneStepSubmission,
    timelines: StayAnimatedChild[],
    startTimeMs: number,
    findChild: (id: string) => StayChild | undefined = (id) => this.children.get(id)
  ) {
    const specs = new Map<string, SceneStepChild>()
    target.children.forEach((spec) => specs.set(spec.id, spec))
    const children = new Map(timelines.map((child) => [child.id, child]))
    specs.forEach((spec) => {
      const live = findChild(spec.id) as StayAnimatedChild | undefined
      const child = live ?? new StayAnimatedChild({
        id: spec.id, className: spec.className, placement: spec.placement, canvas: this.canvas,
      })
      children.set(spec.id, child)
    })
    return [...children.values()].map((child) => ({
      child,
      apply: child.prepareStepAppend(specs.get(child.id)?.shapes ?? new Map(), startTimeMs, target.durationMs),
    }))
  }

  #assertStepResources(target: SceneStepSubmission, signal: AbortSignal): void {
    if (signal.aborted) throw new Error("Scene step was cancelled")
    if ((this.#resourceRevision && target.resourceRevision !== this.#resourceRevision) ||
        (this.#activeLease && !this.#activeLease.isCurrent())) {
      throw new Error("Scene step resources are stale; prepare a replacement scene")
    }
  }

  #assertCurrentStep(update: Update): void {
    this.#assertAlive()
    if (update !== this.#current || update.state !== "new") throw new Error("Scene step is stale")
  }

  renderingExits(): StayAnimatedChild[] {
    return [...(this.#handoff?.exiting.values() ?? [])]
  }

  beginUpdate(): SceneEpoch {
    this.#assertAlive()
    if (this.#current && this.#current.state !== "committed") {
      this.#finish(this.#current, "stale")
    }
    const epoch = Object.freeze({}) as SceneEpoch
    const update: Update = { generation: ++this.#generation, state: "new" }
    this.#epochs.set(epoch, update)
    this.#current = update
    return epoch
  }

  async prepare(
    epoch: SceneEpoch,
    target: SceneSubmission | SceneBatchSubmission | SceneStepSequenceSubmission,
    options: ScenePrepareOptions
  ): Promise<PreparedScene> {
    const update = this.#ownedEpoch(epoch)
    if (update !== this.#current || update.state !== "new") {
      throw new Error("Scene epoch cannot be prepared")
    }
    update.state = "preparing"
    try {
      if (options.resourceLease && this.#leaseIsLive(options.resourceLease)) {
        throw new Error("Scene resource lease already belongs to a live scene")
      }
      update.lease = options.resourceLease
      const durationMs = this.#validateOptions(target, options)
      const onAbort = () => this.#finish(update, "cancelled")
      update.abortListener = () => options.signal.removeEventListener("abort", onAbort)
      options.signal.addEventListener("abort", onAbort, { once: true })
      await Promise.resolve()
      if (options.signal.aborted) this.#finish(update, "cancelled")
      this.#assertPreparing(update)
      if ("steps" in target) await this.#prepareSteps(update, target)
      else await this.#prepareChildren(update, target)
      this.#assertPreparing(update)
      const prepared = Object.freeze({ preparationId: uuid4() }) as PreparedScene
      update.revision = target.revision
      update.resourceRevision = target.resourceRevision
      update.durationMs = durationMs
      update.prepared = prepared
      update.state = "prepared"
      this.#preparations.set(prepared, update)
      return prepared
    } catch (error) {
      if (update.state === "preparing") this.#finish(update, "failed")
      throw error
    }
  }

  sample(prepared: PreparedScene, timeMs: number): readonly SceneStepChild[] {
    const update = this.#sampleableUpdate(prepared, timeMs)
    const restoreProjections: (() => void)[] = []
    try {
      update.children!.forEach((child) => {
        restoreProjections.push(child.beginCurrentTimeProjection({ time: timeMs }))
      })
      return update.children!.map(capturePreparedChild)
    } finally {
      restoreProjections.reverse().forEach((restore) => restore())
    }
  }

  commit(prepared: PreparedScene): Promise<SceneCommitReceipt> {
    const update = this.#ownedPreparation(prepared)
    if (update.commitPromise) return update.commitPromise
    if (update !== this.#current || update.state !== "prepared") {
      return Promise.reject(new Error(`Scene preparation is ${update.state}`))
    }
    update.state = "queued"
    const promise = this.renderer.atNextFrame((frame, now) => this.#accept(update, frame, now))
    update.commitPromise = promise
    promise.catch(() => {
      if (update.state === "queued") this.#finish(update, "failed")
    })
    return promise
  }

  cancel(epoch: SceneEpoch): void {
    const update = this.#ownedEpoch(epoch)
    if (update.state === "committed" || this.#isTerminal(update.state)) return
    this.#finish(update, "cancelled")
  }

  discard(prepared: PreparedScene): void {
    const update = this.#ownedPreparation(prepared)
    if (update.state === "committed" || this.#isTerminal(update.state)) return
    this.#finish(update, "discarded")
  }

  destroy(): void {
    if (this.#destroyed) return
    this.#destroyed = true
    if (this.#current && this.#current.state !== "committed") {
      this.#finish(this.#current, "cancelled")
    }
    this.#releaseLease(this.#activeLease)
    this.#activeLease = undefined
    this.#handoff?.exitingLeases.forEach((lease) => this.#releaseLease(lease))
    this.#handoff = undefined
  }

  advance(now: number): void {
    const handoff = this.#handoff
    if (!handoff) return
    const progress = Math.max(0, Math.min(1, (now - handoff.startedAt) / handoff.durationMs))
    handoff.sources.forEach((sourceShapes, id) => {
      const exiting = handoff.exiting.get(id)
      const child = exiting ?? this.children.get(id)
      if (!(child instanceof StayAnimatedChild)) return
      if (!exiting) child.setCurrentTime(this.currentSample())
      const projected = new Map(child.shapeMap)
      sourceShapes.forEach((source, name) => {
        const target = exiting ? source._zeroShape(new Map())
          : projected.get(name) ?? source._zeroShape(new Map())
        const shape = progress === 0
          ? source
          : progress === 1
            ? target
            : target.intermediateState(source, target, progress, target.transition.type)
        shape.parent = child
        if (shape.shouldStroke() || shape.shouldFill()) projected.set(name, shape)
        else projected.delete(name)
      })
      child.shapeMap = projected
    })
    this.renderer.forceUpdateAllLayers()
    if (progress < 1) return
    this.#handoff = undefined
    handoff.exitingLeases.forEach((lease) => this.#releaseLease(lease))
  }

  #accept(update: Update, frame: number, now: number): SceneCommitReceipt {
    if (this.#destroyed || update !== this.#current || update.state !== "queued") {
      throw new Error(`Scene preparation is ${update.state}`)
    }
    try {
      const durationMs = update.durationMs!
      const next = this.#buildScene(update.children!, durationMs)
      if (update.state !== "queued" || update !== this.#current || !this.#resourcesAreCurrent(update)) {
        if (update.state === "queued") this.#finish(update, "stale")
        throw new Error("Scene preparation or resources are stale")
      }
      this.cancelPointerSession()
      if (update.state !== "queued" || update !== this.#current) {
        throw new Error(`Scene preparation is ${update.state}`)
      }
      this.children.replaceWhere((child) => child instanceof StayAnimatedChild, next.children)
      this.renderer.forceUpdateAllLayers()
      const exitingLeases = [...(this.#handoff?.exitingLeases ?? [])]
      if (this.#activeLease) exitingLeases.push(this.#activeLease)
      this.#activeLease = update.lease
      update.lease = undefined
      this.#handoff = durationMs > 0 ? {
        startedAt: now,
        durationMs,
        sources: next.sources,
        exiting: next.exiting,
        exitingLeases,
      } : undefined
      this.#revision = update.revision
      this.#resourceRevision = update.resourceRevision
      this.#timelineEndTimeMs = update.timelineEndTimeMs ??
        next.children.reduce((end, child) => Math.max(end, child.totalDurationMs), 0)
      update.state = "committed"
      this.#clearPreparation(update)
      const receipt = Object.freeze({
        preparationId: update.prepared!.preparationId,
        revision: update.revision!,
        resourceRevision: update.resourceRevision!,
        acceptedAtFrame: frame,
      })
      update.receipt = receipt
      update.children = undefined
      update.durationMs = undefined
      update.timelineEndTimeMs = undefined
      update.revision = undefined
      update.resourceRevision = undefined
      if (durationMs === 0) exitingLeases.forEach((lease) => this.#releaseLease(lease))
      return receipt
    } catch (error) {
      if (update.state === "queued") this.#finish(update, "failed")
      throw error
    }
  }

  #buildScene(prepared: StayAnimatedChild[], durationMs: number) {
    const sources = new Map<string, Map<string, AnimatedShape>>()
    const exitingChildren = new Map<string, StayAnimatedChild>()
    const nextIds = new Set(prepared.map(({ id }) => id))
    const children = prepared.map((candidate) => {
      const live = this.children.get(candidate.id) as StayAnimatedChild | undefined
      const previous = live ?? this.#handoff?.exiting.get(candidate.id)
      candidate.setCurrentTime(this.currentSample())
      if (durationMs === 0) return candidate
      const sourceShapes = this.#sourcesFor(candidate, previous)
      sources.set(candidate.id, sourceShapes)
      candidate.shapeMap = new Map(sourceShapes)
      return candidate
    })
    if (durationMs > 0) {
      const visibleChildren = [
        ...this.children.values(),
        ...this.renderingExits(),
      ]
      visibleChildren.forEach((previous) => {
        if (!(previous instanceof StayAnimatedChild) || nextIds.has(previous.id)) return
        const sourceShapes = this.#copyVisibleShapes(previous)
        if (sourceShapes.size === 0) return
        const exiting = new StayAnimatedChild({
          id: previous.id,
          className: previous.className,
          placement: previous.placement,
          canvas: this.canvas,
        })
        sourceShapes.forEach((shape) => { shape.parent = exiting })
        exiting.shapeMap = new Map(sourceShapes)
        exitingChildren.set(previous.id, exiting)
        sources.set(exiting.id, sourceShapes)
      })
    }
    return { children, sources, exiting: exitingChildren }
  }

  #sourcesFor(candidate: StayAnimatedChild, previous?: StayAnimatedChild) {
    const sources = this.#copyVisibleShapes(previous)
    candidate.shapeFramesMap.forEach((frames, name) => {
      const source = sources.get(name)
      const target = candidate.shapeMap.get(name) ?? frames[0]
      if (!source) sources.set(name, target._zeroShape(new Map()))
    })
    sources.forEach((shape) => { shape.parent = candidate })
    return sources
  }

  #copyVisibleShapes(child?: StayAnimatedChild) {
    return new Map<string, AnimatedShape>(
      [...(child?.shapeMap ?? new Map<string, AnimatedShape>())].map(
        ([name, shape]) => [name, shape.copy() as AnimatedShape]
      )
    )
  }

  async #prepareChildren(update: Update, target: SceneSubmission | SceneBatchSubmission): Promise<void> {
    update.children = []
    const batches = "batches" in target ? target.batches : [target.children]
    for await (const batch of batches) {
      this.#assertPreparing(update)
      for (const spec of batch) {
        const child = this.#prepareChild(spec)
        this.#assertPreparing(update)
        update.children!.push(child)
      }
    }
  }

  async #prepareSteps(update: Update, target: SceneStepSequenceSubmission): Promise<void> {
    const children = new Map<string, StayAnimatedChild>()
    update.children = []
    let endTimeMs = 0
    for await (const step of target.steps) {
      this.#assertPreparing(update)
      if (step.resourceRevision !== target.resourceRevision) {
        throw new Error("Replacement scene step resources are stale")
      }
      const plans = this.#prepareStep(step, [...children.values()], endTimeMs, (id) => children.get(id))
      for (const { child, apply } of plans) {
        apply({ time: 0 })
        if (!children.has(child.id)) {
          children.set(child.id, child)
          update.children!.push(child)
        }
      }
      this.#assertPreparing(update)
      endTimeMs += step.durationMs
    }
    update.timelineEndTimeMs = endTimeMs
  }

  #prepareChild(spec: SceneTimelineChild): StayAnimatedChild {
    const child = new StayAnimatedChild({
      id: spec.id,
      className: spec.className,
      placement: spec.placement,
      canvas: this.canvas,
    })
    spec.slices.forEach(({ name, frames, prependZeroShape = false }) => {
      const copies = frames.map((frame) => {
        const copy = frame.copy() as AnimatedShape
        return copy
      })
      child.replaceSlice(name, copies, prependZeroShape)
    })
    return child
  }

  #validateOptions(target: SceneSubmission | SceneBatchSubmission | SceneStepSequenceSubmission, options: ScenePrepareOptions): number {
    if (options.transitionId !== "shape") {
      throw new Error("Invalid scene transition")
    }
    const durationMs = this.#timelineDuration(options)
    if (options.resourceLease && options.resourceLease.revision !== target.resourceRevision) {
      throw new Error("Scene resource revision does not match its lease")
    }
    if (options.resourceLease && !options.resourceLease.isCurrent()) {
      throw new Error("Scene resources are stale")
    }
    return durationMs
  }

  #timelineDuration(options: ScenePrepareOptions): number {
    if (options.control.kind !== "timeline") {
      throw new Error("Time-domain scene transitions are not installed")
    }
    return options.control.durationMs
  }

  #resourcesAreCurrent(update: Update): boolean {
    if (update.generation !== this.#generation || !update.prepared) return false
    if (!update.lease) return true
    return update.lease.revision === update.resourceRevision && update.lease.isCurrent()
  }

  #sampleableUpdate(prepared: PreparedScene, timeMs: number): Update {
    const update = this.#ownedPreparation(prepared)
    if (update !== this.#current || update.state !== "prepared") {
      throw new Error(`Scene preparation is ${update.state}`)
    }
    if (!this.#resourcesAreCurrent(update)) {
      throw new Error("Scene preparation resources are stale")
    }
    const endTimeMs = update.timelineEndTimeMs ?? update.children!.reduce(
      (end, child) => Math.max(end, child.totalDurationMs),
      0
    )
    if (!Number.isFinite(timeMs) || timeMs < 0 || timeMs > endTimeMs) {
      throw new Error(`Scene sample time is outside 0..${endTimeMs}`)
    }
    return update
  }

  #leaseIsLive(lease: SceneResourceLease): boolean {
    return lease === this.#activeLease || Boolean(this.#handoff?.exitingLeases.includes(lease))
  }

  #assertPreparing(update: Update): void {
    if (this.#destroyed || update !== this.#current || update.state !== "preparing") {
      throw new Error(`Scene preparation is ${update.state}`)
    }
  }

  #finish(update: Update, state: UpdateState): void {
    update.state = state
    this.#clearPreparation(update)
    const lease = update.lease
    update.lease = undefined
    update.children = undefined
    update.revision = undefined
    update.resourceRevision = undefined
    update.durationMs = undefined
    update.timelineEndTimeMs = undefined
    this.#releaseLease(lease)
  }

  #releaseLease(lease?: SceneResourceLease): void {
    if (!lease) return
    try {
      lease.release()
    } catch (error) {
      // An accepted scene cannot be rolled back when a retired resource owner fails to release.
      console.error("Canvas scene resource release failed", error)
    }
  }

  #clearPreparation(update: Update): void {
    update.abortListener?.()
    update.abortListener = undefined
  }

  #isTerminal(state: UpdateState): boolean {
    return state === "cancelled" || state === "discarded" || state === "stale" || state === "failed"
  }

  #ownedEpoch(epoch: SceneEpoch): Update {
    const update = this.#epochs.get(epoch)
    if (!update) throw new Error("Scene epoch belongs to another Canvas or is forged")
    return update
  }

  #ownedPreparation(prepared: PreparedScene): Update {
    const update = this.#preparations.get(prepared)
    if (!update) throw new Error("Scene preparation belongs to another Canvas or is forged")
    return update
  }

  #assertAlive(): void {
    if (this.#destroyed) throw new Error("Canvas was destroyed")
  }
}

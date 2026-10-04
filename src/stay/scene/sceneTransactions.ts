import { AnimatedShape } from "../../shapes/animatedShape"
import type {
  PreparedScene,
  SceneCommitReceipt,
  SceneEpoch,
  ScenePrepareOptions,
  SceneResourceLease,
  SceneSubmission,
  SceneTimelineChild,
  SceneTransactions,
} from "../../types/scene"
import { uuid4 } from "../../utils/identifiers"
import { ChildrenStore } from "../children/childrenStore"
import { StayAnimatedChild } from "../children/stayAnimatedChild"
import type { StayChild } from "../children/stayChild"
import { Renderer } from "../renderer"
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

export class CanvasSceneTransactions implements SceneTransactions {
  #epochs = new WeakMap<object, Update>()
  #preparations = new WeakMap<object, Update>()
  #current?: Update
  #generation = 0
  #revision?: string
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
    target: SceneSubmission,
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
      const children = this.#prepareChildren(target.children)
      this.#assertPreparing(update)
      const prepared = Object.freeze({ preparationId: uuid4() }) as PreparedScene
      update.revision = target.revision
      update.resourceRevision = target.resourceRevision
      update.durationMs = durationMs
      update.children = children
      update.prepared = prepared
      update.state = "prepared"
      this.#preparations.set(prepared, update)
      return prepared
    } catch (error) {
      if (update.state === "preparing") this.#finish(update, "failed")
      throw error
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
      const live = this.children.get(candidate.id)
      if (live && !(live instanceof StayAnimatedChild)) {
        throw new Error(`Child id ${candidate.id} belongs to a non-timeline Child`)
      }
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
      if (source && source.constructor !== target.constructor) {
        throw new Error(`Scene shape ${candidate.id}/${name} changed type`)
      }
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

  #prepareChildren(specs: readonly SceneTimelineChild[]): StayAnimatedChild[] {
    const ids = new Set<string>()
    return specs.map((spec) => {
      if (!spec.id || ids.has(spec.id)) throw new Error(`Duplicate or empty scene Child id ${spec.id}`)
      ids.add(spec.id)
      const child = new StayAnimatedChild({
        id: spec.id,
        className: spec.className,
        placement: spec.placement,
        canvas: this.canvas,
      })
      const names = new Set<string>()
      spec.slices.forEach(({ name, frames, prependZeroShape = false }) => {
        if (!name || names.has(name) || frames.length === 0) {
          throw new Error(`Invalid scene slice ${spec.id}/${name}`)
        }
        names.add(name)
        const copies = frames.map((frame, index) => {
          if (!(frame instanceof AnimatedShape)) throw new Error("Scene frame must be an AnimatedShape")
          if (frame.constructor !== frames[0].constructor) {
            throw new Error(`Scene slice ${spec.id}/${name} changes Shape type`)
          }
          const copy = frame.copy() as AnimatedShape
          if (index === 0 && !prependZeroShape &&
              copy.transition.delayMs + copy.transition.durationMs > 0) {
            throw new Error(`Scene slice ${spec.id}/${name} needs a zero Shape before a delayed first frame`)
          }
          return copy
        })
        child.replaceSlice(name, copies, prependZeroShape)
      })
      return child
    })
  }

  #validateOptions(target: SceneSubmission, options: ScenePrepareOptions): number {
    if (!target.revision || !target.resourceRevision || options.transitionId !== "shape") {
      throw new Error("Invalid scene revision or transition")
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
    const duration = options.control.durationMs
    if (!Number.isFinite(duration) || duration < 0) {
      throw new Error("Invalid scene transition duration")
    }
    return duration
  }

  #resourcesAreCurrent(update: Update): boolean {
    if (update.generation !== this.#generation || !update.prepared) return false
    if (!update.lease) return true
    return update.lease.revision === update.resourceRevision && update.lease.isCurrent()
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

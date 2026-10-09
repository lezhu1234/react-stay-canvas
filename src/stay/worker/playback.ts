import type { ProgressProps } from "../../types/animation"
import type { CanvasWorkerOrigin, CanvasWorkerState } from "../../types/worker"
import type Stay from "../stay"

type PlaybackInterval = {
  startTimeMs: number
  targetTimeMs: number
  startedAt: number
  speed: number
  bound?: ProgressProps["bound"]
}

export class WorkerPlayback {
  #interval?: PlaybackInterval

  constructor(
    private readonly stay: Stay<string, unknown, CanvasWorkerOrigin>,
    private readonly publish: (state: CanvasWorkerState) => void
  ) {}

  state(): CanvasWorkerState {
    return {
      timeMs: this.stay.currentSample.time,
      playing: this.#interval !== undefined,
      viewport: this.stay.tools.viewport.get(),
      revision: this.stay.sceneTransactions.revision,
    }
  }

  seek(props: Pick<ProgressProps, "timeMs" | "bound">) {
    this.sample(props)
    return this.state()
  }

  sample(props: Pick<ProgressProps, "timeMs" | "bound">) {
    this.reset()
    const drawn = this.stay.tools.progress(props)
    this.#publish()
    return drawn
  }

  play({ toTimeMs, speed = 1, bound }: { toTimeMs: number; speed?: number; bound?: ProgressProps["bound"] }) {
    if (!Number.isFinite(toTimeMs) || !Number.isFinite(speed) || speed <= 0) {
      throw new RangeError("Playback requires a finite target and a positive speed")
    }
    this.#interval = toTimeMs === this.stay.currentSample.time ? undefined : {
      startTimeMs: this.stay.currentSample.time,
      targetTimeMs: toTimeMs,
      startedAt: performance.now(),
      speed,
      bound,
    }
    return this.#publish()
  }

  pause() {
    this.reset()
    return this.#publish()
  }

  reset(): void {
    this.#interval = undefined
  }

  advance() {
    const interval = this.#interval
    if (!interval) return
    // A frame timestamp can predate the message task that started playback.
    // Read the same monotonic clock here so elapsed time keeps that ordering.
    const now = performance.now()
    const distance = interval.targetTimeMs - interval.startTimeMs
    const travelled = Math.min(Math.abs(distance), (now - interval.startedAt) * interval.speed)
    const time = interval.startTimeMs + Math.sign(distance) * travelled
    this.stay.setCurrentSample({ time, bound: interval.bound })
    this.stay.forceUpdateAllLayers()
    if (travelled === Math.abs(distance)) this.#interval = undefined
    this.#publish()
  }

  #publish() {
    const state = this.state()
    this.publish(state)
    return state
  }
}

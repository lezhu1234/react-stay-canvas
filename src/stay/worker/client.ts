import type { CanvasSurfaceMetrics } from "../../types/canvas"
import type { PointerSessionCancelReason } from "../../types/events"
import type {
  CanvasWorkerCaptureOptions,
  CanvasWorkerHandle,
  CanvasWorkerState,
  CanvasWorkerViewportCommand,
} from "../../types/worker"
import type { ViewportOptions, ViewportState } from "../../types/tools"
import { DomInputAdapter } from "../events/input/domInputAdapter"
import { forwardCanvasInput } from "../events/input/forwardedInput"
import { PressedInputState } from "../events/input/pressedInputState"
import type { CanvasWorkerRequest, CanvasWorkerResponse } from "./protocol"

type PendingCanvasWorkerRequest<Input> = Extract<
  CanvasWorkerRequest<Input>,
  { id: number }
>

interface PendingRequest {
  resolve(value: unknown): void
  reject(error: unknown): void
}

export interface CanvasWorkerClientOptions<Notice> {
  readonly worker: Worker
  readonly layers: HTMLCanvasElement[]
  readonly offscreenLayers: OffscreenCanvas[]
  readonly metrics: () => CanvasSurfaceMetrics
  readonly viewport?: ViewportOptions
  readonly passive: boolean
  readonly onInput?: (event: Event) => void
  readonly onNotice?: (notice: Notice) => void
  readonly onState?: (state: CanvasWorkerState) => void
  readonly onError?: (error: Error) => void
}

function abortError() {
  const error = new Error("Canvas worker run was cancelled")
  error.name = "AbortError"
  return error
}

function responseError(
  description: Extract<CanvasWorkerResponse, { type: "error" }>["error"]
) {
  const error = new Error(description.message)
  error.name = description.name
  if (description.stack) error.stack = description.stack
  return error
}

function workerEventError(event: ErrorEvent | MessageEvent) {
  if ("error" in event && event.error instanceof Error) return event.error
  const message = "message" in event && event.message
    ? event.message
    : "Canvas worker message could not be delivered"
  return new Error(message)
}

export class CanvasWorkerClient<Input, Notice> implements CanvasWorkerHandle<Input> {
  readonly ready: Promise<void>

  readonly #worker: Worker
  readonly #layers: HTMLCanvasElement[]
  readonly #metrics: () => CanvasSurfaceMetrics
  readonly #onInput?: (event: Event) => void
  readonly #onNotice?: (notice: Notice) => void
  readonly #onState?: (state: CanvasWorkerState) => void
  readonly #onError?: (error: Error) => void
  readonly #pending = new Map<number, PendingRequest>()
  #inputAdapter?: DomInputAdapter
  #nextRequestId = 1
  #currentRunId?: number
  #destroying = false
  #destroyed = false
  #destroyPromise?: Promise<void>

  constructor(options: CanvasWorkerClientOptions<Notice>) {
    if (options.layers.length < 1) {
      throw new Error("Canvas worker must have at least one layer")
    }
    if (options.offscreenLayers.length !== options.layers.length) {
      throw new Error("Canvas worker DOM and OffscreenCanvas layer counts must match")
    }

    this.#worker = options.worker
    this.#layers = [...options.layers]
    this.#metrics = options.metrics
    this.#onInput = options.onInput
    this.#onNotice = options.onNotice
    this.#onState = options.onState
    this.#onError = options.onError
    this.#worker.addEventListener("message", this.#handleMessage)
    this.#worker.addEventListener("error", this.#handleWorkerFailure)
    this.#worker.addEventListener("messageerror", this.#handleWorkerFailure)

    const topLayer = this.#layers[this.#layers.length - 1]
    this.#inputAdapter = new DomInputAdapter(
      topLayer,
      options.passive,
      new PressedInputState(),
      (input) => {
        if (this.#destroying || this.#destroyed) return
        this.#onInput?.(input.originEvent)
        this.#notify({
          type: "input",
          input: forwardCanvasInput(input),
          metrics: this.#metrics(),
        })
      }
    )

    const initId = this.#takeRequestId()
    this.ready = this.#request<void>({
      type: "init",
      id: initId,
      layers: options.offscreenLayers,
      metrics: this.#metrics(),
      viewport: options.viewport,
    }, options.offscreenLayers as Transferable[]).catch((error) => {
      const normalized = error instanceof Error ? error : new Error(String(error))
      if (!this.#destroyed) {
        this.#onError?.(normalized)
        this.#finalize(normalized)
      }
      throw normalized
    })
    this.#inputAdapter.bind()
  }

  async run(
    input: Input,
    options: { signal?: AbortSignal; transfer?: Transferable[] } = {}
  ) {
    await this.ready
    this.#assertActive()
    if (options.signal?.aborted) throw abortError()

    const id = this.#takeRequestId()
    this.#currentRunId = id
    const cancel = () => this.#cancelRun(id)
    options.signal?.addEventListener("abort", cancel, { once: true })
    const result = this.#request<void>(
      { type: "run", id, input },
      options.transfer
    )
    if (options.signal?.aborted) cancel()

    try {
      await result
    } finally {
      options.signal?.removeEventListener("abort", cancel)
      if (this.#currentRunId === id) this.#currentRunId = undefined
    }
  }

  cancel() {
    if (this.#currentRunId !== undefined) this.#cancelRun(this.#currentRunId)
  }

  async trigger(name: string, payload: Record<string, unknown> = {}): Promise<void> {
    await this.ready
    return this.#request<void>({ type: "trigger", id: this.#takeRequestId(), name, payload })
  }

  async seek(
    props: Parameters<CanvasWorkerHandle<Input>["seek"]>[0]
  ): Promise<CanvasWorkerState> {
    await this.ready
    return this.#request<CanvasWorkerState>({
      type: "seek",
      id: this.#takeRequestId(),
      props,
    })
  }

  async play(
    options: Parameters<CanvasWorkerHandle<Input>["play"]>[0]
  ): Promise<CanvasWorkerState> {
    await this.ready
    return this.#request<CanvasWorkerState>({
      type: "play",
      id: this.#takeRequestId(),
      options,
    })
  }

  async pause(): Promise<CanvasWorkerState> {
    await this.ready
    return this.#request<CanvasWorkerState>({
      type: "pause",
      id: this.#takeRequestId(),
    })
  }

  async viewport(
    command: CanvasWorkerViewportCommand
  ): Promise<Readonly<ViewportState>> {
    await this.ready
    return this.#request<Readonly<ViewportState>>({
      type: "viewport",
      id: this.#takeRequestId(),
      command,
    })
  }

  async capture(options: CanvasWorkerCaptureOptions): Promise<Blob> {
    await this.ready
    return this.#request<Blob>({
      type: "capture",
      id: this.#takeRequestId(),
      options,
    })
  }

  notifySurface(metrics = this.#metrics()) {
    if (this.#destroying || this.#destroyed) return
    this.#notify({ type: "surface", metrics })
  }

  cancelPointerSession(reason: PointerSessionCancelReason) {
    if (this.#destroying || this.#destroyed) return
    this.#inputAdapter?.cancelPointerSession(reason)
  }

  destroy(): Promise<void> {
    if (this.#destroyPromise) return this.#destroyPromise
    if (this.#destroyed) return Promise.resolve()

    this.#destroying = true
    const request = this.#request<void>({
      type: "dispose",
      id: this.#takeRequestId(),
    }, undefined, true)
    this.#destroyPromise = request.finally(() => {
      this.#finalize(new Error("Canvas worker was destroyed"))
    })
    return this.#destroyPromise
  }

  #takeRequestId() {
    return this.#nextRequestId++
  }

  #assertActive() {
    if (this.#destroying || this.#destroyed) {
      throw new Error("Canvas worker was destroyed")
    }
  }

  #request<Value>(
    request: PendingCanvasWorkerRequest<Input>,
    transfer?: Transferable[],
    allowDestroy = false
  ): Promise<Value> {
    if (!allowDestroy) this.#assertActive()
    return new Promise<Value>((resolve, reject) => {
      this.#pending.set(request.id, {
        resolve: (value) => resolve(value as Value),
        reject,
      })
      try {
        this.#worker.postMessage(request, transfer ?? [])
      } catch (error) {
        this.#pending.delete(request.id)
        reject(error)
      }
    })
  }

  #notify(request: CanvasWorkerRequest<Input>) {
    try {
      this.#worker.postMessage(request)
    } catch (error) {
      this.#onError?.(error instanceof Error ? error : new Error(String(error)))
    }
  }

  #cancelRun(id: number) {
    const pending = this.#pending.get(id)
    if (!pending) return
    this.#notify({ type: "cancel", id })
    this.#pending.delete(id)
    pending.reject(abortError())
    if (this.#currentRunId === id) this.#currentRunId = undefined
  }

  #handleMessage = (event: MessageEvent<CanvasWorkerResponse<Notice>>) => {
    const response = event.data
    switch (response.type) {
      case "result": {
        const pending = this.#pending.get(response.id)
        if (!pending) return
        this.#pending.delete(response.id)
        pending.resolve(response.value)
        return
      }
      case "error": {
        const error = responseError(response.error)
        if (response.id === undefined) {
          this.#onError?.(error)
          return
        }
        const pending = this.#pending.get(response.id)
        if (!pending) return
        this.#pending.delete(response.id)
        pending.reject(error)
        return
      }
      case "notice":
        if (this.#destroying || this.#destroyed) return
        this.#onNotice?.(response.notice)
        return
      case "state":
        if (this.#destroying || this.#destroyed) return
        this.#onState?.(response.state)
        return
      case "cursor":
        if (this.#destroying || this.#destroyed) return
        this.#layers[this.#layers.length - 1].style.cursor = response.cursor
        return
      case "cancel-pointer":
        if (this.#destroying || this.#destroyed) return
        this.cancelPointerSession(response.reason)
        return
    }
  }

  #handleWorkerFailure = (event: ErrorEvent | MessageEvent) => {
    if (this.#destroyed) return
    const error = workerEventError(event)
    this.#onError?.(error)
    this.#finalize(error)
  }

  #finalize(error: Error) {
    if (this.#destroyed) return
    this.#destroying = true
    this.#destroyed = true
    this.#inputAdapter?.destroy()
    this.#inputAdapter = undefined
    this.#worker.removeEventListener("message", this.#handleMessage)
    this.#worker.removeEventListener("error", this.#handleWorkerFailure)
    this.#worker.removeEventListener("messageerror", this.#handleWorkerFailure)
    this.#pending.forEach(({ reject }) => reject(error))
    this.#pending.clear()
    this.#worker.terminate()
    this.#layers.length = 0
  }
}

export function createCanvasWorkerClient<Input, Notice>(
  options: CanvasWorkerClientOptions<Notice>
): CanvasWorkerClient<Input, Notice> {
  return new CanvasWorkerClient<Input, Notice>(options)
}

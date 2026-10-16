import Canvas from "../../canvas"
import * as PredefinedEventList from "../../predefinedEvents"
import type { ViewportState } from "../../types/tools"
import type {
  CanvasRuntimeTools,
  CanvasWorkerEventProps,
  CanvasWorkerInstallation,
  CanvasWorkerOrigin,
  CanvasWorkerState,
  CanvasWorkerViewportCommand,
} from "../../types/worker"
import { receiveCanvasInput } from "../events/input/forwardedInput"
import { renderRegionToSurface } from "../rendering/regionCapture"
import Stay from "../stay"
import { WorkerInputDispatcher } from "./inputDispatcher"
import { WorkerPlayback } from "./playback"
import {
  describeWorkerError,
  type CanvasWorkerRequest,
  type CanvasWorkerResponse,
} from "./protocol"
import { WorkerTaskYield } from "./taskYield"

export interface CanvasWorkerScope<Input, Notice> {
  addEventListener(type: "message", listener: (event: MessageEvent<CanvasWorkerRequest<Input>>) => void): void
  removeEventListener(type: "message", listener: (event: MessageEvent<CanvasWorkerRequest<Input>>) => void): void
  postMessage(message: CanvasWorkerResponse<Notice>): void
  close(): void
}

type ActiveRun = { id: number; controller: AbortController; completion: Promise<void> }
type WorkerStay = Stay<string, unknown, CanvasWorkerOrigin>

/** The library owns the native runtime and task lifecycle; input remains opaque. */
export class CanvasWorkerRuntime<Input, Notice> {
  #stay?: WorkerStay
  #canvas?: CanvasRuntimeTools
  #input?: WorkerInputDispatcher
  #playback?: WorkerPlayback
  #activeRun?: ActiveRun
  #latestRunId?: number
  #setupCleanup?: () => void
  #closed = false
  readonly #taskYield = new WorkerTaskYield()

  constructor(
    private readonly installation: CanvasWorkerInstallation<Input, Notice>,
    private readonly scope: CanvasWorkerScope<Input, Notice>
  ) {
    scope.addEventListener("message", this.#receive)
  }

  readonly #receive = (event: MessageEvent<CanvasWorkerRequest<Input>>) => {
    const request = event.data
    this.#handle(request).then((value) => {
      if ("id" in request && request.type !== "cancel") {
        this.scope.postMessage({ type: "result", id: request.id, value })
      }
      if (request.type === "dispose") this.scope.close()
    }).catch((error) => {
      this.scope.postMessage({ type: "error", id: "id" in request ? request.id : undefined,
        error: describeWorkerError(error) })
      if (request.type === "dispose") this.scope.close()
    })
  }

  async #handle(request: CanvasWorkerRequest<Input>) {
    if (this.#closed) throw new Error("Canvas was destroyed")
    if (request.type === "init") return this.#initialize(request)
    if (request.type === "run") return this.#run(request.id, request.input)
    if (request.type === "cancel") {
      if (this.#activeRun?.id === request.id) this.#activeRun.controller.abort()
      if (this.#latestRunId === request.id) this.#latestRunId = undefined
      return
    }
    if (request.type === "dispose") return this.#dispose()

    const stay = this.#requireStay()
    switch (request.type) {
      case "trigger":
        stay.tools.triggerAction({ type: request.name, bubbles: false, cancelable: false,
          defaultPrevented: false }, { [request.name]: { info: {} } }, request.payload)
        return
      case "input":
        stay.root.updateSurfaceMetrics(request.metrics)
        stay.width = stay.root.width
        stay.height = stay.root.height
        this.#input!.handleInput(receiveCanvasInput(request.input))
        return
      case "surface":
        stay.root.resizeFromSurfaceMetrics(request.metrics)
        stay.width = stay.root.width
        stay.height = stay.root.height
        stay.forceUpdateAllLayers()
        return
      case "seek": return this.#playback!.seek(request.props)
      case "play": return this.#playback!.play(request.options)
      case "pause": return this.#playback!.pause()
      case "viewport": {
        const viewport = this.#changeViewport(request.command)
        this.#publishState(this.#playback!.state())
        return viewport
      }
      case "capture": {
        const selectedIds = request.options.childIds && new Set(request.options.childIds)
        const children = stay.getShapeChildren().filter((child) =>
          child.id !== stay.rootId && (!selectedIds || selectedIds.has(child.id)))
        return this.#canvas!.captureRegion({
          area: request.options.area,
          targetSize: request.options.targetSize,
          progress: request.options.timeMs,
          children,
        })
      }
    }
  }

  #initialize(request: Extract<CanvasWorkerRequest<Input>, { type: "init" }>) {
    if (this.#stay) throw new Error("Canvas is already initialized")
    const configs = this.installation.layers
      ? [...this.installation.layers]
      : request.layers.map(() => ({ backend: "canvas2d" as const }))
    const canvas = Canvas.createOffscreen(request.layers, configs, request.metrics, {
      setCursor: (cursor) => this.scope.postMessage({ type: "cursor", cursor }),
    })
    try {
      const stay = new Stay<string, unknown, CanvasWorkerOrigin>(
        canvas, true, request.viewport, undefined, {
          createInputDispatcher: (_root, _passive, runtime) => {
            this.#input = new WorkerInputDispatcher(runtime, (reason) =>
              this.scope.postMessage({ type: "cancel-pointer", reason }))
            return this.#input
          },
          beforeFrame: () => this.#playback?.advance(),
          resetPlayback: () => this.#playback?.reset(),
        }
      )
      this.#stay = stay
      this.#canvas = this.#createTools(stay)
      this.#playback = new WorkerPlayback(stay, (state) => this.#publishState(state))
      // Built-ins consume normalized actions, not the DOM origin event.
      Object.values(PredefinedEventList).forEach((definition) =>
        stay.registerEvent(definition as CanvasWorkerEventProps))
      this.#setupCleanup = this.installation.setup?.({
        canvas: this.#canvas,
        emit: this.#emit,
        yield: () => this.#taskYield.next(),
      }) || undefined
      this.#publishState(this.#playback.state())
    } catch (error) {
      this.#stay?.destroy()
      if (!this.#stay) canvas.destroy()
      this.#stay = undefined
      this.#canvas = undefined
      this.#playback = undefined
      throw error
    }
  }

  #createTools(stay: WorkerStay): CanvasRuntimeTools {
    const { regionToTargetCanvas: _domCapture, progress: _progress, ...nativeTools } = stay.tools
    const tools: CanvasRuntimeTools = {
      ...nativeTools,
      progress: (props) => this.#playback!.sample(props),
      captureRegion: async (props) => {
        const surface = renderRegionToSurface(new OffscreenCanvas(1, 1), props, {
          width: stay.width, height: stay.height, layerCount: stay.root.layerCount,
        })
        return surface.convertToBlob({ type: "image/png" })
      },
      getSurfaceMetrics: () => stay.root.getSurfaceMetrics(),
      registerEvent: (definition) => stay.registerEvent(definition),
      addEventListener: (listener) => stay.addEventListener({
        ...listener,
        callback: ({ canvas: _domCanvas, tools: _nativeTools, ...props }) =>
          listener.callback({ ...props, tools }),
      }),
      clearEventListeners: () => stay.clearEventListeners(),
      clearEvents: () => stay.clearEvents(),
    }
    return tools
  }

  async #run(id: number, input: Input) {
    this.#requireStay()
    this.#latestRunId = id
    const previous = this.#activeRun
    previous?.controller.abort()
    if (previous) await previous.completion.catch(() => {})
    if (this.#closed || this.#latestRunId !== id) throw new DOMException("Canvas task was superseded", "AbortError")

    const controller = new AbortController()
    const completion = Promise.resolve().then(() => this.installation.run(input, {
      signal: controller.signal,
      canvas: this.#canvas!,
      emit: (notice) => { if (!controller.signal.aborted) this.#emit(notice) },
      yield: async () => {
        controller.signal.throwIfAborted()
        await this.#taskYield.next()
        controller.signal.throwIfAborted()
      },
    }))
    const active: ActiveRun = { id, controller, completion }
    this.#activeRun = active
    try {
      await completion
      controller.signal.throwIfAborted()
    } catch (error) {
      controller.signal.throwIfAborted()
      throw error
    } finally {
      if (this.#activeRun === active) this.#activeRun = undefined
    }
  }

  #changeViewport(command: CanvasWorkerViewportCommand): Readonly<ViewportState> {
    const viewport = this.#requireStay().tools.viewport
    switch (command.kind) {
      case "get": return viewport.get()
      case "panBy": return viewport.panBy(command.movement)
      case "zoomBy": return viewport.zoomBy(command.factor,
        command.viewAnchor ? this.#requireStay().tools.coordinates.viewToContent(command.viewAnchor) : command.anchor)
      case "fit": return viewport.fit(command.bounds, { padding: command.padding })
      case "restore": return viewport.restore(command.state)
      case "reset": return viewport.reset()
    }
  }

  #publishState(state: CanvasWorkerState) {
    if (this.#closed) return
    this.scope.postMessage({ type: "state", state })
    this.installation.onState?.(state, { canvas: this.#canvas!, emit: this.#emit })
  }

  readonly #emit = (notice: Notice) => {
    if (!this.#closed) this.scope.postMessage({ type: "notice", notice })
  }

  #requireStay() {
    if (!this.#stay) throw new Error("Canvas is not initialized")
    return this.#stay
  }

  #dispose() {
    this.#closed = true
    this.scope.removeEventListener("message", this.#receive)
    this.#activeRun?.controller.abort()
    this.#latestRunId = undefined
    try {
      this.#setupCleanup?.()
    } finally {
      try {
        this.#stay?.destroy()
      } finally {
        this.#taskYield.close()
        this.#stay = undefined
        this.#canvas = undefined
        this.#playback = undefined
        this.#input = undefined
        this.#setupCleanup = undefined
        this.#activeRun = undefined
      }
    }
  }
}

export function installCanvasWorker<Input, Notice>(installation: CanvasWorkerInstallation<Input, Notice>) {
  new CanvasWorkerRuntime(installation, globalThis as unknown as CanvasWorkerScope<Input, Notice>)
}

import type React from "react"
import type { ForwardedCanvasInput } from "../stay/events/input/forwardedInput"
import type { ProgressProps } from "./animation"
import type { CanvasSurfaceMetrics, OffscreenCanvasLayerConfig } from "./canvas"
import type { RegionToTargetCanvasProps } from "./children"
import type { EventProps, ListenerProps, ListenerNamePayloadPair } from "./events"
import type { Area, Size } from "./geometry"
import type { DrawReturn, StayTools, ViewportOptions, ViewportState } from "./tools"

export type CanvasWorkerOrigin = ForwardedCanvasInput["event"]
export type CanvasWorkerEventProps = EventProps<string, never, never, CanvasWorkerOrigin>
type NativeWorkerListener = ListenerProps<
  ListenerNamePayloadPair, string, Record<string, any>, never, never, CanvasWorkerOrigin
>

export type CanvasWorkerListenerProps = Omit<NativeWorkerListener, "callback"> & {
  callback: (props: Omit<Parameters<NativeWorkerListener["callback"]>[0], "canvas" | "tools"> & {
    tools: CanvasRuntimeTools
  }) => ReturnType<NativeWorkerListener["callback"]>
}

export type CanvasRuntimeTools = Omit<
  StayTools<CanvasWorkerOrigin>, "regionToTargetCanvas" | "progress"
> & {
  progress(props: Pick<ProgressProps, "timeMs" | "bound">): DrawReturn
  captureRegion(props: RegionToTargetCanvasProps): Promise<Blob>
  getSurfaceMetrics(): CanvasSurfaceMetrics
  registerEvent(definition: CanvasWorkerEventProps): void
  addEventListener(listener: CanvasWorkerListenerProps): void
  clearEventListeners(): void
  clearEvents(): void
}

export interface CanvasWorkerContext<Notice> {
  readonly signal: AbortSignal
  readonly canvas: CanvasRuntimeTools
  emit(notice: Notice): void
  /** Yields a task turn without waiting for a display frame or a timer delay. */
  yield(): Promise<void>
}

export type CanvasWorkerProgram<Input, Notice> = (
  input: Input,
  context: CanvasWorkerContext<Notice>
) => Promise<void>

export interface CanvasWorkerState {
  readonly timeMs: number
  readonly playing: boolean
  readonly viewport: Readonly<ViewportState>
  readonly revision: string | undefined
}

export interface CanvasWorkerInstallation<Input, Notice> {
  readonly run: CanvasWorkerProgram<Input, Notice>
  /** Context resolvers, cameras and callbacks stay local to this worker. */
  readonly layers?: readonly OffscreenCanvasLayerConfig[]
  readonly setup?: (context: {
    readonly canvas: CanvasRuntimeTools
    emit(notice: Notice): void
  }) => void | (() => void)
  readonly onState?: (state: CanvasWorkerState, context: {
    readonly canvas: CanvasRuntimeTools
    emit(notice: Notice): void
  }) => void
}

export type CanvasWorkerViewportCommand =
  | { kind: "get" }
  | { kind: "panBy"; movement: Parameters<StayTools["viewport"]["panBy"]>[0] }
  | { kind: "zoomBy"; factor: number; anchor?: Parameters<StayTools["viewport"]["zoomBy"]>[1]; viewAnchor?: Parameters<StayTools["coordinates"]["viewToContent"]>[0] }
  | { kind: "fit"; bounds: Parameters<StayTools["viewport"]["fit"]>[0]; padding?: number }
  | { kind: "restore"; state: ViewportState }
  | { kind: "reset" }

export interface CanvasWorkerCaptureOptions {
  readonly area: Area
  readonly targetSize?: Size
  readonly timeMs?: number
  readonly childIds?: readonly string[]
}

export interface CanvasWorkerHandle<Input> {
  readonly ready: Promise<void>
  run(input: Input, options?: { signal?: AbortSignal; transfer?: Transferable[] }): Promise<void>
  cancel(): void
  /** Dispatches the same manually registered action as a main-thread Canvas. */
  trigger(name: string, payload?: Record<string, unknown>): Promise<void>
  seek(props: Pick<ProgressProps, "timeMs" | "bound">): Promise<CanvasWorkerState>
  play(options: { toTimeMs: number; speed?: number; bound?: ProgressProps["bound"] }): Promise<CanvasWorkerState>
  pause(): Promise<CanvasWorkerState>
  viewport(command: CanvasWorkerViewportCommand): Promise<Readonly<ViewportState>>
  capture(options: CanvasWorkerCaptureOptions): Promise<Blob>
  destroy(): Promise<void>
}

export interface WorkerStayCanvasProps<Input, Notice> {
  readonly runtime: { readonly mode: "worker"; readonly createWorker: () => Worker }
  readonly width?: number
  readonly height?: number
  readonly layers?: number
  readonly className?: string
  readonly passive?: boolean
  readonly focusOnInit?: boolean
  readonly viewport?: ViewportOptions
  readonly mounted?: (handle: CanvasWorkerHandle<Input>) => void
  readonly onNotice?: (notice: Notice) => void
  readonly onState?: (state: CanvasWorkerState) => void
  readonly onError?: (error: Error) => void
  /** Runs on the DOM owner before its normalized input is forwarded. */
  readonly onInput?: (event: Event) => void
}

export interface WorkerStayCanvasRef {
  focus(): void
}

export type WorkerStayCanvasComponent = <Input, Notice>(
  props: WorkerStayCanvasProps<Input, Notice> & React.RefAttributes<WorkerStayCanvasRef>
) => React.ReactElement | null

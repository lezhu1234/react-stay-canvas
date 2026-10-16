import type { CanvasSurfaceMetrics } from "../../types/canvas"
import type { ProgressProps } from "../../types/animation"
import type { PointerSessionCancelReason } from "../../types/events"
import type { ViewportOptions, ViewportState } from "../../types/tools"
import type {
  CanvasWorkerCaptureOptions, CanvasWorkerState, CanvasWorkerViewportCommand,
} from "../../types/worker"
import type { ForwardedCanvasInput } from "../events/input/forwardedInput"

export type CanvasWorkerRequest<Input = unknown> =
  | { type: "init"; id: number; layers: OffscreenCanvas[]; metrics: CanvasSurfaceMetrics; viewport?: ViewportOptions }
  | { type: "run"; id: number; input: Input }
  | { type: "cancel"; id: number }
  | { type: "trigger"; id: number; name: string; payload: Record<string, unknown> }
  | { type: "input"; input: ForwardedCanvasInput; metrics: CanvasSurfaceMetrics }
  | { type: "surface"; metrics: CanvasSurfaceMetrics }
  | { type: "seek"; id: number; props: Pick<ProgressProps, "timeMs" | "bound"> }
  | { type: "play"; id: number; options: { toTimeMs: number; speed?: number; bound?: ProgressProps["bound"] } }
  | { type: "pause"; id: number }
  | { type: "viewport"; id: number; command: CanvasWorkerViewportCommand }
  | { type: "capture"; id: number; options: CanvasWorkerCaptureOptions }
  | { type: "dispose"; id: number }

export type CanvasWorkerResponse<Notice = unknown> =
  | { type: "result"; id: number; value?: void | CanvasWorkerState | Readonly<ViewportState> | Blob }
  | { type: "error"; id?: number; error: { name: string; message: string; stack?: string } }
  | { type: "notice"; notice: Notice }
  | { type: "state"; state: CanvasWorkerState }
  | { type: "cursor"; cursor: string }
  | { type: "cancel-pointer"; reason: PointerSessionCancelReason }

export function describeWorkerError(error: unknown) {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { name: "Error", message: String(error) }
}

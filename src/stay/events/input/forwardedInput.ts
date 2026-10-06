import type { EventInput } from "../contracts"

export type CanvasInputSource = {
  readonly kind: "pointer" | "keyboard" | "wheel" | "other"
  readonly key?: string
  readonly clientX?: number
  readonly clientY?: number
  readonly deltaX?: number
  readonly deltaY?: number
  readonly deltaZ?: number
}

export function inputSourceOf(event: unknown): CanvasInputSource {
  if (typeof event !== "object" || event === null) return { kind: "other" }
  const source = event as Record<string, unknown>
  if (
    typeof source.deltaX === "number" &&
    typeof source.deltaY === "number" &&
    typeof source.deltaZ === "number"
  ) {
    return {
      kind: "wheel",
      clientX: typeof source.clientX === "number" ? source.clientX : undefined,
      clientY: typeof source.clientY === "number" ? source.clientY : undefined,
      deltaX: source.deltaX,
      deltaY: source.deltaY,
      deltaZ: source.deltaZ,
    }
  }
  if (typeof source.clientX === "number" && typeof source.clientY === "number") {
    return { kind: "pointer", clientX: source.clientX, clientY: source.clientY }
  }
  if (typeof source.key === "string") return { kind: "keyboard", key: source.key }
  return { kind: "other" }
}

export type ForwardedCanvasEvent = Readonly<{
  type: string
  bubbles: boolean
  cancelable: boolean
  defaultPrevented: boolean
}>

export type ForwardedCanvasInput = Omit<
  EventInput<Event>,
  "originEvent" | "pressedKeys"
> & {
  readonly event: ForwardedCanvasEvent
  readonly pressedKeys: readonly string[]
  readonly source: CanvasInputSource
}

export function forwardCanvasInput(input: EventInput<Event>): ForwardedCanvasInput {
  const { originEvent, pressedKeys, ...details } = input
  return {
    ...details,
    event: { type: originEvent.type, bubbles: originEvent.bubbles,
      cancelable: originEvent.cancelable, defaultPrevented: originEvent.defaultPrevented },
    pressedKeys: [...pressedKeys],
    source: input.source ?? inputSourceOf(originEvent),
  }
}

export function receiveCanvasInput(
  input: ForwardedCanvasInput
): EventInput<ForwardedCanvasInput["event"]> {
  const { event, pressedKeys, ...details } = input
  return { ...details, originEvent: event, pressedKeys: new Set(pressedKeys) }
}

// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"

import { createCanvasWorkerClient } from "../src/stay/worker/client"
import type { CanvasSurfaceMetrics } from "../src/types/canvas"
import type { CanvasWorkerResponse } from "../src/stay/worker/protocol"

class RecordingWorker extends EventTarget {
  readonly messages: Array<{ message: any; transfer: readonly Transferable[] }> = []
  readonly terminate = vi.fn()

  postMessage(message: any, transfer: readonly Transferable[] = []) {
    this.messages.push({ message, transfer })
  }

  respond(response: CanvasWorkerResponse<string>) {
    this.dispatchEvent(new MessageEvent("message", { data: response }))
  }

  fail(error: Error) {
    this.dispatchEvent(new ErrorEvent("error", {
      error,
      message: error.message,
    }))
  }
}

const surfaceMetrics = (): CanvasSurfaceMetrics => ({
  logicalWidth: 320,
  logicalHeight: 180,
  backingWidth: 640,
  backingHeight: 360,
  clientRect: { left: 40, top: 20, width: 320, height: 180 },
})

function createClient() {
  const worker = new RecordingWorker()
  const layer = document.createElement("canvas")
  const layers = [layer]
  const offscreen = { width: 640, height: 360 } as OffscreenCanvas
  const onInput = vi.fn((event: Event) => {
    expect(event).toBeInstanceOf(MouseEvent)
    expect(worker.messages.some(({ message }) => message.type === "input")).toBe(false)
    event.preventDefault()
  })
  const onNotice = vi.fn()
  const onState = vi.fn()
  const onError = vi.fn()
  const client = createCanvasWorkerClient<{ revision: string }, string>({
    worker: worker as unknown as Worker,
    layers,
    offscreenLayers: [offscreen],
    metrics: surfaceMetrics,
    passive: false,
    onInput,
    onNotice,
    onState,
    onError,
  })
  return {
    client,
    layer,
    layers,
    offscreen,
    onError,
    onInput,
    onNotice,
    onState,
    worker,
  }
}

describe("CanvasWorkerClient", () => {
  it("transfers surfaces, forwards plain input, and routes worker output", async () => {
    const { client, layer, offscreen, onInput, onNotice, onState, worker } = createClient()
    const init = worker.messages[0]
    expect(init.message).toMatchObject({ type: "init", id: 1, metrics: surfaceMetrics() })
    expect(init.transfer).toEqual([offscreen])

    worker.respond({ type: "result", id: 1 })
    await client.ready
    const event = typeof window.PointerEvent === "function"
      ? new PointerEvent("pointerdown", {
        bubbles: true, cancelable: true, button: 0, buttons: 1,
        clientX: 70, clientY: 50,
        isPrimary: true, pointerId: 3, pointerType: "mouse",
      })
      : new MouseEvent("mousedown", {
        bubbles: true, cancelable: true, button: 0, buttons: 1,
        clientX: 70, clientY: 50,
      })
    layer.dispatchEvent(event)

    expect(onInput).toHaveBeenCalledOnce()
    const forwarded = worker.messages.find(({ message }) => message.type === "input")!.message
    expect(forwarded).toMatchObject({
      type: "input",
      metrics: surfaceMetrics(),
      input: {
        event: { type: event.type },
        source: { kind: "pointer", clientX: 70, clientY: 50 },
      },
    })
    expect(forwarded.input.event.defaultPrevented).toBe(true)
    expect(forwarded.input).not.toHaveProperty("originEvent")

    const state = {
      timeMs: 20,
      playing: false,
      viewport: { x: 0, y: 0, scale: 1 },
      revision: "r1",
    }
    worker.respond({ type: "notice", notice: "ready" })
    worker.respond({ type: "state", state })
    worker.respond({ type: "cursor", cursor: "crosshair" })
    expect(onNotice).toHaveBeenCalledWith("ready")
    expect(onState).toHaveBeenCalledWith(state)
    expect(layer.style.cursor).toBe("crosshair")

    const triggered = client.trigger("jump", { position: 7 })
    await Promise.resolve()
    const action = worker.messages.at(-1)!.message
    expect(action).toMatchObject({ type: "trigger", name: "jump", payload: { position: 7 } })
    worker.respond({ type: "result", id: action.id })
    await triggered

    const destroy = client.destroy()
    const dispose = worker.messages.at(-1)!.message
    worker.respond({ type: "notice", notice: "late" })
    worker.respond({ type: "state", state: { ...state, timeMs: 40 } })
    worker.respond({ type: "cursor", cursor: "wait" })
    expect(onNotice).toHaveBeenCalledOnce()
    expect(onState).toHaveBeenCalledOnce()
    expect(layer.style.cursor).toBe("crosshair")
    worker.respond({ type: "result", id: dispose.id })
    await destroy
  })

  it("cancels only the signalled run and waits for dispose acknowledgement", async () => {
    const { client, worker } = createClient()
    worker.respond({ type: "result", id: 1 })
    await client.ready

    const controller = new AbortController()
    const run = client.run({ revision: "r2" }, { signal: controller.signal })
    await Promise.resolve()
    const runRequest = worker.messages.find(({ message }) => message.type === "run")!.message
    controller.abort()
    await expect(run).rejects.toMatchObject({ name: "AbortError" })
    expect(worker.messages.at(-1)?.message).toEqual({
      type: "cancel",
      id: runRequest.id,
    })

    const destroy = client.destroy()
    const dispose = worker.messages.at(-1)!.message
    expect(dispose.type).toBe("dispose")
    expect(worker.terminate).not.toHaveBeenCalled()
    worker.respond({ type: "result", id: dispose.id })
    await destroy
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it("makes worker transport failure terminal without taking ownership of the DOM list", async () => {
    const { client, layer, layers, onError, worker } = createClient()
    worker.respond({ type: "result", id: 1 })
    await client.ready

    const failure = new Error("worker crashed")
    worker.fail(failure)

    expect(onError).toHaveBeenCalledWith(failure)
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(layers).toEqual([layer])
    await expect(client.run({ revision: "r3" })).rejects.toThrow(
      "Canvas worker was destroyed"
    )
  })
})

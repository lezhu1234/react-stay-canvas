// @vitest-environment jsdom
import React, { act, StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import { StayCanvas } from "react-stay-canvas"
import type { CanvasWorkerResponse } from "../src/stay/worker/protocol"

class ResponsiveWorker extends EventTarget {
  readonly messages: Array<{ message: any; transfer: readonly Transferable[] }> = []
  readonly terminate = vi.fn()

  postMessage(message: any, transfer: readonly Transferable[] = []) {
    this.messages.push({ message, transfer })
    if (message.type === "init" || message.type === "dispose") {
      this.respond({ type: "result", id: message.id })
    }
  }

  respond(response: CanvasWorkerResponse<string>) {
    this.dispatchEvent(new MessageEvent("message", { data: response }))
  }
}

let restoreTransfer: (() => void) | undefined

afterEach(() => {
  restoreTransfer?.()
  restoreTransfer = undefined
  document.body.innerHTML = ""
})

function installOffscreenTransfer(transferred: HTMLCanvasElement[]) {
  const prototype = HTMLCanvasElement.prototype
  const previous = Object.getOwnPropertyDescriptor(prototype, "transferControlToOffscreen")
  Object.defineProperty(prototype, "transferControlToOffscreen", {
    configurable: true,
    value(this: HTMLCanvasElement) {
      transferred.push(this)
      return { width: this.width, height: this.height } as OffscreenCanvas
    },
  })
  restoreTransfer = () => {
    if (previous) Object.defineProperty(prototype, "transferControlToOffscreen", previous)
    else delete (prototype as any).transferControlToOffscreen
  }
}

describe("worker StayCanvas", () => {
  it("uses fresh transferred elements in StrictMode and keeps resize on the worker surface", async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    const transferred: HTMLCanvasElement[] = []
    installOffscreenTransfer(transferred)
    const workers: ResponsiveWorker[] = []
    const createWorker = vi.fn(() => {
      const worker = new ResponsiveWorker()
      workers.push(worker)
      return worker as unknown as Worker
    })
    const mounted = vi.fn()
    const onInput = vi.fn()
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    const runtime = { mode: "worker" as const, createWorker }

    await act(async () => {
      root.render(
        <StrictMode>
          <StayCanvas<{ revision: string }, string>
            runtime={runtime}
            width={200}
            height={120}
            layers={2}
            focusOnInit={false}
            mounted={mounted}
            onInput={onInput}
          />
        </StrictMode>
      )
      await Promise.resolve()
    })

    expect(createWorker).toHaveBeenCalledTimes(2)
    expect(transferred).toHaveLength(4)
    expect(new Set(transferred).size).toBe(transferred.length)
    expect(host.querySelectorAll("canvas")).toHaveLength(2)
    expect(mounted).toHaveBeenCalledOnce()
    expect(workers[0].terminate).toHaveBeenCalledOnce()

    const activeWorker = workers[workers.length - 1]
    const topLayer = host.querySelectorAll("canvas")[1]
    const initialBackingWidth = topLayer.width
    const inputEvent = typeof window.PointerEvent === "function"
      ? new PointerEvent("pointerdown", {
        bubbles: true, button: 0, buttons: 1, clientX: 20, clientY: 30,
        isPrimary: true, pointerId: 3, pointerType: "mouse",
      })
      : new MouseEvent("mousedown", {
        bubbles: true, button: 0, buttons: 1, clientX: 20, clientY: 30,
      })
    topLayer.dispatchEvent(inputEvent)
    expect(onInput).toHaveBeenCalledWith(expect.any(MouseEvent))
    expect(activeWorker.messages.some(({ message }) => message.type === "input"))
      .toBe(true)

    await act(async () => {
      root.render(
        <StrictMode>
        <StayCanvas<{ revision: string }, string>
          runtime={{ mode: "worker", createWorker: () => createWorker() }}
          width={320}
          height={180}
          layers={2}
          focusOnInit={false}
          mounted={mounted}
          onInput={onInput}
        />
        </StrictMode>
      )
      await Promise.resolve()
    })

    expect(topLayer.width).toBe(initialBackingWidth)
    expect(createWorker).toHaveBeenCalledTimes(2)
    expect(topLayer.style.width).toBe("320px")
    expect([...activeWorker.messages].reverse()
      .find(({ message }) => message.type === "surface")?.message)
      .toMatchObject({
        metrics: { logicalWidth: 320, logicalHeight: 180 },
      })

    await act(async () => {
      root.unmount()
      await Promise.resolve()
    })
    expect(activeWorker.terminate).toHaveBeenCalledOnce()
  })
})

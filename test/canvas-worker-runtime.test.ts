import { createCanvas } from "canvas"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Rectangle } from "../src/shapes/rectangle"
import type { StayAnimatedChild } from "../src/stay/children/stayAnimatedChild"
import { CanvasWorkerRuntime, type CanvasWorkerScope } from "../src/stay/worker/runtime"
import type { CanvasWorkerRequest, CanvasWorkerResponse } from "../src/stay/worker/protocol"
import type { ForwardedCanvasInput } from "../src/stay/events/input/forwardedInput"
import type { CanvasWorkerInstallation, CanvasRuntimeTools } from "../src/types/worker"
import type { CanvasSurfaceMetrics } from "../src/types/canvas"

const metrics: CanvasSurfaceMetrics = {
  logicalWidth: 320, logicalHeight: 180, backingWidth: 640, backingHeight: 360,
  clientRect: { left: 40, top: 20, width: 160, height: 90 },
}

// A native Canvas2D context checks the shared drawing pass. The transferred
// browser surface and browser frame delivery are covered by integration runs.
class TestSurface extends EventTarget {
  readonly canvas = createCanvas(1, 1)
  get width() { return this.canvas.width }
  set width(value: number) { this.canvas.width = value }
  get height() { return this.canvas.height }
  set height(value: number) { this.canvas.height = value }
  getContext() { return this.canvas.getContext("2d") }
  async convertToBlob() { return new Blob([new Uint8Array(this.canvas.toBuffer("image/png"))]) }
}

function deferred<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

class TestScope<Input, Notice> implements CanvasWorkerScope<Input, Notice> {
  listener?: (event: MessageEvent<CanvasWorkerRequest<Input>>) => void
  readonly messages: CanvasWorkerResponse<Notice>[] = []
  readonly pending = new Map<number, ReturnType<typeof deferred<CanvasWorkerResponse<Notice>>>>()
  readonly close = vi.fn()
  addEventListener(_type: "message", listener: NonNullable<TestScope<Input, Notice>["listener"]>) {
    this.listener = listener
  }
  removeEventListener() { this.listener = undefined }
  postMessage(message: CanvasWorkerResponse<Notice>) {
    this.messages.push(message)
    if ((message.type === "result" || message.type === "error") && message.id !== undefined) {
      this.pending.get(message.id)?.resolve(message)
      this.pending.delete(message.id)
    }
  }
  send(request: CanvasWorkerRequest<Input>) {
    this.listener?.({ data: request } as MessageEvent<CanvasWorkerRequest<Input>>)
  }
  request(request: Extract<CanvasWorkerRequest<Input>, { id: number }>) {
    const result = deferred<CanvasWorkerResponse<Notice>>()
    this.pending.set(request.id, result)
    this.send(request)
    return result.promise
  }
}

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function runtime<Input, Notice>(installation: CanvasWorkerInstallation<Input, Notice>) {
  const frames: FrameRequestCallback[] = []
  vi.spyOn(performance, "now")
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  const scope = new TestScope<Input, Notice>()
  const surface = new TestSurface()
  const instance = new CanvasWorkerRuntime(installation, scope)
  const response = await scope.request({
    type: "init", id: 0, layers: [surface as unknown as OffscreenCanvas], metrics,
  })
  expect(response).toEqual({ type: "result", id: 0, value: undefined })
  let disposed = false
  const dispose = async () => {
    if (disposed) return
    await scope.request({ type: "dispose", id: 999 })
    disposed = true
    expect(scope.close).toHaveBeenCalledOnce()
  }
  cleanups.push(async () => {
    await dispose()
  })
  return {
    instance, scope, surface, dispose,
    frame(timestamp: number, now = timestamp) {
      const callback = frames.shift()
      if (!callback) throw new Error("No native render frame was scheduled")
      vi.mocked(performance.now).mockReturnValue(now)
      callback(timestamp)
    },
  }
}

function append(canvas: CanvasRuntimeTools, revision: string, x: number, durationMs: number, signal: AbortSignal) {
  return canvas.scene.appendStep({
    revision, resourceRevision: "resources", durationMs,
    children: [{ id: "value", className: "value", shapes: new Map([["body", new Rectangle({
      x, y: 20, width: 40, height: 30,
      fillConfig: { color: { r: 255, g: 0, b: 0, a: 1 } }, transition: { type: "linear" },
    })]]) }],
  }, { signal })
}

function pointer(clientX: number, clientY: number): ForwardedCanvasInput {
  return {
    event: { type: "pointerdown", bubbles: true, cancelable: true, defaultPrevented: false },
    source: { kind: "pointer", clientX, clientY }, pressedKeys: ["mouse0"],
    pointerSample: { clientX, clientY }, rawAction: { trigger: "mousedown" },
    pointerSession: { id: 1, startedAt: 0, pointerId: 5, pointerType: "mouse", initiatingButton: 0 },
    sessionTransition: { phase: "start" },
  }
}

describe("the library-owned background canvas", () => {
  it("keeps a DOM view anchor in place through the existing coordinate conversion", async () => {
    let canvas!: CanvasRuntimeTools
    const { scope } = await runtime<void, never>({
      setup: (context) => { canvas = context.canvas }, run: async () => {},
    })
    await scope.request({ type: "viewport", id: 1,
      command: { kind: "restore", state: { x: 30, y: 10, scale: 2 } } })
    const viewAnchor = { x: 70, y: 60 }
    const contentAnchor = canvas.coordinates.viewToContent(viewAnchor)
    await scope.request({ type: "viewport", id: 2,
      command: { kind: "zoomBy", factor: 1.5, viewAnchor } })
    expect(canvas.coordinates.contentToView(contentAnchor)).toEqual(viewAnchor)
  })

  it("plays through the existing endpoint sampling interval", async () => {
    let canvas!: CanvasRuntimeTools
    const { scope, frame } = await runtime<void, never>({
      setup: (context) => { canvas = context.canvas },
      run: async (_input, context) => {
        append(context.canvas, "first", 0, 0, context.signal)
        append(context.canvas, "middle", 100, 100, context.signal)
        append(context.canvas, "last", 0, 100, context.signal)
      },
    })
    await scope.request({ type: "run", id: 1, input: undefined })
    await scope.request({ type: "seek", id: 2, props: { timeMs: 0 } })
    vi.spyOn(performance, "now").mockReturnValue(1000)
    await scope.request({ type: "play", id: 3,
      options: { toTimeMs: 200, bound: { beforeMs: 0, afterMs: 200 } } })
    frame(1050)
    expect(canvas.getChildById("value")!.shapeMap.get("body")!.x).toBeCloseTo(0)
    expect(scope.messages.at(-1)).toMatchObject({ type: "state", state: { timeMs: 50, playing: true } })
    frame(1200)
    expect(scope.messages.at(-1)).toMatchObject({ type: "state", state: { timeMs: 200, playing: false } })
  })

  it("uses one monotonic clock when a frame carries an older animation timestamp", async () => {
    const { scope, frame } = await runtime<void, never>({ run: async () => {} })
    await scope.request({ type: "seek", id: 1, props: { timeMs: 0 } })
    vi.spyOn(performance, "now").mockReturnValue(1000)
    await scope.request({ type: "play", id: 2, options: { toTimeMs: 200 } })

    frame(999.8, 1000.2)
    expect(scope.messages.at(-1)).toMatchObject({
      type: "state", state: { timeMs: expect.closeTo(0.2), playing: true },
    })

    await scope.request({ type: "play", id: 3, options: { toTimeMs: 200, speed: 2 } })
    frame(1010, 1010.2)
    expect(scope.messages.at(-1)).toMatchObject({
      type: "state", state: { timeMs: expect.closeTo(20.2), playing: true },
    })
    frame(1100, 1100.2)
    expect(scope.messages.at(-1)).toMatchObject({
      type: "state", state: { timeMs: 200, playing: false },
    })

    await scope.request({ type: "play", id: 4, options: { toTimeMs: 0, speed: 2 } })
    frame(1099.8, 1100.7)
    expect(scope.messages.at(-1)).toMatchObject({
      type: "state", state: { timeMs: 199, playing: true },
    })
    frame(1200, 1200.7)
    expect(scope.messages.at(-1)).toMatchObject({
      type: "state", state: { timeMs: 0, playing: false },
    })
  })

  it("dispatches existing manual actions while an independent preparation remains active", async () => {
    const started = deferred()
    const finish = deferred()
    let aborted = false
    const { scope } = await runtime<void, unknown>({
      setup: ({ canvas, emit }) => canvas.addEventListener({
        name: "manual-action", event: ["jump"],
        callback: ({ originEvent, payload }) => {
          emit({ payload, origin: originEvent })
        },
      }),
      run: async (_input, { signal }) => {
        started.resolve()
        await finish.promise
        aborted = signal.aborted
      },
    })
    const running = scope.request({ type: "run", id: 1, input: undefined })
    await started.promise
    expect(await scope.request({ type: "trigger", id: 2, name: "jump", payload: { position: 7 } }))
      .toEqual({ type: "result", id: 2, value: undefined })
    expect(scope.messages.find((message) => message.type === "notice"))
      .toMatchObject({ type: "notice", notice: { payload: { position: 7 }, origin: { type: "jump" } } })
    finish.resolve()
    expect(await running).toMatchObject({ type: "result", id: 1 })
    expect(aborted).toBe(false)
  })

  it("keeps setup-owned yielding independent from run cancellation and closes it with the instance", async () => {
    let yieldSetupTurn!: () => Promise<void>
    const cancelStarted = deferred()
    const cancelRelease = deferred()
    const replaceStarted = deferred()
    const replaceRelease = deferred()
    const { scope, dispose } = await runtime<number, never>({
      setup: ({ yield: yieldTurn }) => { yieldSetupTurn = yieldTurn },
      run: async (input) => {
        if (input === 1) {
          cancelStarted.resolve()
          await cancelRelease.promise
        }
        if (input === 2) {
          replaceStarted.resolve()
          await replaceRelease.promise
        }
      },
    })

    const cancelled = scope.request({ type: "run", id: 1, input: 1 })
    await cancelStarted.promise
    scope.send({ type: "cancel", id: 1 })
    await expect(yieldSetupTurn()).resolves.toBeUndefined()
    cancelRelease.resolve()
    expect(await cancelled).toMatchObject({ type: "error", error: { name: "AbortError" } })

    const replaced = scope.request({ type: "run", id: 2, input: 2 })
    await replaceStarted.promise
    const replacement = scope.request({ type: "run", id: 3, input: 3 })
    await expect(yieldSetupTurn()).resolves.toBeUndefined()
    replaceRelease.resolve()
    expect(await replaced).toMatchObject({ type: "error", error: { name: "AbortError" } })
    expect(await replacement).toMatchObject({ type: "result", id: 3 })

    await dispose()
    await expect(yieldSetupTurn()).rejects.toMatchObject({ name: "AbortError" })
  })

  it("appends and samples the existing native timeline without a DOM global or returning graphs", async () => {
    expect(typeof document).toBe("undefined")
    let canvas!: CanvasRuntimeTools
    const { scope, surface, frame } = await runtime<number[], number>({
      setup: (context) => { canvas = context.canvas },
      run: async (positions, context) => {
        for (const [index, x] of positions.entries()) {
          const receipt = append(context.canvas, `step-${index}`, x, index ? 100 : 0, context.signal)
          context.emit(receipt.endTimeMs)
          await context.yield()
        }
      },
    })
    expect(await scope.request({ type: "run", id: 1, input: [0, 100] }))
      .toEqual({ type: "result", id: 1, value: undefined })
    const child = canvas.getChildById("value") as StayAnimatedChild<Rectangle>
    const seek = await scope.request({ type: "seek", id: 2, props: { timeMs: 50.5 } })
    expect(seek).toMatchObject({ type: "result", value: { timeMs: 50.5, revision: "step-1", playing: false } })
    expect(child.shapeMap.get("body")!.x).toBeCloseTo(50.5)
    expect(scope.messages.filter((message) => message.type === "notice"))
      .toEqual([{ type: "notice", notice: 0 }, { type: "notice", notice: 100 }])
    const pixel = surface.getContext().getImageData(120, 50, 1, 1).data
    expect([...pixel]).toEqual([255, 0, 0, 255])
    const now = 1000
    vi.spyOn(performance, "now").mockReturnValue(now)
    await scope.request({ type: "play", id: 3, options: { toTimeMs: 100 } })
    frame(now + 49.5)
    expect(child.shapeMap.get("body")!.x).toBeCloseTo(100)
    expect(scope.messages.at(-1)).toMatchObject({ type: "state", state: { timeMs: 100, playing: false } })
    await scope.request({ type: "play", id: 4, options: { toTimeMs: 0 } })
    canvas.progress({ timeMs: 32.25 })
    frame(now + 100)
    expect(child.shapeMap.get("body")!.x).toBeCloseTo(32.25)
    expect(scope.messages.at(-1)).toMatchObject({ type: "state", state: { timeMs: 32.25, playing: false } })
  })

  it("keeps the accepted picture when another preparation fails", async () => {
    let canvas!: CanvasRuntimeTools
    const { scope } = await runtime<boolean, never>({
      setup: (context) => { canvas = context.canvas },
      run: async (fail, context) => {
        if (fail) throw new Error("Preparation failed")
        append(context.canvas, "accepted", 20, 0, context.signal)
      },
    })
    await scope.request({ type: "run", id: 1, input: false })
    const child = canvas.getChildById("value")
    expect(await scope.request({ type: "run", id: 2, input: true }))
      .toMatchObject({ type: "error", id: 2, error: { message: "Preparation failed" } })
    expect(canvas.getChildById("value")).toBe(child)
    expect(canvas.scene.revision).toBe("accepted")
    expect(await scope.request({ type: "seek", id: 3, props: { timeMs: 0 } }))
      .toMatchObject({ type: "result", value: { revision: "accepted" } })
  })

  it("captures another sample through native drawing and restores the visible sample", async () => {
    vi.stubGlobal("OffscreenCanvas", TestSurface)
    let canvas!: CanvasRuntimeTools
    const { scope } = await runtime<void, never>({
      setup: (context) => { canvas = context.canvas },
      run: async (_input, context) => {
        append(context.canvas, "first", 0, 0, context.signal)
        append(context.canvas, "second", 100, 100, context.signal)
      },
    })
    await scope.request({ type: "run", id: 1, input: undefined })
    await scope.request({ type: "seek", id: 2, props: { timeMs: 50.5 } })
    const child = canvas.getChildById("value") as StayAnimatedChild<Rectangle>
    const projection = child.shapeMap
    const capture = await scope.request({ type: "capture", id: 3, options: {
      area: { x: 0, y: 0, width: 160, height: 80 }, timeMs: 100, childIds: ["value"],
    } })
    expect(capture.type).toBe("result")
    if (capture.type !== "result" || !(capture.value instanceof Blob)) throw new Error("Expected a capture Blob")
    expect(capture.value.size).toBeGreaterThan(0)
    expect(child.shapeMap).toBe(projection)
    expect(child.shapeMap.get("body")!.x).toBeCloseTo(50.5)
    vi.spyOn(TestSurface.prototype, "convertToBlob").mockRejectedValue(new Error("Capture failed"))
    expect(await scope.request({ type: "capture", id: 4, options: {
      area: { x: 0, y: 0, width: 160, height: 80 }, timeMs: 0,
    } })).toMatchObject({ type: "error", error: { message: "Capture failed" } })
    expect(child.shapeMap).toBe(projection)
    expect(await scope.request({ type: "seek", id: 5, props: { timeMs: 50.5 } }))
      .toMatchObject({ type: "result", value: { timeMs: 50.5 } })
  })

  it("serializes superseded preparations and starts only the latest one", async () => {
    const started = deferred()
    const release = deferred()
    const runs: number[] = []
    const { scope } = await runtime<number, number>({
      run: async (input, context) => {
        runs.push(input)
        if (input === 1) {
          started.resolve()
          await release.promise
          await context.yield()
        }
        context.emit(input)
      },
    })
    const first = scope.request({ type: "run", id: 1, input: 1 })
    await started.promise
    const second = scope.request({ type: "run", id: 2, input: 2 })
    const third = scope.request({ type: "run", id: 3, input: 3 })
    release.resolve()
    expect(await first).toMatchObject({ type: "error", error: { name: "AbortError" } })
    expect(await second).toMatchObject({ type: "error", error: { name: "AbortError" } })
    expect(await third).toEqual({ type: "result", id: 3, value: undefined })
    expect(runs).toEqual([1, 3])
    expect(scope.messages.filter((message) => message.type === "notice"))
      .toEqual([{ type: "notice", notice: 3 }])
  })

  it.each(["cancel", "supersede"] as const)("reports %s during native scene preparation as task cancellation", async (operation) => {
    const started = deferred()
    let canvas!: CanvasRuntimeTools
    const { scope } = await runtime<boolean, string>({
      setup: (context) => { canvas = context.canvas },
      run: async (prepare, context) => {
        if (!prepare) {
          append(context.canvas, "accepted", 20, 0, context.signal)
          return
        }
        const epoch = context.canvas.scene.beginUpdate()
        started.resolve()
        await context.canvas.scene.prepare(epoch, {
          revision: "pending", resourceRevision: "resources", children: [],
        }, { signal: context.signal, durationMs: 0 })
        context.emit("prepared")
      },
    })
    await scope.request({ type: "run", id: 1, input: false })
    const child = canvas.getChildById("value")
    const pending = scope.request({ type: "run", id: 2, input: true })
    await started.promise
    let replacement: Promise<CanvasWorkerResponse<string>> | undefined
    if (operation === "supersede") replacement = scope.request({ type: "run", id: 3, input: false })
    else scope.send({ type: "cancel", id: 2 })
    expect(await pending).toMatchObject({ type: "error", id: 2, error: { name: "AbortError" } })
    if (replacement) expect(await replacement).toEqual({ type: "result", id: 3, value: undefined })
    expect(canvas.scene.revision).toBe("accepted")
    expect(canvas.getChildById("value")).toBe(child)
    expect(scope.messages.filter((message) => message.type === "notice")).toEqual([])
    expect(await scope.request({ type: "seek", id: 4, props: { timeMs: 0 } }))
      .toMatchObject({ type: "result", value: { revision: "accepted" } })
    expect(await scope.request({ type: "run", id: 5, input: false }))
      .toEqual({ type: "result", id: 5, value: undefined })
  })

  it("maps forwarded pointer data through native hit testing and repaints a changed backing store", async () => {
    const { scope, surface, frame } = await runtime<void, { id?: string; point?: unknown; origin: unknown }>({
      run: async (_input, context) => { append(context.canvas, "initial", 20, 0, context.signal) },
      setup: ({ canvas, emit }) => canvas.addEventListener({
        name: "select", event: "mousedown", selector: ".value",
        callback: ({ e, originEvent }) => { emit({ id: e.target?.id, point: e.point, origin: originEvent }) },
      }),
    })
    await scope.request({ type: "run", id: 1, input: undefined })
    const event = pointer(55, 35)
    scope.send({ type: "input", input: event, metrics })
    expect(scope.messages.at(-1)).toEqual({ type: "notice", notice: {
      id: "value", point: { x: 30, y: 30 }, origin: event.event,
    } })
    const resized = { ...metrics, backingWidth: 960, backingHeight: 540 }
    scope.send({ type: "input", input: event, metrics: resized })
    frame(0)
    expect(surface.width).toBe(960)
    expect([...surface.getContext().getImageData(90, 90, 1, 1).data]).toEqual([255, 0, 0, 255])
  })
})

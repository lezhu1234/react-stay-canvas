// @vitest-environment jsdom
import React, { act, createRef } from "react"
import { createRoot } from "react-dom/client"
import type { Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Rectangle, StayCanvas } from "react-stay-canvas"
import type {
  ContextLayerSetFunction,
  StayCanvasRefType,
  StayTools,
} from "react-stay-canvas"

let root: Root | undefined

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.innerHTML = ""
})

function createContainer() {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  window.requestAnimationFrame = () => 1
  window.cancelAnimationFrame = () => {}

  const container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  return container
}

function createContextSetters(count: number) {
  return Array.from({ length: count }, () =>
    vi.fn<ContextLayerSetFunction>((canvas) => canvas.getContext("2d"))
  )
}

describe("StayCanvas layers", () => {
  it("renders one Canvas for each context setter", () => {
    const container = createContainer()
    const contextSetters = createContextSetters(3)

    act(() => {
      root?.render(
        <StayCanvas layers={contextSetters} focusOnInit={false} />
      )
    })

    const canvases = container.querySelectorAll("canvas")
    expect(canvases).toHaveLength(3)
    contextSetters.forEach((setContext, index) => {
      expect(setContext).toHaveBeenCalledOnce()
      expect(setContext).toHaveBeenCalledWith(canvases[index])
    })
  })

  it("uses the latest context setters when reCreate rebuilds the runtime", () => {
    const container = createContainer()
    const canvasRef = createRef<StayCanvasRefType>()
    const initialSetters = createContextSetters(3)
    const replacementSetters = createContextSetters(2)

    act(() => {
      root?.render(
        <StayCanvas
          ref={canvasRef}
          layers={initialSetters}
          focusOnInit={false}
        />
      )
    })
    act(() => {
      root?.render(
        <StayCanvas
          ref={canvasRef}
          layers={replacementSetters}
          focusOnInit={false}
        />
      )
    })
    act(() => canvasRef.current?.reCreate())

    expect(container.querySelectorAll("canvas")).toHaveLength(2)
    replacementSetters.forEach((setContext) => {
      expect(setContext).toHaveBeenCalledOnce()
    })
  })

  it("rebuilds every configured layer when a resize requests recreation", () => {
    const container = createContainer()
    const contextSetters = createContextSetters(2)
    const mounted = vi.fn()

    act(() => {
      root?.render(
        <StayCanvas
          width={300}
          layers={contextSetters}
          mounted={mounted}
          recreateOnResize
          focusOnInit={false}
        />
      )
    })
    act(() => {
      root?.render(
        <StayCanvas
          width={320}
          layers={contextSetters}
          mounted={mounted}
          recreateOnResize
          focusOnInit={false}
        />
      )
    })

    expect(container.querySelectorAll("canvas")).toHaveLength(2)
    expect(mounted).toHaveBeenCalledTimes(2)
    contextSetters.forEach((setContext) => {
      expect(setContext).toHaveBeenCalledTimes(2)
    })
  })

  it("resizes the existing runtime by default and preserves mounted scene references", () => {
    const container = createContainer()
    const observedLayerSizes = [[], []] as Array<Array<{ height: number; width: number }>>
    const contextSetters = observedLayerSizes.map((sizes) =>
      vi.fn<ContextLayerSetFunction>((canvas) => {
        sizes.push({ height: canvas.height, width: canvas.width })
        return canvas.getContext("2d")
      })
    )
    const mounted = vi.fn((tools: StayTools) => {
      tools.appendChild({
        id: "preserved",
        className: "shape",
        shape: new Rectangle({ x: 20, y: 30, width: 80, height: 50 }),
      })
      tools.viewport.restore({ x: 12, y: 18, scale: 1.5 })
    })

    act(() => {
      root?.render(
        <StayCanvas
          width={300}
          height={200}
          layers={contextSetters}
          mounted={mounted}
          focusOnInit={false}
        />
      )
    })

    const tools = mounted.mock.calls[0][0]
    const child = tools.getChildById<Rectangle>("preserved")!
    const canvases = [...container.querySelectorAll("canvas")]

    act(() => {
      root?.render(
        <StayCanvas
          width={480}
          height={320}
          layers={contextSetters}
          mounted={mounted}
          focusOnInit={false}
        />
      )
    })

    expect(mounted).toHaveBeenCalledOnce()
    expect([...container.querySelectorAll("canvas")]).toEqual(canvases)
    expect(tools.getChildById("preserved")).toBe(child)
    expect(child.shape.getBound()).toEqual({ x: 20, y: 30, width: 80, height: 50 })
    expect(tools.viewport.get()).toEqual({ x: 12, y: 18, scale: 1.5 })
    canvases.forEach((canvas) => {
      expect(canvas.style.width).toBe("480px")
      expect(canvas.style.height).toBe("320px")
      expect(canvas.width).toBe(480 * window.devicePixelRatio)
      expect(canvas.height).toBe(320 * window.devicePixelRatio)
    })
    contextSetters.forEach((setContext) => {
      expect(setContext).toHaveBeenCalledTimes(2)
    })
    observedLayerSizes.forEach((sizes) => {
      expect(sizes).toEqual([
        { width: 300 * window.devicePixelRatio, height: 200 * window.devicePixelRatio },
        { width: 480 * window.devicePixelRatio, height: 320 * window.devicePixelRatio },
      ])
    })
  })

  it("cancels an active pointer session in its pre-resize DOM coordinate frame", () => {
    const container = createContainer()
    const terminal = vi.fn()

    act(() => {
      root?.render(
        <StayCanvas
          width={300}
          height={200}
          listenerList={[{
            name: "resize-terminal",
            event: "dragend",
            callback: ({ e }) => terminal({
              cancelled: e.cancelled,
              point: e.point,
              reason: e.cancelReason,
            }),
          }]}
          focusOnInit={false}
        />
      )
    })

    const canvas = container.querySelectorAll("canvas")[1]
    vi.spyOn(canvas, "getBoundingClientRect").mockImplementation(() => {
      const resized = canvas.parentElement?.style.width === "480px"
      return {
        x: resized ? 220 : 100,
        y: 50,
        left: resized ? 220 : 100,
        top: 50,
        right: (resized ? 220 : 100) + 300,
        bottom: 250,
        width: 300,
        height: 200,
        toJSON: () => ({}),
      }
    })

    act(() => {
      canvas.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        buttons: 1,
        clientX: 120,
        clientY: 70,
      }))
      canvas.dispatchEvent(new MouseEvent("mousemove", {
        bubbles: true,
        button: 0,
        buttons: 1,
        clientX: 170,
        clientY: 95,
      }))
    })

    act(() => {
      root?.render(
        <StayCanvas
          width={480}
          height={320}
          listenerList={[{
            name: "resize-terminal",
            event: "dragend",
            callback: ({ e }) => terminal({
              cancelled: e.cancelled,
              point: e.point,
              reason: e.cancelReason,
            }),
          }]}
          focusOnInit={false}
        />
      )
    })

    expect(terminal).toHaveBeenCalledOnce()
    expect(terminal).toHaveBeenCalledWith({
      cancelled: true,
      point: { x: 70, y: 45 },
      reason: "resize",
    })
  })

  it("rejects an empty context-setter array", () => {
    createContainer()
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    try {
      expect(() => {
        act(() => {
          root?.render(<StayCanvas layers={[]} focusOnInit={false} />)
        })
      }).toThrow("layers must be greater than 0")
    } finally {
      consoleError.mockRestore()
    }
  })

  it("rejects a context setter that returns null", () => {
    createContainer()
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const layers: ContextLayerSetFunction[] = [() => null]

    try {
      expect(() => {
        act(() => {
          root?.render(<StayCanvas layers={layers} focusOnInit={false} />)
        })
      }).toThrow("Unable to get drawing context for layer 0")
    } finally {
      consoleError.mockRestore()
    }
  })
})

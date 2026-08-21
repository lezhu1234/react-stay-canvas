// @vitest-environment jsdom
import React, { act, createRef } from "react"
import { createRoot } from "react-dom/client"
import type { Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { StayCanvas } from "react-stay-canvas"
import type {
  ContextLayerSetFunction,
  StayCanvasRefType,
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

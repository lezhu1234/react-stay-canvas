// @vitest-environment jsdom
import React, { act, createRef } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"
import {
  ListenerProps,
  StayCanvas,
  StayCanvasRefType,
} from "react-stay-canvas"
import { createStage, md } from "./helpers/stage"

afterEach(() => {
  document.body.innerHTML = ""
})

describe("input lifecycle", () => {
  it("keeps pressed state isolated between Canvas instances", () => {
    const first = createStage()
    const second = createStage()
    let observed: string[] = []

    second.stage.addEventListener({
      name: "second-down",
      event: "mousedown",
      callback: ({ e }) => {
        observed = [...e.pressedKeys]
      },
    })

    first.top.dispatchEvent(new KeyboardEvent("keydown", { key: "Control" }))
    second.top.dispatchEvent(md(10, 10))

    expect(observed).toEqual(["mouse0"])
    first.stage.destroy()
    second.stage.destroy()
  })

  it("reCreate replaces the old Stay and unmount detaches the active one", () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    let frameId = 0
    const cancelledFrames: number[] = []
    window.requestAnimationFrame = () => ++frameId
    window.cancelAnimationFrame = (id) => cancelledFrames.push(id)

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    const canvasRef = createRef<StayCanvasRefType>()
    let firstCalls = 0
    let secondCalls = 0
    let mounts = 0
    const firstListeners: ListenerProps[] = [
      {
        name: "first",
        event: "mousedown",
        callback: () => {
          firstCalls++
        },
      },
    ]
    const secondListeners: ListenerProps[] = [
      {
        name: "second",
        event: "mousedown",
        callback: () => {
          secondCalls++
        },
      },
    ]

    act(() => {
      root.render(
        <StayCanvas
          ref={canvasRef}
          focusOnInit={false}
          listenerList={firstListeners}
          mounted={() => mounts++}
        />
      )
    })
    const topLayer = container.querySelectorAll("canvas")[1]
    topLayer.dispatchEvent(md(10, 10))

    act(() => {
      root.render(
        <StayCanvas
          ref={canvasRef}
          focusOnInit={false}
          listenerList={secondListeners}
          mounted={() => mounts++}
        />
      )
    })
    act(() => {
      canvasRef.current?.reCreate()
    })
    topLayer.dispatchEvent(md(10, 10))

    expect(firstCalls).toBe(1)
    expect(secondCalls).toBe(1)
    expect(mounts).toBe(2)

    act(() => root.unmount())
    topLayer.dispatchEvent(md(10, 10))

    expect(firstCalls).toBe(1)
    expect(secondCalls).toBe(1)
    expect(cancelledFrames).toHaveLength(2)
  })
})

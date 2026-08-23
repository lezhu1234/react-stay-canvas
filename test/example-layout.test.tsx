// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Rectangle, StayCanvas, type StayTools } from "react-stay-canvas"

import {
  CanvasCard,
  placeSceneChild,
  resetScene,
  sceneArea,
  sceneCanvasArea,
  sceneLine,
  scenePoint,
} from "../example/src/components/DemoKit"

let root: Root | undefined
let originalClientHeight: PropertyDescriptor | undefined
let originalClientWidth: PropertyDescriptor | undefined

beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  window.requestAnimationFrame = () => 1
  window.cancelAnimationFrame = () => {}
  originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight")
  originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth")
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return this.classList?.contains("canvas-viewport") ? 480 : 0
    },
  })
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return this.classList?.contains("canvas-viewport") ? 920 : 0
    },
  })
})

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.innerHTML = ""
  if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight)
  if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth)
})

describe("Example Canvas workspace", () => {
  it("uses the full stable stage and keeps initial and later scene children aligned", async () => {
    let initialChild: ReturnType<StayTools["appendChild"]> | undefined
    let tools: StayTools | undefined

    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <CanvasCard title="Stage">
          <StayCanvas
            focusOnInit={false}
            height={330}
            layers={1}
            mounted={(mountedTools) => {
              tools = mountedTools
              initialChild = placeSceneChild(mountedTools, mountedTools.appendChild({
                className: "initial",
                shape: new Rectangle({
                  x: 10,
                  y: 20,
                  width: 40,
                  height: 30,
                  fillConfig: { color: { r: 54, g: 95, b: 202, a: 1 } },
                }),
              }))
            }}
            width={440}
          />
        </CanvasCard>,
      )
    })

    expect(initialChild?.canvas.width).toBe(920)
    expect(initialChild?.canvas.height).toBe(480)
    expect((initialChild?.shape as Rectangle).x).toBe(250)
    expect((initialChild?.shape as Rectangle).y).toBe(95)

    const laterChild = placeSceneChild(tools!, tools!.appendChild({
      className: "later",
      shape: new Rectangle({ x: 32, y: 48, width: 40, height: 30 }),
    }))
    expect((laterChild.shape as Rectangle).x).toBe(272)
    expect((laterChild.shape as Rectangle).y).toBe(123)
    placeSceneChild(tools!, laterChild)
    expect((laterChild.shape as Rectangle).x).toBe(272)
    expect((laterChild.shape as Rectangle).y).toBe(123)
    expect(tools?.getChildrenWithoutRoot()).toHaveLength(2)
    tools!.moveStart()
    void tools!.move(30, 20)
    void resetScene(tools!)
    expect((initialChild?.shape as Rectangle).x).toBe(250)
    expect((initialChild?.shape as Rectangle).y).toBe(95)
    expect(scenePoint(tools!, 220, 145)).toEqual({ x: 460, y: 220 })
    expect(sceneLine(tools!, 0, 0, 440, 330)).toEqual({ x1: 240, y1: 75, x2: 680, y2: 405 })
    expect(sceneArea(tools!, 440, 330)).toEqual({ x: 240, y: 75, width: 440, height: 330 })
    const canvasArea = sceneCanvasArea(tools!, 440, 330)
    expect(canvasArea).toEqual({ x: 0, y: 0, width: 920, height: 480 })

    const snapshot = await tools!.regionToTargetCanvas({
      area: canvasArea,
      targetSize: { width: canvasArea.width, height: canvasArea.height },
      children: tools!.getChildrenWithoutRoot(),
    })
    expect(snapshot.width).toBe(920)
    expect(snapshot.height).toBe(480)
    expect(snapshot.getContext("2d")?.getImageData(250, 95, 1, 1).data[3]).toBeGreaterThan(0)
  })
})

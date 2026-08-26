// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Rectangle, StayCanvas, type StayTools } from "react-stay-canvas"

import {
  Button,
  CanvasCard,
  DemoLayout,
  EventLog,
  placeSceneChild,
  resetScene,
  sceneArea,
  sceneCanvasArea,
  sceneLine,
  scenePoint,
  StatusGrid,
  Toolbar,
} from "../example/src/components/DemoKit"
import { ExamplePage } from "../example/src/components/ExamplePage"
import DiagramExample from "../example/src/examples/integrated/DiagramExample"
import MotionStudioExample from "../example/src/examples/integrated/MotionStudioExample"
import CoordinatesExample from "../example/src/examples/simple/CoordinatesExample"
import { type ExampleDefinition } from "../example/src/examples/types"
import { I18nProvider } from "../example/src/i18n"
import { installPointerEvents, pointer } from "./helpers/pointer"

vi.stubGlobal("OffscreenCanvas", class {
  constructor(public width: number, public height: number) {}
  getContext() {
    return { measureText: () => ({ width: 56, fontBoundingBoxAscent: 10, fontBoundingBoxDescent: 2 }) }
  }
})

let root: Root | undefined
let originalClientHeight: PropertyDescriptor | undefined
let originalClientWidth: PropertyDescriptor | undefined

beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  window.localStorage.clear()
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
  vi.restoreAllMocks()
  if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight)
  if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth)
})

describe("Example Canvas workspace", () => {
  it("uses the compact workspace shell for every example definition", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const definition: ExampleDefinition = {
      path: "/simple/test",
      sourcePaths: ["./TestExample.tsx"],
      group: "Simple",
      order: 1,
      title: { en: "Test workspace", zh: "测试工作区" },
      shortTitle: { en: "Test", zh: "测试" },
      summary: { en: "A test Canvas workspace.", zh: "测试 Canvas 工作区。" },
      features: ["Canvas"],
      component: () => <div data-testid="example-result" />,
    }

    act(() => {
      root?.render(
        <I18nProvider>
          <ExamplePage definition={definition} sources={[{ path: definition.sourcePaths[0], source: "export default function Test() {}" }]} />
        </I18nProvider>,
      )
    })

    expect(container.querySelector("article.example-page.workspace-page")).not.toBeNull()
    expect(container.querySelector("#result-panel [data-testid='example-result']")).not.toBeNull()
  })

  it("keeps the stage and every control group in separate workspace regions", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <I18nProvider>
          <DemoLayout>
            <div data-testid="stage" />
            <Toolbar><Button onClick={() => {}}>Reset</Button></Toolbar>
            <StatusGrid items={[["Children", 3]]} />
            <EventLog entries={["ready"]} />
          </DemoLayout>
        </I18nProvider>,
      )
    })

    const layout = container.querySelector(".demo-layout")
    const primary = layout?.querySelector(":scope > .demo-primary")
    const controls = layout?.querySelector(":scope > .demo-controls")
    expect(primary?.querySelector("[data-testid='stage']")).not.toBeNull()
    expect(controls?.tagName).toBe("ASIDE")
    expect(controls?.getAttribute("aria-label")).toBe("Example controls")
    expect(controls?.querySelectorAll(":scope > .demo-control-panel")).toHaveLength(3)
    expect(controls?.querySelector(".toolbar")).not.toBeNull()
    expect(controls?.querySelector(".status-grid")).not.toBeNull()
    expect(controls?.querySelector(".event-log")).not.toBeNull()
  })

  it("keeps the diagram palette and Canvas in the same two-column primary workspace", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(<I18nProvider><DiagramExample /></I18nProvider>)
    })

    const workspace = container.querySelector(".diagram-stage-shell.diagram-workspace")
    expect(workspace?.querySelector(":scope > .diagram-palette")).not.toBeNull()
    expect(workspace?.querySelector(":scope > .diagram-canvas-area .diagram-canvas")).not.toBeNull()
  })

  it("renders each coordinate range as a transformed Rectangle and explains both conversions", () => {
    const frames: FrameRequestCallback[] = []
    window.requestAnimationFrame = (callback) => frames.push(callback)
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(<I18nProvider><CoordinatesExample /></I18nProvider>)
    })
    act(() => frames.splice(0).forEach((frame) => frame(0)))

    const workspace = container.querySelector(".coordinate-workspace")
    const stackLayers = workspace?.querySelectorAll<HTMLCanvasElement>(".coordinate-stack-canvas canvas")
    const liveLayers = workspace?.querySelectorAll<HTMLCanvasElement>(".coordinate-canvas canvas")
    expect(workspace?.querySelectorAll(":scope > .canvas-card")).toHaveLength(2)
    expect(stackLayers).toHaveLength(3)
    expect(liveLayers).toHaveLength(2)

    const width = stackLayers?.[0].width ?? 0
    const height = stackLayers?.[0].height ?? 0
    const planeSamples = [
      { x: width * 0.07 + 8, y: height * 0.05 + 8 },
      { x: width * 0.15 + 8, y: height * 0.385 + 8 },
      { x: width * 0.23 + 8, y: height * 0.72 + 8 },
    ]
    stackLayers?.forEach((canvas, index) => {
      const { x, y } = planeSamples[index]
      expect(canvas.getContext("2d")?.getImageData(x, y, 1, 1).data[3]).toBeGreaterThan(0)
    })

    const flow = container.querySelector(".coordinate-flow")
    expect(flow?.textContent).toContain("The same pointer, expressed three ways")
    expect(flow?.textContent).toContain("Subtract the Canvas DOM origin")
    expect(flow?.textContent).toContain("Undo viewport offset and scale")
    expect(flow?.textContent).toContain("Result in the current viewport")
    expect(flow?.textContent).not.toContain("The coordinate exposed as e.point")
    expect(flow?.textContent).not.toContain("1 · Client")

    const contentBeforePan = flow?.querySelector(".coordinate-flow-result strong")?.textContent
    const pan = [...container.querySelectorAll<HTMLButtonElement>(".toolbar button")]
      .find((button) => button.textContent === "Pan +40,+20")
    act(() => pan?.click())
    act(() => frames.splice(0).forEach((frame) => frame(16)))
    expect(flow?.querySelector(".coordinate-flow-result strong")?.textContent)
      .not.toBe(contentBeforePan)
    expect(flow?.querySelectorAll(".coordinate-flow-operation code")[1]?.textContent)
      .toContain("(40, 20)")

    const contentBeforeZoom = stackLayers?.[2].toDataURL()
    const zoomIn = [...container.querySelectorAll<HTMLButtonElement>(".toolbar button")]
      .find((button) => button.textContent === "Zoom in")
    act(() => zoomIn?.click())
    act(() => frames.splice(0).forEach((frame) => frame(32)))
    expect(stackLayers?.[2].toDataURL()).not.toBe(contentBeforeZoom)
  })

  it("keeps valid coordinate evidence across capture loss and wheel input", () => {
    const restorePointerEvents = installPointerEvents()
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    try {
      act(() => {
        root?.render(<I18nProvider><CoordinatesExample /></I18nProvider>)
      })

      const liveLayers = container.querySelectorAll<HTMLCanvasElement>(".coordinate-canvas canvas")
      const top = liveLayers[liveLayers.length - 1]
      expect(top).toBeDefined()

      act(() => {
        top.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }))
        top.dispatchEvent(pointer("pointerdown", 100, 100, { button: 0, buttons: 1 }))
        top.dispatchEvent(pointer("pointermove", 150, 130, { buttons: 1 }))
      })

      const viewBeforeCancellation = container.querySelector(".coordinate-flow-view strong")?.textContent
      const viewportBeforeCancellation = [...container.querySelectorAll(".status-grid div")]
        .find((item) => item.querySelector("dt")?.textContent === "Viewport")
      expect(viewBeforeCancellation).toBe("150, 130")
      expect(viewportBeforeCancellation?.querySelector("dd")?.textContent).toBe("50, 30 / 100%")

      act(() => {
        top.dispatchEvent(pointer("lostpointercapture", 0, 0, { buttons: 1 }))
      })

      const viewportAfterCancellation = [...container.querySelectorAll(".status-grid div")]
        .find((item) => item.querySelector("dt")?.textContent === "Viewport")
      expect(container.querySelector(".coordinate-flow-view strong")?.textContent).toBe(viewBeforeCancellation)
      expect(viewportAfterCancellation?.querySelector("dd")?.textContent).toBe("0, 0 / 100%")

      act(() => {
        top.dispatchEvent(pointer("pointerdown", 200, 200, { button: 0, buttons: 1 }))
        top.dispatchEvent(pointer("pointermove", 240, 230, { buttons: 1 }))
        top.dispatchEvent(pointer("lostpointercapture", 0, 0, { buttons: 0 }))
      })

      const viewportAfterRelease = [...container.querySelectorAll(".status-grid div")]
        .find((item) => item.querySelector("dt")?.textContent === "Viewport")
      const eventPoint = [...container.querySelectorAll(".status-grid div")]
        .find((item) => item.querySelector("dt")?.textContent === "Last event e.point")
      expect(container.querySelector(".coordinate-flow-view strong")?.textContent).toBe("240, 230")
      expect(viewportAfterRelease?.querySelector("dd")?.textContent).toBe("40, 30 / 100%")
      expect(eventPoint?.querySelector("dd")?.textContent).toBe("200, 200")

      const reset = [...container.querySelectorAll<HTMLButtonElement>(".toolbar button")]
        .find((button) => button.textContent === "Reset view")
      act(() => reset?.click())
      expect(eventPoint?.querySelector("dd")?.textContent).toBe("200, 200")

      act(() => {
        top.dispatchEvent(new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: 80,
          clientY: 90,
          deltaY: -100,
        }))
      })
      expect(eventPoint?.querySelector("dd")?.textContent).toBe("80, 90")
    } finally {
      restorePointerEvents()
    }
  })

  it("keeps Motion layers, Canvas, inspector, and timeline in one fixed workspace", async () => {
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(<I18nProvider><MotionStudioExample /></I18nProvider>)
    })

    const workspace = container.querySelector(".motion-workspace")
    expect(workspace?.querySelector(":scope > .motion-layers")).not.toBeNull()
    expect(workspace?.querySelector(":scope > .motion-stage-area .motion-canvas")).not.toBeNull()
    expect(workspace?.querySelector(":scope > .motion-inspector")).not.toBeNull()
    expect(workspace?.querySelector(":scope > .motion-timeline")).not.toBeNull()
    expect(workspace?.querySelectorAll(".motion-keyframe")).toHaveLength(9)
    const exportFrame = [...workspace?.querySelectorAll<HTMLButtonElement>(".motion-document-actions button") ?? []]
      .find((button) => button.textContent === "Export PNG")
    expect(exportFrame).toBeDefined()
    await act(async () => {
      exportFrame?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(anchorClick).toHaveBeenCalledOnce()
    const link = anchorClick.mock.contexts[0] as HTMLAnchorElement
    expect(link.download).toBe("motion-frame-0ms.png")
    expect(link.href).toMatch(/^data:image\/png/)
  })

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

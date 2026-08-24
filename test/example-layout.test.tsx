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
import { type ExampleDefinition } from "../example/src/examples/types"
import { I18nProvider } from "../example/src/i18n"

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

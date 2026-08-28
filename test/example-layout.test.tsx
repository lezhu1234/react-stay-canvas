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
import {
  createPlaneDefinitions,
  expandRangeToAspect,
} from "../example/src/examples/simple/CoordinateStack"
import {
  createFiniteProjectiveMapping,
  mapProjectiveLocalToContentPoint,
} from "../src/stay/transforms/projective2D"
import CoordinatesExample from "../example/src/examples/simple/CoordinatesExample"
import {
  clippedRectEdges,
  clientReferenceRange,
  containsRect,
  correspondingRectCorners,
  LAB_CONTENT_BOUNDS,
  LAB_SHAPE,
  projectContentRect,
  projectClientPlane,
} from "../example/src/examples/simple/coordinateLabModel"
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
let viewportHeight = 480
let viewportWidth = 920

beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  window.localStorage.clear()
  window.requestAnimationFrame = () => 1
  window.cancelAnimationFrame = () => {}
  viewportHeight = 480
  viewportWidth = 920
  originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight")
  originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth")
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return this.classList?.contains("canvas-viewport") ? viewportHeight : 0
    },
  })
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return this.classList?.contains("canvas-viewport") ? viewportWidth : 0
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
  it("projects coordinate planes toward a vertical perspective vanishing direction", () => {
    const plane = createPlaneDefinitions(728, 180).client
    expect(plane.placement.type).toBe("projective")
    if (plane.placement.type !== "projective") return
    const mapping = createFiniteProjectiveMapping(
      plane.placement.matrix,
      plane.placement.domain,
    )
    const nearTop = mapProjectiveLocalToContentPoint(mapping, { x: 0, y: 0 })!
    const nearBottom = mapProjectiveLocalToContentPoint(mapping, { x: 0, y: plane.height })!
    const farTop = mapProjectiveLocalToContentPoint(mapping, { x: plane.width, y: 0 })!
    const farBottom = mapProjectiveLocalToContentPoint(mapping, {
      x: plane.width,
      y: plane.height,
    })!

    expect(nearBottom.y - nearTop.y).toBeGreaterThan(farBottom.y - farTop.y)
    expect(nearTop.y).toBeLessThan(farTop.y)
    expect(nearBottom.y).toBeGreaterThan(farBottom.y)
    expect(plane.placement.matrix.m20).not.toBe(0)
  })

  it("fits the projected plane bounds inside a height-constrained stack", () => {
    const canvasHeight = 80
    const plane = createPlaneDefinitions(728, canvasHeight).client
    expect(plane.placement.type).toBe("projective")
    if (plane.placement.type !== "projective") return
    const mapping = createFiniteProjectiveMapping(
      plane.placement.matrix,
      plane.placement.domain,
    )

    expect(mapping.contentBounds.y).toBeGreaterThanOrEqual(-Number.EPSILON)
    expect(mapping.contentBounds.y + mapping.contentBounds.height)
      .toBeLessThanOrEqual(canvasHeight + Number.EPSILON)
  })

  it("defines a bounded Content scene and connects all corresponding plane corners", () => {
    const fittedRange = expandRangeToAspect({ x: 100, y: 40, width: 300, height: 300 }, 4 / 3)
    expect(fittedRange.width / fittedRange.height).toBeCloseTo(4 / 3)
    expect(fittedRange.x + fittedRange.width / 2).toBe(250)
    expect(fittedRange.y + fittedRange.height / 2).toBe(190)

    expect(LAB_SHAPE.x).toBeGreaterThanOrEqual(LAB_CONTENT_BOUNDS.x)
    expect(LAB_SHAPE.y).toBeGreaterThanOrEqual(LAB_CONTENT_BOUNDS.y)
    expect(LAB_SHAPE.x + LAB_SHAPE.width)
      .toBeLessThanOrEqual(LAB_CONTENT_BOUNDS.x + LAB_CONTENT_BOUNDS.width)
    expect(LAB_SHAPE.y + LAB_SHAPE.height)
      .toBeLessThanOrEqual(LAB_CONTENT_BOUNDS.y + LAB_CONTENT_BOUNDS.height)

    expect(correspondingRectCorners(
      { x: 10, y: 20, width: 100, height: 60 },
      { x: 30, y: 40, width: 200, height: 120 },
    )).toEqual([
      { from: { x: 10, y: 20 }, to: { x: 30, y: 40 } },
      { from: { x: 110, y: 20 }, to: { x: 230, y: 40 } },
      { from: { x: 110, y: 80 }, to: { x: 230, y: 160 } },
      { from: { x: 10, y: 80 }, to: { x: 30, y: 160 } },
    ])

    expect(projectContentRect({
      client: { x: 0, y: 0 },
      view: { x: 0, y: 0 },
      content: { x: 0, y: 0 },
      viewSize: { width: 320, height: 240 },
      surface: { left: 100, top: 50, width: 640, height: 480, scaleX: 0.5, scaleY: 0.5 },
    }, { x: 40, y: 20, scale: 2 }, LAB_CONTENT_BOUNDS)).toEqual({
      content: { x: 0, y: 0, width: 480, height: 360 },
      view: { x: 40, y: 20, width: 960, height: 720 },
      client: { x: 180, y: 90, width: 1920, height: 1440 },
    })

    expect(clientReferenceRange({
      client: { x: 0, y: 0 },
      view: { x: 0, y: 0 },
      content: { x: 0, y: 0 },
      viewSize: { width: 320, height: 240 },
      surface: { left: 100, top: 50, width: 640, height: 480, scaleX: 0.5, scaleY: 0.5 },
    })).toEqual({ x: -60, y: -430, width: 960, height: 1008 })

    const initialProbe = {
      client: { x: 420, y: 320 },
      view: { x: 400, y: 300 },
      content: { x: 400, y: 300 },
      viewSize: { width: 800, height: 600 },
      surface: { left: 100, top: 80, width: 640, height: 480, scaleX: 1.25, scaleY: 1.25 },
    }
    const maxSurface = { x: 196, y: 176, width: 800, height: 600 }
    const fixedClientRange = clientReferenceRange(initialProbe, maxSurface)
    expect(containsRect(fixedClientRange, maxSurface)).toBe(true)
    const initialClientFrame = projectClientPlane(initialProbe, { x: 0, y: 0, scale: 1 }, fixedClientRange, { width: 240, height: 96 })
    const transformedClientFrame = projectClientPlane({
      ...initialProbe,
      client: { x: 340, y: 320 },
      surface: { left: 132, top: 104, width: 416, height: 432, scaleX: 800 / 416, scaleY: 600 / 432 },
    }, { x: 0, y: 0, scale: 1 }, fixedClientRange, { width: 240, height: 96 })
    expect(transformedClientFrame.canvasDom.x).toBeGreaterThan(initialClientFrame.canvasDom.x)
    expect(transformedClientFrame.canvasDom.y).toBeGreaterThan(initialClientFrame.canvasDom.y)
    expect(transformedClientFrame.canvasDom.width).toBeLessThan(initialClientFrame.canvasDom.width)
    expect(transformedClientFrame.canvasDom.height).toBeLessThan(initialClientFrame.canvasDom.height)
    expect(transformedClientFrame.shape).not.toEqual(initialClientFrame.shape)
    expect(transformedClientFrame.point).not.toEqual(initialClientFrame.point)

    expect(clippedRectEdges(
      { x: -20, y: -10, width: 120, height: 80 },
      { x: 0, y: 0, width: 80, height: 60 },
    )).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ])
    expect(clippedRectEdges(
      { x: 10, y: 10, width: 100, height: 80 },
      { x: 0, y: 0, width: 80, height: 60 },
    )).toEqual([
      { x1: 10, y1: 10, x2: 80, y2: 10 },
      undefined,
      undefined,
      { x1: 10, y1: 10, x2: 10, y2: 60 },
    ])
  })

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

  it("keeps immersive examples connected to the example catalog", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const definition: ExampleDefinition = {
      path: "/simple/immersive",
      sourcePaths: ["./ImmersiveExample.tsx"],
      group: "Simple",
      order: 1,
      presentation: "immersive",
      title: { en: "Immersive workspace", zh: "沉浸式工作区" },
      shortTitle: { en: "Immersive", zh: "沉浸式" },
      summary: { en: "An immersive workspace.", zh: "沉浸式工作区。" },
      features: ["Canvas"],
      component: () => <div />,
    }

    act(() => {
      root?.render(
        <I18nProvider>
          <ExamplePage definition={definition} sources={[{ path: definition.sourcePaths[0], source: "export default function Immersive() {}" }]} />
        </I18nProvider>,
      )
    })

    const overviewLink = container.querySelector<HTMLAnchorElement>(".immersive-overview-link")
    expect(overviewLink?.textContent).toContain("Examples")
    expect(overviewLink?.getAttribute("href")).toBe("/?example=%2F#/")
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

  it("keeps the diagram scene mounted while its logical Canvas follows the workspace", () => {
    const callbacks: ResizeObserverCallback[] = []
    const originalResizeObserver = globalThis.ResizeObserver
    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    try {
      act(() => {
        root?.render(<I18nProvider><DiagramExample /></I18nProvider>)
      })

      const workspace = container.querySelector(".diagram-stage-shell.diagram-workspace")
      const layers = workspace?.querySelectorAll<HTMLCanvasElement>(
        ":scope > .diagram-canvas-area .diagram-canvas canvas",
      )
      const initialLayers = layers ? [...layers] : []
      expect(workspace?.querySelector(":scope > .diagram-palette")).not.toBeNull()
      expect(initialLayers).toHaveLength(3)
      expect(initialLayers[0].width).toBe(920)
      expect(initialLayers[0].height).toBe(480)

      viewportWidth = 700
      viewportHeight = 360
      act(() => callbacks.forEach((callback) => callback([], {} as ResizeObserver)))

      const resizedLayers = [...workspace!.querySelectorAll<HTMLCanvasElement>(
        ":scope > .diagram-canvas-area .diagram-canvas canvas",
      )]
      expect(resizedLayers).toEqual(initialLayers)
      resizedLayers.forEach((layer) => {
        expect(layer.width).toBe(700)
        expect(layer.height).toBe(360)
      })
    } finally {
      globalThis.ResizeObserver = originalResizeObserver
    }
  })

  it("keeps Shape geometry fixed while zoom changes its View and Client projections", () => {
    const frames: FrameRequestCallback[] = []
    window.requestAnimationFrame = (callback) => frames.push(callback)
    const contextPrototype = Object.getPrototypeOf(
      document.createElement("canvas").getContext("2d")!,
    ) as CanvasRenderingContext2D
    const nativeSetLineDash = contextPrototype.setLineDash
    const setLineDash = vi.spyOn(contextPrototype, "setLineDash").mockImplementation(function (dash) {
      expect(Array.isArray(dash)).toBe(true)
      nativeSetLineDash.call(this, dash)
    })
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <React.StrictMode>
          <I18nProvider><CoordinatesExample /></I18nProvider>
        </React.StrictMode>,
      )
    })
    act(() => frames.splice(0).forEach((frame) => frame(0)))
    expect(setLineDash).toHaveBeenCalled()

    const workspace = container.querySelector(".coordinate-workspace")
    const stackCard = workspace?.querySelector(".coordinate-stack-exhibit")
    const stackLayers = workspace?.querySelectorAll<HTMLCanvasElement>(".coordinate-stack-canvas canvas")
    const liveLayers = workspace?.querySelectorAll<HTMLCanvasElement>(".coordinate-canvas canvas")
    expect(workspace?.querySelectorAll(":scope > section")).toHaveLength(2)
    expect(stackCard?.classList.contains("coordinate-focus-view-client")).toBe(true)
    expect(stackLayers).toHaveLength(3)
    expect(liveLayers).toHaveLength(2)
    expect(workspace?.querySelector(".coordinate-live-exhibit .coordinate-live-heading")?.textContent)
      .toContain("Live Canvas")
    expect(workspace?.querySelector(".coordinate-live-exhibit .canvas-viewport-label")?.textContent)
      .toBe("CLIENT DOM · 80% × 80%")
    expect(container.querySelector(".coordinate-hero")?.textContent).toContain("One point,")
    expect(container.querySelector(".coordinate-hero")?.textContent).toContain("three spaces.")
    expect(workspace?.querySelector(".coordinate-live-heading")?.textContent).toContain("CLIENT SPACE")
    const evidence = container.querySelector<HTMLElement>(".coordinate-evidence")
    const evidenceToggle = container.querySelector<HTMLButtonElement>(".coordinate-evidence-toggle")
    expect(evidence?.hidden).toBe(true)
    act(() => evidenceToggle?.click())
    expect(evidence?.hidden).toBe(false)
    expect(evidence?.textContent).toContain("Zoom changes the projection, not the Shape")
    expect(evidence?.querySelector('button[aria-label="Close evidence"]')).not.toBeNull()
    const displayTransform = workspace?.querySelector<HTMLElement>(".coordinate-live-exhibit .canvas-display-transform")
    expect(displayTransform?.dataset.displayScaleX).toBe("0.8")
    expect(displayTransform?.dataset.displayScaleY).toBe("0.8")
    expect(displayTransform?.style.transform).toBe("translate(0px, 0px) scale(0.8, 0.8)")

    stackLayers?.forEach((canvas) => {
      const pixels = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data
      expect(pixels?.some((value, index) => index % 4 === 3 && value > 0)).toBe(true)
    })

    const flow = container.querySelector(".coordinate-flow")
    expect(flow?.textContent).toContain("Coordinates")
    expect(flow?.textContent).toContain("Subtract the Canvas DOM origin")
    expect(flow?.textContent).toContain("Undo viewport offset and scale")
    expect(flow?.textContent).toContain("Scene result")
    expect(flow?.textContent).not.toContain("The coordinate exposed as e.point")
    expect(flow?.textContent).not.toContain("1 · Client")

    const proofRows = [...container.querySelectorAll(".coordinate-zoom-proof dl > div")]
    const proofValue = (label: string) => proofRows
      .find((item) => item.querySelector("dt")?.textContent === label)
      ?.querySelector("dd")?.textContent
    const contentGeometry = proofValue("Content Shape geometry")
    const viewProjection = proofValue("View projection")
    const clientFootprint = proofValue("Client footprint")
    const visibleWindow = proofValue("Visible Content window")
    const clientReferenceBeforeCss = proofRows
      .find((item) => item.querySelector("dt")?.textContent === "CSS View to Client")
      ?.querySelector("small")?.textContent
    expect(contentGeometry).toBe("145, 155 / 190×120")
    expect(container.querySelector(".coordinate-proof-stable small")?.textContent)
      .toContain("Demo Content bounds 0, 0 / 480×360")
    expect(container.querySelector(".coordinate-proof-stable small")?.textContent)
      .toContain("Root itself has no geometry")
    expect(proofRows
      .find((item) => item.querySelector("dt")?.textContent === "CSS View to Client")
      ?.querySelector("code")?.textContent)
      .toContain("CSS scale")

    liveLayers?.forEach((layer) => {
      vi.spyOn(layer, "getBoundingClientRect").mockImplementation(() => {
        const scaleX = Number(displayTransform?.dataset.displayScaleX)
        const scaleY = Number(displayTransform?.dataset.displayScaleY)
        const left = Number(displayTransform?.dataset.displayOffsetX)
        const top = Number(displayTransform?.dataset.displayOffsetY)
        const width = layer.width * scaleX
        const height = layer.height * scaleY
        return {
          bottom: top + height,
          height,
          left,
          right: left + width,
          top,
          width,
          x: left,
          y: top,
          toJSON: () => ({}),
        } as DOMRect
      })
    })

    const scaleXInput = container.querySelector<HTMLInputElement>('input[aria-label="CSS scale X"]')
    const scaleYInput = container.querySelector<HTMLInputElement>('input[aria-label="CSS scale Y"]')
    const offsetXInput = container.querySelector<HTMLInputElement>('input[aria-label="CSS translate X"]')
    const offsetYInput = container.querySelector<HTMLInputElement>('input[aria-label="CSS translate Y"]')
    const setInputValue = (input: HTMLInputElement | null, value: string) => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
      setValue?.call(input, value)
      input?.dispatchEvent(new Event("input", { bubbles: true }))
    }
    act(() => {
      setInputValue(scaleXInput, "65")
      setInputValue(scaleYInput, "90")
      setInputValue(offsetXInput, "32")
      setInputValue(offsetYInput, "24")
    })
    expect(stackCard?.classList.contains("coordinate-focus-view-client")).toBe(true)
    expect(displayTransform?.style.transform).toBe("translate(32px, 24px) scale(0.65, 0.9)")
    expect(workspace?.querySelector(".coordinate-live-exhibit .canvas-viewport-label")?.textContent)
      .toBe("CLIENT DOM · 65% × 90%")
    expect(proofRows
      .find((item) => item.querySelector("dt")?.textContent === "CSS View to Client")
      ?.querySelector("code")?.textContent)
      .toContain("CSS scale 0.65 × 0.90")
    expect(proofRows
      .find((item) => item.querySelector("dt")?.textContent === "CSS View to Client")
      ?.querySelector("small")?.textContent)
      .toBe(clientReferenceBeforeCss)
    expect(proofValue("Client footprint")).not.toBe(clientFootprint)

    const resetCss = [...container.querySelectorAll<HTMLButtonElement>(".coordinate-operations button")]
      .find((button) => button.textContent === "Reset")
    act(() => resetCss?.click())
    expect(displayTransform?.style.transform).toBe("translate(0px, 0px) scale(0.8, 0.8)")

    const canvasBeforeIdentity = liveLayers?.[liveLayers.length - 1]
    const identityPan = [...container.querySelectorAll<HTMLButtonElement>(".coordinate-operations button")]
      .find((button) => button.textContent === "pan")
    act(() => identityPan?.click())
    expect(stackCard?.classList.contains("coordinate-focus-content-view")).toBe(true)
    expect(proofValue("Viewport")).toBe("40, 20 / 100%")
    act(() => {
      setInputValue(scaleXInput, "100")
      setInputValue(scaleYInput, "100")
    })
    expect(stackCard?.classList.contains("coordinate-focus-view-client")).toBe(true)
    expect(displayTransform?.style.transform).toBe("translate(0px, 0px) scale(1, 1)")
    expect(container.querySelectorAll<HTMLCanvasElement>(".coordinate-canvas canvas")[1])
      .toBe(canvasBeforeIdentity)
    expect(proofValue("Viewport")).toBe("40, 20 / 100%")
    expect(proofValue("Content Shape geometry")).toBe(contentGeometry)
    act(() => {
      resetCss?.click()
      const resetView = [...container.querySelectorAll<HTMLButtonElement>(".coordinate-operations button")]
        .find((button) => button.textContent === "reset")
      resetView?.click()
    })

    const contentPlaneBeforeZoom = stackLayers?.[2].toDataURL()
    const zoomIn = [...container.querySelectorAll<HTMLButtonElement>(".toolbar button")]
      .find((button) => button.textContent === "zoom in")
    act(() => zoomIn?.click())
    expect(stackCard?.classList.contains("coordinate-focus-content-view")).toBe(true)
    act(() => frames.splice(0).forEach((frame) => frame(16)))
    expect(proofValue("Content Shape geometry")).toBe(contentGeometry)
    expect(proofValue("View projection")).not.toBe(viewProjection)
    expect(proofValue("View projection")).toContain("228×144")
    expect(proofValue("Client footprint")).not.toBe(clientFootprint)
    expect(proofValue("Visible Content window")).not.toBe(visibleWindow)
    expect(stackLayers?.[2].toDataURL()).not.toBe(contentPlaneBeforeZoom)

    const reset = [...container.querySelectorAll<HTMLButtonElement>(".toolbar button")]
      .find((button) => button.textContent === "reset")
    act(() => reset?.click())

    const zoomOut = [...container.querySelectorAll<HTMLButtonElement>(".toolbar button")]
      .find((button) => button.textContent === "zoom out")
    act(() => {
      for (let click = 0; click < 6; click += 1) zoomOut?.click()
    })
    expect(proofValue("Viewport")).toContain("40%")
    expect(proofRows
      .find((item) => item.querySelector("dt")?.textContent === "Visible Content window")
      ?.querySelector("small")?.textContent)
      .toContain("Fully shown in the fixed reference")
    expect(proofValue("Content Shape geometry")).toBe(contentGeometry)
    act(() => reset?.click())

    const contentBeforePan = flow?.querySelector(".coordinate-flow-result strong")?.textContent
    const pan = [...container.querySelectorAll<HTMLButtonElement>(".toolbar button")]
      .find((button) => button.textContent === "pan")
    act(() => pan?.click())
    act(() => frames.splice(0).forEach((frame) => frame(16)))
    expect(flow?.querySelector(".coordinate-flow-result strong")?.textContent)
      .not.toBe(contentBeforePan)
    expect(flow?.querySelectorAll(".coordinate-flow-operation code")[1]?.textContent)
      .toContain("(40, 20)")
  })

  it("recreates responsive coordinate canvases when their surfaces resize", () => {
    const callbacks: ResizeObserverCallback[] = []
    const originalResizeObserver = globalThis.ResizeObserver
    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver

    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    try {
      act(() => {
        root?.render(<I18nProvider><CoordinatesExample /></I18nProvider>)
      })

      expect(container.querySelector<HTMLCanvasElement>(".coordinate-canvas canvas")?.width).toBe(920)
      expect(container.querySelector<HTMLCanvasElement>(".coordinate-canvas canvas")?.height).toBe(480)

      viewportWidth = 210
      viewportHeight = 81
      act(() => callbacks.forEach((callback) => callback([], {} as ResizeObserver)))

      expect(container.querySelector<HTMLCanvasElement>(".coordinate-canvas canvas")?.width).toBe(210)
      expect(container.querySelector<HTMLCanvasElement>(".coordinate-canvas canvas")?.height).toBe(81)
      expect(container.querySelector<HTMLCanvasElement>(".coordinate-stack-canvas canvas")?.width).toBe(210)
      expect(container.querySelector<HTMLCanvasElement>(".coordinate-stack-canvas canvas")?.height).toBe(81)
      expect([...container.querySelectorAll(".coordinate-zoom-proof dl > div")]
        .find((item) => item.querySelector("dt")?.textContent === "Viewport")
        ?.querySelector("dd")?.textContent)
        .toBe("9, -31 / 40%")
    } finally {
      globalThis.ResizeObserver = originalResizeObserver
    }
  })

  it("keeps reporting pointer samples outside the finite coordinate planes", () => {
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
      const surface = { left: 20, top: 30, width: top.width * 0.8, height: top.height * 0.8 }
      const clientRect = {
        ...surface,
        bottom: surface.top + surface.height,
        right: surface.left + surface.width,
        x: surface.left,
        y: surface.top,
        toJSON: () => ({}),
      } as DOMRect
      liveLayers.forEach((layer) => {
        vi.spyOn(layer, "getBoundingClientRect").mockReturnValue(clientRect)
      })
      const outside = {
        x: clientRect.right + 80,
        y: clientRect.bottom + 60,
      }

      act(() => {
        top.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }))
        top.dispatchEvent(pointer("pointerdown", clientRect.left + 40, clientRect.top + 40, {
          button: 0,
          buttons: 1,
        }))
        top.dispatchEvent(pointer("pointermove", outside.x, outside.y, { buttons: 1 }))
      })

      expect(container.querySelector(".coordinate-flow-client strong")?.textContent)
        .toBe(`${outside.x}, ${outside.y}`)
    } finally {
      restorePointerEvents()
    }
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
      const surface = {
        left: 20,
        top: 30,
        width: top.width * 0.8,
        height: top.height * 0.8,
      }
      const clientRect = {
        ...surface,
        bottom: surface.top + surface.height,
        right: surface.left + surface.width,
        x: surface.left,
        y: surface.top,
        toJSON: () => ({}),
      } as DOMRect
      liveLayers.forEach((layer) => {
        vi.spyOn(layer, "getBoundingClientRect").mockReturnValue(clientRect)
      })

      act(() => {
        top.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }))
        top.dispatchEvent(pointer("pointerdown", 100, 100, { button: 0, buttons: 1 }))
        top.dispatchEvent(pointer("pointermove", 150, 130, { buttons: 1 }))
      })

      const viewBeforeCancellation = container.querySelector(".coordinate-flow-view strong")?.textContent
      const viewportBeforeCancellation = [...container.querySelectorAll(".coordinate-zoom-proof dl > div")]
        .find((item) => item.querySelector("dt")?.textContent === "Viewport")
      expect(container.querySelector(".coordinate-flow-client strong")?.textContent).toBe("150, 130")
      expect(viewBeforeCancellation).toBe("163, 125")
      expect(viewportBeforeCancellation?.querySelector("dd")?.textContent).toBe("63, 38 / 100%")
      expect(container.querySelector(".coordinate-flow-operation span")?.textContent)
        .toContain("inverse CSS scale")
      expect(container.querySelector(".coordinate-flow-operation code")?.textContent)
        .toContain("× (1.25, 1.25)")
      expect(container.querySelector(".coordinate-proof-client-map code")?.textContent)
        .toContain("CSS scale 0.80 × 0.80")

      act(() => {
        top.dispatchEvent(pointer("lostpointercapture", 0, 0, { buttons: 1 }))
      })

      const viewportAfterCancellation = [...container.querySelectorAll(".coordinate-zoom-proof dl > div")]
        .find((item) => item.querySelector("dt")?.textContent === "Viewport")
      expect(container.querySelector(".coordinate-flow-view strong")?.textContent).toBe(viewBeforeCancellation)
      expect(viewportAfterCancellation?.querySelector("dd")?.textContent).toBe("0, 0 / 100%")

      act(() => {
        top.dispatchEvent(pointer("pointerdown", 200, 200, { button: 0, buttons: 1 }))
        top.dispatchEvent(pointer("pointermove", 240, 230, { buttons: 1 }))
        top.dispatchEvent(pointer("lostpointercapture", 0, 0, { buttons: 0 }))
      })

      const viewportAfterRelease = [...container.querySelectorAll(".coordinate-zoom-proof dl > div")]
        .find((item) => item.querySelector("dt")?.textContent === "Viewport")
      const eventPoint = container.querySelector(".coordinate-event-sample code")
      expect(container.querySelector(".coordinate-flow-view strong")?.textContent).toBe("275, 250")
      expect(viewportAfterRelease?.querySelector("dd")?.textContent).toBe("50, 38 / 100%")
      expect(eventPoint?.textContent).toBe("225, 213")

      const reset = [...container.querySelectorAll<HTMLButtonElement>(".toolbar button")]
        .find((button) => button.textContent === "reset")
      act(() => reset?.click())
      expect(eventPoint?.textContent).toBe("225, 213")

      act(() => {
        top.dispatchEvent(new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: 80,
          clientY: 90,
          deltaY: -100,
        }))
      })
      expect(eventPoint?.textContent).toBe("75, 75")
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

    expect(container.querySelector(".canvas-display-transform")).toBeNull()
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

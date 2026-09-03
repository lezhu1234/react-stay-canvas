// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  Line,
  Point,
  Rectangle,
  StayCanvas,
  TransparentImageMaterial,
  type MeshGeometryInput,
  type StayTools,
  type ViewportState,
} from "react-stay-canvas"

import {
  Button,
  CanvasCard,
  CanvasSurface,
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
  coverImageSourceRect,
  coordinateOutputGlassMaterial,
  coordinatePlaneEdgeSupport,
  coordinateRoomBackdropGeometry,
  coordinateRoomBackdropCrop,
  coordinatePlaneGlassMaterial,
  createCoordinatePlaneEdgeTexture,
  createPlaneDefinitions,
  createCoordinateSignalPath,
  expandRangeToAspect,
} from "../example/src/examples/simple/CoordinateStack"
import {
  COORDINATE_CONSOLE_CONTROL_NAMES,
  coordinateConsoleControlRects,
  coordinateConsoleIsCompact,
  createFrontFacingPanelDefinition,
  createCoordinateSceneLayout,
  createPlaneBevelFaceProfile,
  createPlaneBasis,
  planeVolumeGeometry,
  planeVolumeProfileGeometry,
  planePresentationMetrics,
  projectPlanePoint,
  rectMeshGeometry,
  roundedRectMeshGeometry,
  screenFacingWorldQuad,
  worldLineMeshGeometry,
  type CoordinateConsoleControlName,
} from "../example/src/examples/simple/coordinateSceneModel"
import {
  createFiniteProjectiveMapping,
  mapProjectiveLocalToContentPoint,
} from "../src/stay/transforms/projective2D"
import { CoordinateSystem } from "../src/stay/coordinates/coordinateSystem"
import CoordinatesExample, {
  coordinateContentBoundsStyle,
} from "../example/src/examples/simple/CoordinatesExample"
import { getExampleByPath } from "../example/src/examples/catalog"
import {
  clippedRectEdges,
  clientReferenceRange,
  COORDINATE_PLANE_DOMAIN,
  containsRect,
  coordinatePlaneRange,
  correspondingRectCorners,
  LAB_CONTENT_BOUNDS,
  LAB_SHAPE,
  projectCoordinatePlanePoint,
  projectCoordinatePlaneRect,
  projectClientPlane,
  readCoordinateEvidence,
  type CoordinateProbe,
} from "../example/src/examples/simple/coordinateLabModel"
import { type ExampleDefinition } from "../example/src/examples/types"
import { I18nProvider } from "../example/src/i18n"
import { installPointerEvents, pointer } from "./helpers/pointer"
import { createRecordingWebGL2Context } from "./helpers/webgl"

vi.stubGlobal("OffscreenCanvas", class {
  constructor(public width: number, public height: number) {}
  getContext() {
    return { measureText: () => ({ width: 56, fontBoundingBoxAscent: 10, fontBoundingBoxDescent: 2 }) }
  }
})

vi.stubGlobal("Path2D", class {
  moveTo() {}
  lineTo() {}
})

let root: Root | undefined
let originalClientHeight: PropertyDescriptor | undefined
let originalClientWidth: PropertyDescriptor | undefined
let viewportHeight = 480
let viewportWidth = 920
let webGL2Contexts = new Map<HTMLCanvasElement, ReturnType<typeof createRecordingWebGL2Context>>()

function expectValidIndexedGeometry(geometry: MeshGeometryInput) {
  const positions = Array.from(geometry.positions)
  const normals = Array.from(geometry.normals ?? [])
  const indices = Array.from(geometry.indices ?? [])
  const vertexCount = positions.length / 3

  expect(positions.every(Number.isFinite)).toBe(true)
  expect(normals.every(Number.isFinite)).toBe(true)
  expect(normals).toHaveLength(positions.length)
  expect(indices.length % 3).toBe(0)
  expect(indices.every((index) => Number.isInteger(index) && index >= 0 && index < vertexCount))
    .toBe(true)

  for (let offset = 0; offset < indices.length; offset += 3) {
    const [firstIndex, secondIndex, thirdIndex] = indices.slice(offset, offset + 3)
    const point = (index: number) => positions.slice(index * 3, index * 3 + 3)
    const first = point(firstIndex)
    const second = point(secondIndex)
    const third = point(thirdIndex)
    const along = second.map((value, index) => value - first[index])
    const across = third.map((value, index) => value - first[index])
    const faceNormal = [
      along[1] * across[2] - along[2] * across[1],
      along[2] * across[0] - along[0] * across[2],
      along[0] * across[1] - along[1] * across[0],
    ]
    const area = Math.hypot(...faceNormal)
    const storedNormal = normals.slice(firstIndex * 3, firstIndex * 3 + 3)
    const alignment = faceNormal.reduce(
      (sum, value, index) => sum + value * storedNormal[index],
      0,
    )

    expect(area).toBeGreaterThan(1e-8)
    expect(alignment).toBeGreaterThan(0)
  }
}

function coordinateEvidenceFromLibrary(
  probe: Readonly<CoordinateProbe>,
  viewport: Readonly<ViewportState>,
  contentShape = LAB_SHAPE,
) {
  const system = new CoordinateSystem()
  system.restore({ ...viewport })
  const metrics = {
    logicalWidth: probe.viewSize.width,
    logicalHeight: probe.viewSize.height,
    backingWidth: probe.viewSize.width,
    backingHeight: probe.viewSize.height,
    clientRect: {
      left: probe.surface.left,
      top: probe.surface.top,
      width: probe.surface.width,
      height: probe.surface.height,
    },
  }
  const frame = system.getFrame(metrics)
  return readCoordinateEvidence({
    contentToClient: (point) => system.contentToClient(point, metrics, frame),
    contentToView: (point) => system.contentToView(point, frame),
    viewToContent: (point) => system.viewToContent(point, frame),
  }, probe.viewSize, contentShape, LAB_CONTENT_BOUNDS)
}

function clickCoordinateConsoleControl({
  canvas,
  name,
  viewHeight,
  viewWidth,
  xRatio = 0.5,
}: {
  canvas: HTMLCanvasElement
  name: CoordinateConsoleControlName
  viewHeight: number
  viewWidth: number
  xRatio?: number
}) {
  const frame = createCoordinateSceneLayout(viewWidth, viewHeight).console
  const target = coordinateConsoleControlRects(frame)[name]
  const targetX = name === "scale-x" || name === "scale-y" || name === "translate-x"
    ? target.x + 8 + (target.width - 16) * xRatio
    : target.x + target.width * xRatio
  const targetY = target.y + target.height / 2
  const clientRect = canvas.getBoundingClientRect()
  const clientWidth = clientRect.width || viewWidth
  const clientHeight = clientRect.height || viewHeight
  const clientX = clientRect.left + targetX / viewWidth * clientWidth
  const clientY = clientRect.top + targetY / viewHeight * clientHeight

  act(() => {
    canvas.dispatchEvent(pointer("pointerdown", clientX, clientY, { button: 0, buttons: 1 }))
    canvas.dispatchEvent(pointer("pointerup", clientX, clientY, { button: 0, buttons: 0 }))
  })
}

beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  window.localStorage.clear()
  window.requestAnimationFrame = () => 1
  window.cancelAnimationFrame = () => {}
  viewportHeight = 480
  viewportWidth = 920
  webGL2Contexts = new Map()
  const nativeGetContext = HTMLCanvasElement.prototype.getContext
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
    contextId: string,
    ...args: unknown[]
  ) {
    if (contextId === "webgl2") {
      let recording = webGL2Contexts.get(this)
      if (!recording) {
        recording = createRecordingWebGL2Context(this)
        webGL2Contexts.set(this, recording)
      }
      return recording.context
    }
    return (nativeGetContext as (...parameters: unknown[]) => unknown)
      .call(this, contextId, ...args)
  } as typeof HTMLCanvasElement.prototype.getContext)
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
  it("shows Content bounds only while the Content-to-View mapping owns focus", () => {
    expect(coordinateContentBoundsStyle("view-client")).toMatchObject({
      fillConfig: { color: { a: 0 } },
      strokeConfig: { color: { a: 0 }, lineWidth: 1 },
    })
    expect(coordinateContentBoundsStyle("content-view")).toMatchObject({
      fillConfig: { color: { a: 0.006 } },
      strokeConfig: { color: { a: 0.18 }, lineWidth: 1 },
    })
  })

  it("keeps the logical coordinate domain independent from visual stage geometry", () => {
    const probe: CoordinateProbe = {
      client: { x: 1262, y: 398 },
      view: { x: 300, y: 150 },
      content: { x: 240, y: 120 },
      viewSize: { width: 480, height: 458 },
      surface: { left: 954, top: 140, width: 480, height: 458, scaleX: 1, scaleY: 1 },
    }
    const viewport = { x: 0, y: 0, scale: 1.25 }
    const clientRange = clientReferenceRange(probe)
    const shapeProjection = coordinateEvidenceFromLibrary(probe, viewport).shape
    const composeProjection = (
      definitions: ReturnType<typeof createPlaneDefinitions>,
    ) => Object.fromEntries(
      (["client", "view", "content"] as const).map((name) => {
        const range = coordinatePlaneRange(
          name,
          COORDINATE_PLANE_DOMAIN,
          probe,
          clientRange,
        )
        const point = projectCoordinatePlanePoint(probe[name], range, COORDINATE_PLANE_DOMAIN)
        const shape = projectCoordinatePlaneRect(
            shapeProjection[name],
            range,
            COORDINATE_PLANE_DOMAIN,
          )
        return [name, {
          physicalPoint: projectPlanePoint(definitions[name], point),
          semantic: { point, range, shape },
        }]
      }),
    )
    const compact = createPlaneDefinitions(460, 330, COORDINATE_PLANE_DOMAIN)
    const expanded = createPlaneDefinitions(1214, 478, COORDINATE_PLANE_DOMAIN)
    const compactComposition = composeProjection(compact)
    const expandedComposition = composeProjection(expanded)
    const semantics = (composition: typeof compactComposition) => Object.fromEntries(
      Object.entries(composition).map(([name, value]) => [name, value.semantic]),
    )
    const physicalPoints = (composition: typeof compactComposition) => Object.fromEntries(
      Object.entries(composition).map(([name, value]) => [name, value.physicalPoint]),
    )

    expect(semantics(expandedComposition)).toEqual(semantics(compactComposition))
    expect(physicalPoints(expandedComposition)).not.toEqual(physicalPoints(compactComposition))
  })

  it("projects coordinate planes toward a vertical perspective vanishing direction", () => {
    const plane = createPlaneDefinitions(728, 400, COORDINATE_PLANE_DOMAIN).client
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

  it("scales plane presentation from projected stage width instead of the logical domain", () => {
    const compact = createPlaneDefinitions(460, 330, COORDINATE_PLANE_DOMAIN)
    const expanded = createPlaneDefinitions(1214, 478, COORDINATE_PLANE_DOMAIN)
    const compactMetrics = planePresentationMetrics(compact.client)
    const expandedMetrics = planePresentationMetrics(expanded.client)

    expect(compact.client.width).toBe(expanded.client.width)
    expect(expandedMetrics.projectedWidth).toBeGreaterThan(compactMetrics.projectedWidth)
    expect(expandedMetrics.titleSize).toBeGreaterThan(compactMetrics.titleSize)
    expect(expandedMetrics.detailSize).toBeGreaterThan(compactMetrics.detailSize)
    expect(expandedMetrics.dotRadius).toBeGreaterThan(compactMetrics.dotRadius)
  })

  it("keeps projected panel width stable as a narrow source surface grows taller", () => {
    const short = planePresentationMetrics(
      createPlaneDefinitions(800, 450, COORDINATE_PLANE_DOMAIN).client,
    )
    const tall = planePresentationMetrics(
      createPlaneDefinitions(800, 550, COORDINATE_PLANE_DOMAIN).client,
    )

    expect(tall.projectedWidth).toBeGreaterThan(short.projectedWidth * 0.95)
    expect(tall.projectedWidth).toBeLessThan(short.projectedWidth * 1.05)
  })

  it("cover-crops the WebGL room backdrop without distorting it", () => {
    expect(coverImageSourceRect(1503, 1047, 1440, 1000)).toMatchObject({
      x: 0,
      width: 1503,
    })
    const wide = coverImageSourceRect(1503, 1047, 1280, 720)
    expect(wide.x).toBe(0)
    expect(wide.y).toBeGreaterThan(0)
    expect(wide.width / wide.height).toBeCloseTo(1280 / 720)
    const focused = coordinateRoomBackdropCrop(1503, 1047, 1440, 1000)
    expect(focused.width / focused.height).toBeCloseTo(1440 / 1000)
    expect(focused.x).toBeGreaterThan(200)
    expect(focused.y).toBeGreaterThan(100)
    expect(focused.width).toBeLessThan(1503)
    expect(focused.x + focused.width).toBeCloseTo(1503)
    expect(() => coverImageSourceRect(0, 1047, 1280, 720)).toThrow(RangeError)
  })

  it("places the cropped room image on a full-view camera-facing WebGL quad", () => {
    const geometry = coordinateRoomBackdropGeometry(1503, 1047, 1440, 1000)
    const expectedQuad = screenFacingWorldQuad(
      1440,
      1000,
      { x: 0, y: 0, width: 1440, height: 1000 },
      19,
    )
    expect(geometry.positions).toEqual(expectedQuad.flat())
    expect(geometry.indices).toEqual([0, 1, 2, 0, 2, 3])
    expect(geometry.uvs).toHaveLength(8)
    expect(geometry.uvs[0]).toBeGreaterThanOrEqual(0)
    expect(geometry.uvs[1]).toBeGreaterThan(0)
    expect(geometry.uvs[2]).toBeLessThanOrEqual(1)
    expect(geometry.uvs[5]).toBeLessThanOrEqual(1)
    expect(expectedQuad.every((point) => point[2] === -19)).toBe(true)
  })

  it("places the Output frame front-on at the shared WebGL ground", () => {
    const definitions = createPlaneDefinitions(1390, 578, COORDINATE_PLANE_DOMAIN)
    const output = createFrontFacingPanelDefinition(
      1390,
      578,
      { x: 958, y: 58, width: 420, height: 482 },
      definitions,
    )
    const basis = createPlaneBasis(output)

    expect(output.worldQuad[2][1]).toBeCloseTo(definitions.client.worldQuad[3][1])
    expect(output.worldQuad[3][1]).toBeCloseTo(definitions.client.worldQuad[3][1])
    expect(output.worldQuad.every((point) => point[2] === output.worldQuad[0][2])).toBe(true)
    expect(basis.normal[0]).toBeCloseTo(0)
    expect(basis.normal[1]).toBeCloseTo(0)
    expect(basis.normal[2]).toBeCloseTo(1)
  })

  it("fits the projected plane bounds inside a height-constrained stack", () => {
    const canvasHeight = 80
    const plane = createPlaneDefinitions(728, canvasHeight, COORDINATE_PLANE_DOMAIN).client
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

  it("stages equivalent coordinate planes as a readable perspective sequence", () => {
    const definitions = createPlaneDefinitions(1012, 524, COORDINATE_PLANE_DOMAIN)
    const bounds = (["client", "view", "content"] as const).map((name) => {
      const placement = definitions[name].placement
      expect(placement.type).toBe("projective")
      if (placement.type !== "projective") throw new Error("expected projective plane")
      return createFiniteProjectiveMapping(placement.matrix, placement.domain).contentBounds
    })

    expect(bounds[0].y).toBeLessThan(bounds[1].y)
    expect(bounds[1].y).toBeLessThan(bounds[2].y)
    expect(bounds[0].width).toBeGreaterThan(bounds[1].width)
    expect(bounds[1].width).toBeGreaterThan(bounds[2].width)
    expect(bounds[2].width).toBeLessThan(bounds[0].width * 0.7)
    const overlaps = bounds.slice(0, -1).map((bound, index) =>
      bound.x + bound.width - bounds[index + 1].x)
    overlaps.forEach((overlap, index) => {
      expect(overlap).toBeGreaterThan(-Math.min(bounds[index].width, bounds[index + 1].width) * 0.25)
      expect(overlap).toBeLessThan(Math.min(bounds[index].width, bounds[index + 1].width) * 0.25)
    })
    expect(bounds[0].x).toBeLessThan(bounds[1].x)
    expect(bounds[1].x).toBeLessThan(bounds[2].x)
    const panelTops = bounds.map((bound) => bound.y)
    const panelGrounds = bounds.map((bound) => bound.y + bound.height)
    const topSpread = Math.max(...panelTops) - Math.min(...panelTops)
    const groundSpread = Math.max(...panelGrounds) - Math.min(...panelGrounds)
    expect(topSpread).toBeGreaterThan(35)
    expect(groundSpread).toBeGreaterThan(50)
    const dimensions = Object.values(definitions).map((definition) => ({
      width: Math.hypot(
        definition.worldQuad[1][0] - definition.worldQuad[0][0],
        definition.worldQuad[1][2] - definition.worldQuad[0][2],
      ),
      height: definition.worldQuad[3][1] - definition.worldQuad[0][1],
    }))
    dimensions.slice(1).forEach((dimension) => {
      expect(dimension.width).toBeCloseTo(dimensions[0].width)
      expect(dimension.height).toBeCloseTo(dimensions[0].height)
    })

    const expanded = createPlaneDefinitions(1440, 1000, COORDINATE_PLANE_DOMAIN)
    const expandedDimensions = Object.values(expanded).map((definition) => ({
      width: Math.hypot(
        definition.worldQuad[1][0] - definition.worldQuad[0][0],
        definition.worldQuad[1][2] - definition.worldQuad[0][2],
      ),
      height: definition.worldQuad[3][1] - definition.worldQuad[0][1],
    }))
    expandedDimensions.slice(1).forEach((dimension) => {
      expect(dimension.width).toBeCloseTo(expandedDimensions[0].width)
      expect(dimension.height).toBeCloseTo(expandedDimensions[0].height)
    })
  })

  it("scales the expanded coordinate world to the full-height surface without clipping", () => {
    const compact = createPlaneDefinitions(1220, 385, COORDINATE_PLANE_DOMAIN)
    const expandedHeight = 578
    const expanded = createPlaneDefinitions(1390, expandedHeight, COORDINATE_PLANE_DOMAIN)
    const wideButShort = createPlaneDefinitions(1390, 385, COORDINATE_PLANE_DOMAIN)
    const narrowButTall = createPlaneDefinitions(1220, expandedHeight, COORDINATE_PLANE_DOMAIN)
    const compactGrounds = Object.values(compact).map((definition) => definition.worldQuad[3][1])
    const expandedGrounds = Object.values(expanded).map((definition) => definition.worldQuad[3][1])

    expect(Math.max(...compactGrounds) - Math.min(...compactGrounds)).toBeCloseTo(0)
    expect(Math.max(...expandedGrounds) - Math.min(...expandedGrounds)).toBeCloseTo(0)

    for (const name of ["client", "view", "content"] as const) {
      const compactGround = compact[name].worldQuad[3][1]
      const worldWidth = (definition: typeof compact[typeof name]) => Math.hypot(
        definition.worldQuad[1][0] - definition.worldQuad[0][0],
        definition.worldQuad[1][2] - definition.worldQuad[0][2],
      )

      expect(worldWidth(expanded[name])).toBeLessThan(worldWidth(narrowButTall[name]))
      expect(wideButShort[name].worldQuad[3][1]).toBe(compactGround)
      expect(narrowButTall[name].worldQuad[3][1]).toBe(compactGround)

      const placement = expanded[name].placement
      expect(placement.type).toBe("projective")
      if (placement.type !== "projective") continue
      const bounds = createFiniteProjectiveMapping(placement.matrix, placement.domain).contentBounds
      expect(bounds.x).toBeGreaterThanOrEqual(-Number.EPSILON)
      expect(bounds.y).toBeGreaterThanOrEqual(-Number.EPSILON)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(1390 + Number.EPSILON)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(expandedHeight + Number.EPSILON)
    }
  })

  it("fits every source plane inside the measured source slot", () => {
    for (const [width, height] of [
      [1214, 478],
      [1085, 478],
      [1052, 478],
      [974, 432],
      [800, 384],
      [610, 400],
      [577, 450],
      [460, 330],
      [300, 300],
    ]) {
      const definitions = createPlaneDefinitions(width, height, COORDINATE_PLANE_DOMAIN)
      const bounds = (["client", "view", "content"] as const).map((name) => {
        const placement = definitions[name].placement
        expect(placement.type).toBe("projective")
        if (placement.type !== "projective") throw new Error("expected projective plane")
        return createFiniteProjectiveMapping(placement.matrix, placement.domain).contentBounds
      })

      bounds.forEach((bound, index) => {
        const plane = (["client", "view", "content"] as const)[index]
        const context = `${plane} in ${width}×${height}`
        expect(bound.x, context).toBeGreaterThanOrEqual(-Number.EPSILON)
        expect(bound.y, context).toBeGreaterThanOrEqual(-Number.EPSILON)
        expect(bound.x + bound.width, context).toBeLessThanOrEqual(width + Number.EPSILON)
        expect(bound.y + bound.height, context).toBeLessThanOrEqual(height + Number.EPSILON)
      })
      bounds.slice(0, -1).forEach((bound, index) => {
        const overlap = bound.x + bound.width - bounds[index + 1].x
        const context = `${width}×${height} gap ${index}`
        expect(overlap, context).toBeGreaterThan(-Math.min(bound.width, bounds[index + 1].width) * 0.25)
        expect(overlap, context).toBeLessThan(Math.min(bound.width, bounds[index + 1].width) * 0.25)
      })
    }
  })

  it("keeps plane triangle winding aligned with the stored front-face normal", () => {
    const plane = createPlaneDefinitions(1012, 524, COORDINATE_PLANE_DOMAIN).client
    const basis = createPlaneBasis(plane)
    const geometry = rectMeshGeometry(
      plane,
      basis,
      { x: 0, y: 0, width: plane.width, height: plane.height },
      0.09,
    )
    const positions = Array.from(geometry.positions)
    const normals = Array.from(geometry.normals ?? [])
    const indices = Array.from(geometry.indices ?? [])
    const point = (index: number) => positions.slice(index * 3, index * 3 + 3)
    const first = point(indices[0])
    const second = point(indices[1])
    const third = point(indices[2])
    const along = second.map((value, index) => value - first[index])
    const across = third.map((value, index) => value - first[index])
    const faceNormal = [
      along[1] * across[2] - along[2] * across[1],
      along[2] * across[0] - along[0] * across[2],
      along[0] * across[1] - along[1] * across[0],
    ]
    const dot = faceNormal.reduce((sum, value, index) => sum + value * normals[index], 0)

    expect(dot).toBeGreaterThan(0)
  })

  it("builds the cross-plane signal as valid WebGL world geometry", () => {
    expectValidIndexedGeometry(worldLineMeshGeometry(
      [-2.4, 0.6, -7.6],
      [1.1, 0.4, -8.8],
      0.045,
    ))
    expect(() => worldLineMeshGeometry([0, 0, 0], [1, 0, -1], 0))
      .toThrow("world line width must be a positive finite number")
  })

  it("builds rounded glass faces and bevels without degenerate triangles", () => {
    const plane = createPlaneDefinitions(1012, 524, COORDINATE_PLANE_DOMAIN).client
    const basis = createPlaneBasis(plane)
    const bevelRadius = 0.09
    const segments = 6
    const face = createPlaneBevelFaceProfile(plane, basis, bevelRadius)
    const roundedFace = roundedRectMeshGeometry(
      plane,
      basis,
      face.rect,
      face.radiusX,
      face.radiusY,
      segments,
      bevelRadius,
    )
    const roundedBevel = planeVolumeGeometry(
      plane,
      basis,
      bevelRadius * 2,
      bevelRadius,
      segments,
    )

    expectValidIndexedGeometry(roundedFace)
    expectValidIndexedGeometry(roundedBevel)

    const facePositions = Array.from(roundedFace.positions).slice(3)
    const bevelPositions = Array.from(roundedBevel.positions)
    const bevelPoints = Array.from(
      { length: bevelPositions.length / 3 },
      (_, index) => bevelPositions.slice(index * 3, index * 3 + 3),
    )
    for (let offset = 0; offset < facePositions.length; offset += 3) {
      const point = facePositions.slice(offset, offset + 3)
      const joinsBevel = bevelPoints.some((candidate) => candidate.every(
        (value, index) => Math.abs(value - point[index]) < 1e-10,
      ))
      expect(joinsBevel).toBe(true)
    }
  })

  it("keeps the source Glass thin and stable across material updates", () => {
    const active = coordinatePlaneGlassMaterial(
      "view",
      { r: 164, g: 204, b: 255, a: 0.24 },
    )
    const inactive = coordinatePlaneGlassMaterial(
      "view",
      { r: 164, g: 204, b: 255, a: 0.24 },
      0.82,
    )

    expect(active.thickness).toBe(Math.fround(0.06))
    expect(active.ior).toBeCloseTo(1.22)
    expect(active.roughness).toBe(Math.fround(0.05))
    expect(inactive.thickness).toBe(active.thickness)
    expect(inactive.color[3]).toBeCloseTo(Math.fround(0.24 * 0.82))
  })

  it("keeps Output optical travel equal to its physical panel thickness", () => {
    expect(coordinateOutputGlassMaterial().thickness).toBe(Math.fround(0.06))
  })

  it("keeps UVs on empty rectangle meshes used by image materials", () => {
    const plane = createPlaneDefinitions(1012, 524, COORDINATE_PLANE_DOMAIN).client
    const geometry = rectMeshGeometry(plane, createPlaneBasis(plane), undefined, 0.09)

    expect(Array.from(geometry.uvs ?? [])).toHaveLength(6)
    expect(Array.from(geometry.indices ?? [])).toEqual([0, 1, 2])
  })

  it("renders source volume through one UV-mapped transparent material shell", () => {
    const plane = createPlaneDefinitions(1390, 578, COORDINATE_PLANE_DOMAIN).view
    const geometry = planeVolumeProfileGeometry(
      plane,
      createPlaneBasis(plane),
      0.06,
      0.015,
      5,
    )
    const texture = createCoordinatePlaneEdgeTexture("view")
    const material = new TransparentImageMaterial({ texture })
    const snapshot = texture.copySnapshot()
    const contentSnapshot = createCoordinatePlaneEdgeTexture("content").copySnapshot()
    const rowAlpha = (row: number) => Array.from(
      { length: snapshot.width },
      (_, index) => snapshot.data[(row * snapshot.width + index) * 4 + 3],
    )
    const primaryPeak = (alpha: number[]) => Math.max(...alpha.slice(0, alpha.length / 2))
    const secondaryPeak = (alpha: number[]) => Math.max(...alpha.slice(alpha.length * 0.6))
    const topAlpha = rowAlpha(0)
    const rightAlpha = rowAlpha(8)
    const bottomAlpha = rowAlpha(17)
    const leftAlpha = rowAlpha(26)
    const contentBottomAlpha = Array.from(
      { length: contentSnapshot.width },
      (_, index) => contentSnapshot.data[(17 * contentSnapshot.width + index) * 4 + 3],
    )

    expect(material.kind).toBe("transparent-image")
    expect(texture.alphaMode).toBe("straight")
    expect(texture.height).toBe(36)
    expect(geometry.normals).toBeUndefined()
    expect(geometry.uvs?.length).toBe(geometry.positions.length / 3 * 2)
    expect(Array.from(geometry.positions.slice(0, 6)))
      .toEqual(Array.from(geometry.positions.slice(-6)))
    expect(geometry.uvs?.[geometry.uvs.length - 1]).toBe(1)
    expect(secondaryPeak(topAlpha) / primaryPeak(topAlpha)).toBeGreaterThan(0.3)
    expect(secondaryPeak(topAlpha) / primaryPeak(topAlpha)).toBeLessThan(0.65)
    expect(primaryPeak(rightAlpha)).toBeGreaterThan(200)
    expect(secondaryPeak(rightAlpha) / primaryPeak(rightAlpha)).toBeLessThan(0.15)
    expect(primaryPeak(bottomAlpha)).toBeGreaterThan(80)
    expect(secondaryPeak(bottomAlpha) / primaryPeak(bottomAlpha)).toBeLessThan(0.2)
    expect(primaryPeak(leftAlpha)).toBeGreaterThan(200)
    expect(secondaryPeak(leftAlpha) / primaryPeak(leftAlpha)).toBeLessThan(0.15)
    expect(primaryPeak(contentBottomAlpha)).toBeGreaterThan(100)
    expect(secondaryPeak(contentBottomAlpha) / primaryPeak(contentBottomAlpha)).toBeLessThan(0.15)

    expect(coordinatePlaneEdgeSupport("client", { x: 0, y: -1 }).outside).toBe(5)
    expect(coordinatePlaneEdgeSupport("client", { x: 1, y: 0 }).outside).toBe(7.5)
    expect(coordinatePlaneEdgeSupport("client", { x: 0, y: 1 }).outside).toBe(11.5)
    expect(coordinatePlaneEdgeSupport("client", { x: -1, y: 0 }).outside).toBe(7.5)
    const angle = (degrees: number) => {
      const radians = degrees * Math.PI / 180
      return { x: Math.cos(radians), y: Math.sin(radians) }
    }
    const beforeCorner = coordinatePlaneEdgeSupport("client", angle(44)).outside
    const afterCorner = coordinatePlaneEdgeSupport("client", angle(46)).outside
    expect(Math.abs(beforeCorner - afterCorner)).toBeLessThan(0.5)
  })

  it("keeps the Canvas signal continuous while allowing segment-specific optics", () => {
    const signal = createCoordinateSignalPath({
      color: { r: 255, g: 180, b: 160, a: 0.88 },
      layer: 1,
      lineWidth: 1.2,
      zIndex: 18,
    })
    signal.update({
      points: [
        new Point({ x: 0, y: 0 }),
        new Point({ x: 10, y: 6 }),
        new Point({ x: 20, y: 4 }),
      ],
    })

    expect(signal.points).toHaveLength(3)
    expect(signal.zIndex).toBe(18)
    expect(signal.strokeConfig.lineWidth).toBe(1.2)
    expect(signal.strokeConfig.lineCap).toBe("round")
    expect(signal.strokeConfig.lineJoin).toBe("round")

    const glow = createCoordinateSignalPath({
      color: { r: 255, g: 170, b: 150, a: 0.65 },
      layer: 3,
      lineWidth: 2,
      zIndex: 17,
      shadowBlur: 6,
      shadowColor: "rgb(255 120 90 / 0.9)",
      shadowPasses: 2,
    })
    expect(glow.layer).toBe(3)
    expect(glow.shapeStore.get("shadowBlur")).toBe(6)
    expect(glow.shapeStore.get("shadowColor")).toBe("rgb(255 120 90 / 0.9)")
    expect(glow.shapeStore.get("shadowGapColor")).toBe("rgb(255 120 90 / 0.9)")
    expect(glow.shapeStore.get("highlightGapAlpha")).toBe(1)
    expect(glow.shapeStore.get("shadowPasses")).toBe(2)
    expect(glow.stateDrawFuncMap.default.stroke).toBeTypeOf("function")
    glow.update({
      points: [
        new Point({ x: 0, y: 0 }),
        new Point({ x: 10, y: 0 }),
        new Point({ x: 20, y: 0 }),
        new Point({ x: 30, y: 0 }),
      ],
    })
    const glowContext = {
      beginPath: vi.fn(),
      lineTo: vi.fn(),
      moveTo: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
      stroke: vi.fn(),
      translate: vi.fn(),
      shadowBlur: 0,
      shadowColor: "",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    }
    glow.stateDrawFuncMap.default.stroke?.call(glow, { context: glowContext } as never)
    expect(glowContext.stroke).toHaveBeenCalledTimes(4)
    expect(glowContext.moveTo.mock.calls).toEqual([
      [0, 0], [20, 0], [0, 0], [20, 0],
    ])
    expect(glowContext.translate).toHaveBeenCalledWith(-10_000, 0)
    expect(glowContext.restore).toHaveBeenCalledOnce()

    const highlight = createCoordinateSignalPath({
      color: { r: 255, g: 250, b: 247, a: 1 },
      layer: 3,
      lineWidth: 1.6,
      zIndex: 18,
      highlightGapAlpha: 0.05,
    })
    expect(highlight.shapeStore.get("highlightGapAlpha")).toBe(0.05)
    expect(highlight.stateDrawFuncMap.default.stroke).toBeTypeOf("function")
    highlight.update({ points: glow.points })
    const addColorStop = vi.fn()
    const highlightContext = {
      beginPath: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop })),
      lineTo: vi.fn(),
      moveTo: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: "",
    }
    highlight.stateDrawFuncMap.default.stroke?.call(highlight, { context: highlightContext } as never)
    expect(highlightContext.stroke).toHaveBeenCalledTimes(2)
    expect(addColorStop.mock.calls).toEqual([
      [0, "rgb(255 250 247 / 1)"],
      [0.35, "rgb(255 250 247 / 0.05)"],
      [0.65, "rgb(255 250 247 / 0.05)"],
      [1, "rgb(255 250 247 / 1)"],
    ])
    expect(highlightContext.restore).toHaveBeenCalledOnce()
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

    expect(coordinateEvidenceFromLibrary({
      client: { x: 0, y: 0 },
      view: { x: 0, y: 0 },
      content: { x: 0, y: 0 },
      viewSize: { width: 320, height: 240 },
      surface: { left: 100, top: 50, width: 640, height: 480, scaleX: 0.5, scaleY: 0.5 },
    }, { x: 40, y: 20, scale: 2 }, LAB_CONTENT_BOUNDS).shape).toEqual({
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
    })).toEqual({
      x: 36,
      y: -46,
      width: 768,
      height: 633.6,
    })

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
    const initialEvidence = coordinateEvidenceFromLibrary(initialProbe, { x: 0, y: 0, scale: 1 })
    const initialClientFrame = projectClientPlane(initialProbe, initialEvidence, fixedClientRange, { width: 240, height: 96 })
    const transformedProbe = {
      ...initialProbe,
      client: { x: 340, y: 320 },
      surface: { left: 132, top: 104, width: 416, height: 432, scaleX: 800 / 416, scaleY: 600 / 432 },
    }
    const transformedEvidence = coordinateEvidenceFromLibrary(transformedProbe, { x: 0, y: 0, scale: 1 })
    const transformedClientFrame = projectClientPlane(transformedProbe, transformedEvidence, fixedClientRange, { width: 240, height: 96 })
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

  it("derives rectangle evidence through the public coordinate facade", () => {
    const contentToView = vi.fn(({ x, y }: { x: number; y: number }) => ({
      x: x * 2 + 40,
      y: y * 2 + 20,
    }))
    const contentToClient = vi.fn(({ x, y }: { x: number; y: number }) => ({
      x: x * 4 + 180,
      y: y * 4 + 90,
    }))
    const viewToContent = vi.fn(({ x, y }: { x: number; y: number }) => ({
      x: (x - 40) / 2,
      y: (y - 20) / 2,
    }))

    const evidence = readCoordinateEvidence({
      contentToClient,
      contentToView,
      viewToContent,
    }, { width: 320, height: 240 })

    expect(contentToView).toHaveBeenCalledTimes(8)
    expect(contentToClient).toHaveBeenCalledTimes(8)
    expect(viewToContent).toHaveBeenCalledTimes(4)
    expect(evidence.shape.view).toEqual({ x: 330, y: 500, width: 380, height: 220 })
    expect(evidence.shape.client).toEqual({ x: 760, y: 1050, width: 760, height: 440 })
    expect(evidence.visibleContent).toEqual({ x: -20, y: -10, width: 160, height: 120 })
  })

  it("keeps Coordinates scene paint-neutral and the DOM control harness invisible", () => {
    const css = readFileSync(resolve(process.cwd(), "../example/src/index.css"), "utf8")
    const style = document.createElement("style")
    style.textContent = css
    document.head.appendChild(style)

    const violations: Array<{ selector: string; property: string; value: string }> = []
    const isPaintProperty = (property: string) => property.startsWith("background")
      || /^border(?:-(?:top|right|bottom|left))?(?:-(?:color|style|width))?$/.test(property)
      || ["box-shadow", "text-shadow", "filter", "backdrop-filter", "content"].includes(property)
      || property.startsWith("mask-")
      || property.startsWith("-webkit-mask-")
    const isNeutralPaint = (value: string) => {
      const normalized = value.trim().toLowerCase().replaceAll(" ", "")
      return normalized === ""
        || normalized === "0"
        || normalized === "0px"
        || normalized === "none"
        || normalized === "transparent"
        || normalized === "1pxsolidtransparent"
        || normalized === "rgba(0,0,0,0)"
    }
    const inspect = (rules: CSSRuleList) => {
      Array.from(rules).forEach((rule) => {
        if (rule instanceof CSSStyleRule && rule.selectorText.includes(".coordinate-")) {
          Array.from(rule.style).forEach((property) => {
            const value = rule.style.getPropertyValue(property)
            if (isPaintProperty(property) && !isNeutralPaint(value)) {
              violations.push({ selector: rule.selectorText, property, value })
            }
          })
        }
        if ("cssRules" in rule) inspect((rule as CSSGroupingRule).cssRules)
      })
    }
    inspect(style.sheet!.cssRules)

    expect(violations).toEqual([])
    const semanticRule = Array.from(style.sheet!.cssRules)
      .find((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule
        && rule.selectorText === ".coordinate-semantic-only")
    expect(semanticRule?.style.position).toBe("absolute")
    expect(semanticRule?.style.width).toBe("1px")
    expect(semanticRule?.style.height).toBe("1px")
    expect(semanticRule?.style.overflow).toBe("hidden")
    expect(semanticRule?.style.getPropertyValue("clip-path")).toBe("inset(50%)")
    expect(semanticRule?.style.getPropertyValue("white-space")).toBe("nowrap")
    expect(semanticRule?.style.getPropertyValue("pointer-events")).toBe("none")
    const semanticConsoleRule = Array.from(style.sheet!.cssRules)
      .find((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule
        && rule.selectorText === ".coordinate-console")
    expect(semanticConsoleRule?.style.getPropertyValue("pointer-events")).toBe("none")
    const stageRule = Array.from(style.sheet!.cssRules)
      .find((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule
        && rule.selectorText === ".coordinate-stage")
    expect(stageRule?.style.display).toBe("contents")
    expect(stageRule?.style.getPropertyValue("pointer-events")).toBe("")
    for (const selector of [".coordinate-stack-exhibit", ".coordinate-live-exhibit"]) {
      const hostRule = Array.from(style.sheet!.cssRules)
        .find((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule
          && rule.selectorText === selector)
      expect(hostRule?.style.getPropertyValue("pointer-events")).toBe("")
    }
    expect(css).not.toMatch(/\.coordinate-(?:operations|operation-group|operation-heading|scale-control|offset-controls|evidence-toggle)\b/)
  })

  it("owns Output and Console geometry in the root StayCanvas View model", () => {
    expect(createCoordinateSceneLayout(1440, 1000)).toMatchObject({
      output: { x: 958, y: 166, width: 482, height: 500 },
      console: { x: 90, y: 781, width: 1260, height: 162 },
    })
    expect(createCoordinateSceneLayout(1672, 941)).toMatchObject({
      output: { x: 1112, y: 156, width: 560, height: 500 },
      console: { x: 90, y: 722, width: 1472, height: 162 },
    })
    expect(createCoordinateSceneLayout(800, 600)).toMatchObject({
      output: { x: 476, y: 30, width: 300, height: 443 },
      console: { x: 36, y: 506, width: 728, height: 82 },
    })
    for (const [width, height] of [
      [320, 720],
      [568, 720],
      [800, 720],
      [1280, 720],
      [1672, 941],
    ] as const) {
      const consoleFrame = createCoordinateSceneLayout(width, height).console
      const controls = coordinateConsoleControlRects(consoleFrame)
      for (const control of Object.values(controls)) {
        if (control.width === 0 || control.height === 0) continue
        expect(control.x).toBeGreaterThanOrEqual(consoleFrame.x)
        expect(control.y).toBeGreaterThanOrEqual(consoleFrame.y)
        expect(control.x + control.width).toBeLessThanOrEqual(consoleFrame.x + consoleFrame.width)
        expect(control.y + control.height).toBeLessThanOrEqual(consoleFrame.y + consoleFrame.height)
        expect(control.x + control.width).toBeLessThanOrEqual(width)
        expect(control.y + control.height).toBeLessThanOrEqual(height)
      }
    }
    expect(coordinateConsoleIsCompact(createCoordinateSceneLayout(568, 720).console)).toBe(true)
    expect(coordinateConsoleIsCompact(createCoordinateSceneLayout(800, 720).console)).toBe(true)
    for (const [width, height] of [
      [568, 260],
      [568, 320],
      [320, 320],
      [1440, 840],
      [1440, 841],
      [1440, 959],
      [1440, 960],
    ] as const) {
      const layout = createCoordinateSceneLayout(width, height)
      expect(layout.output.y + layout.output.height)
        .toBeLessThanOrEqual(layout.console.y)
      expect(layout.output.x).toBeGreaterThanOrEqual(0)
      expect(layout.output.x + layout.output.width).toBeLessThanOrEqual(width)
      expect(layout.console.y).toBeGreaterThanOrEqual(0)
      const output = createFrontFacingPanelDefinition(
        width,
        height,
        layout.output,
        createPlaneDefinitions(width, height, COORDINATE_PLANE_DOMAIN),
      )
      expect(-output.worldQuad[0][2]).toBeLessThan(20)
    }

    const source = readFileSync(
      resolve(process.cwd(), "../example/src/examples/simple/CoordinatesExample.tsx"),
      "utf8",
    )
    expect(source).not.toContain("outputClientFrame")
    expect(source).not.toContain("consoleClientFrame")
    expect(source).not.toContain("setOutputClientFrame")
    expect(source).not.toContain("setConsoleClientFrame")
  })

  it("loads the pre-graded coordinate room without runtime pixel grading", () => {
    const stackSource = readFileSync(
      resolve(process.cwd(), "../example/src/examples/simple/CoordinateStack.tsx"),
      "utf8",
    )
    const backdrop = readFileSync(
      resolve(process.cwd(), "../example/src/assets/coordinate-room-backdrop-graded-v1.webp"),
    )

    expect(stackSource).toContain("coordinate-room-backdrop-graded-v1.webp")
    expect(stackSource).not.toContain("gradeCoordinateRoomPixels")
    expect(stackSource).not.toContain("sharpenCoordinateRoomPixels")
    expect(backdrop.byteLength).toBeLessThan(400_000)
  })

  it("projects the root View layout directly into the Live Canvas host", () => {
    const frames: FrameRequestCallback[] = []
    window.requestAnimationFrame = (callback) => {
      frames.push(callback)
      return frames.length
    }

    for (const [width, height] of [
      [1440, 1000],
      [1440, 841],
      [1280, 720],
      [800, 600],
      [568, 320],
    ] as const) {
      viewportWidth = width
      viewportHeight = height
      const container = document.createElement("div")
      document.body.appendChild(container)
      root = createRoot(container)

      act(() => {
        root?.render(<I18nProvider><CoordinatesExample /></I18nProvider>)
      })
      act(() => frames.splice(0).forEach((frame) => frame(0)))

      const expected = createCoordinateSceneLayout(width, height)
      const liveHost = container.querySelector<HTMLElement>(".coordinate-live-exhibit")
      expect(liveHost?.style.left).toBe(`${expected.output.x}px`)
      expect(liveHost?.style.top).toBe(`${expected.output.y}px`)
      expect(liveHost?.style.width).toBe(`${expected.output.width}px`)
      expect(liveHost?.style.height).toBe(`${expected.output.height}px`)
      expect(liveHost?.style.paddingBottom).toBe(`${expected.outputGroundGap}px`)
      expect(liveHost?.style.gridTemplateRows)
        .toBe(`${expected.outputHeaderHeight}px minmax(0, 1fr)`)

      act(() => root?.unmount())
      root = undefined
      container.remove()
    }
  })

  it("re-samples the Live Canvas Client point after the root layout moves Output", () => {
    viewportWidth = 1440
    viewportHeight = 1000
    const frames: FrameRequestCallback[] = []
    window.requestAnimationFrame = (callback) => {
      frames.push(callback)
      return frames.length
    }
    const rect = (x: number, y: number, width: number, height: number) => ({
      bottom: y + height,
      height,
      left: x,
      right: x + width,
      top: y,
      width,
      x,
      y,
      toJSON: () => ({}),
    }) as DOMRect
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      if (this.closest(".coordinate-stack-canvas")) return rect(0, 0, viewportWidth, viewportHeight)
      const output = this.closest<HTMLElement>(".coordinate-live-exhibit")
      if (!output) return rect(0, 0, this.width, this.height)
      const layout = createCoordinateSceneLayout(viewportWidth, viewportHeight)
      return rect(
        Number.parseFloat(output.style.left),
        Number.parseFloat(output.style.top) + layout.outputHeaderHeight,
        Number.parseFloat(output.style.width),
        layout.output.height - layout.outputHeaderHeight - layout.outputGroundGap,
      )
    })
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(<I18nProvider><CoordinatesExample /></I18nProvider>)
    })
    act(() => frames.splice(0).forEach((frame) => frame(0)))

    const layout = createCoordinateSceneLayout(viewportWidth, viewportHeight)
    const client = container.querySelector(".coordinate-flow-client strong")?.textContent
      ?.split(", ")
      .map(Number)
    expect(client?.[0]).toBeGreaterThan(layout.output.x + 30)
    expect(client?.[1]).toBeGreaterThan(layout.output.y + layout.outputHeaderHeight + 10)
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

  it("renders the Coordinates route without DOM or CSS example chrome", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const definition: ExampleDefinition = {
      path: "/simple/coordinates",
      sourcePaths: ["./CoordinatesExample.tsx"],
      group: "Simple",
      order: 1,
      presentation: "canvas-only",
      title: { en: "Coordinates", zh: "坐标" },
      shortTitle: { en: "Coordinates", zh: "坐标" },
      summary: { en: "Coordinate laboratory.", zh: "坐标实验室。" },
      features: ["Canvas"],
      component: () => <div data-testid="coordinate-result" />,
    }

    act(() => {
      root?.render(
        <I18nProvider>
          <ExamplePage definition={definition} sources={[{ path: definition.sourcePaths[0], source: "export default function Coordinates() {}" }]} />
        </I18nProvider>,
      )
    })

    expect(getExampleByPath("/simple/coordinates")?.presentation).toBe("canvas-only")
    expect(container.querySelector("article.canvas-only-page")).not.toBeNull()
    expect(container.querySelector("#result-panel [data-testid='coordinate-result']")).not.toBeNull()
    expect(container.querySelector(".example-header")).toBeNull()
    expect(container.querySelector(".immersive-overview-link")).toBeNull()
    expect(container.querySelector(".tabs")).toBeNull()
    expect(container.querySelector("#source-panel")).toBeNull()
    expect(container.querySelector("a, button, input, select, textarea")).toBeNull()
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

    const workspace = container.querySelector(".coordinate-stage")
    const experience = container.querySelector(".coordinate-experience")
    const stackCard = experience?.querySelector(":scope > .coordinate-stack-exhibit")
    const stackLayers = experience?.querySelectorAll<HTMLCanvasElement>(".coordinate-stack-canvas canvas")
    const liveLayers = workspace?.querySelectorAll<HTMLCanvasElement>(".coordinate-canvas canvas")
    expect(workspace?.querySelectorAll(":scope > section")).toHaveLength(1)
    expect(experience?.querySelector(":scope > .coordinate-source-slot")).toBe(stackCard)
    expect(workspace?.querySelector(":scope > .coordinate-live-exhibit")).not.toBeNull()
    expect(stackCard?.classList.contains("coordinate-focus-view-client")).toBe(true)
    expect(stackLayers).toHaveLength(4)
    expect(liveLayers).toHaveLength(2)
    expect(workspace?.querySelector(".coordinate-live-exhibit .coordinate-live-heading")?.textContent)
      .toContain("Live Canvas")
    expect(workspace?.querySelector(".coordinate-live-exhibit .canvas-viewport-label")?.textContent)
      .toBe("CLIENT DOM · 85% × 85%")
    expect(experience?.querySelector(".coordinate-stack-exhibit .canvas-viewport-label"))
      .toBeNull()
    expect(container.querySelector(".coordinate-hero")?.textContent).toContain("One point,")
    expect(container.querySelector(".coordinate-hero")?.textContent).toContain("three spaces.")
    expect(workspace?.querySelector(".coordinate-live-heading h3")?.textContent).toBe("Live Canvas")
    expect(workspace?.querySelector(".coordinate-live-range")?.textContent).toContain("Content frame")
    const evidence = container.querySelector<HTMLElement>(".coordinate-evidence")
    expect(evidence?.hidden).toBe(true)
    expect(evidence?.classList.contains("coordinate-semantic-only")).toBe(true)
    const semanticControls = container.querySelectorAll(
      ".coordinate-console button, .coordinate-console input, .coordinate-console select, "
      + ".coordinate-console textarea, .coordinate-console a[href], .coordinate-console [tabindex], "
      + ".coordinate-evidence button, .coordinate-evidence input, .coordinate-evidence select, "
      + ".coordinate-evidence textarea, .coordinate-evidence a[href], .coordinate-evidence [tabindex]",
    )
    expect(semanticControls).toHaveLength(0)
    const displayTransform = workspace?.querySelector<HTMLElement>(".coordinate-live-exhibit .canvas-display-transform")
    expect(displayTransform?.dataset.displayScaleX).toBe("0.85")
    expect(displayTransform?.dataset.displayScaleY).toBe("0.85")
    expect(displayTransform?.style.transform).toBe("translate(0px, 0px) scale(0.85, 0.85)")
    expect(liveLayers?.[0].width).toBe(1082)
    expect(liveLayers?.[0].height).toBe(565)

    expect(webGL2Contexts.has(stackLayers![0])).toBe(true)
    expect(webGL2Contexts.has(stackLayers![1])).toBe(false)
    expect(webGL2Contexts.get(stackLayers![2])?.spies.drawElements).toHaveBeenCalled()
    expect(webGL2Contexts.has(stackLayers![3])).toBe(false)

    const flow = container.querySelector(".coordinate-flow")
    expect(flow?.textContent).toContain("Coordinates")
    expect(flow?.textContent).toContain("Subtract the Canvas DOM origin")
    expect(flow?.textContent).toContain("Undo viewport offset and scale")
    expect(flow?.textContent).toContain("Scene coordinates")
    expect(flow?.textContent).not.toContain("The coordinate exposed as e.point")
    expect(flow?.textContent).not.toContain("1 · Client")

    const proofRows = [...container.querySelectorAll(".coordinate-zoom-proof dl > div")]
    const proofValue = (label: string) => proofRows
      .find((item) => item.querySelector("dt")?.textContent === label)
      ?.querySelector("dd")?.textContent
    const contentGeometry = proofValue("Content Shape geometry")
    expect(contentGeometry).toBe("145, 240 / 190×110")
    expect(container.querySelector(".coordinate-proof-stable small")?.textContent)
      .toContain("Demo Content bounds 0, 0 / 480×360")
    expect(container.querySelector(".coordinate-proof-stable small")?.textContent)
      .toContain("Root itself has no geometry")
    expect(proofRows
      .find((item) => item.querySelector("dt")?.textContent === "CSS View to Client")
      ?.querySelector("code")?.textContent)
      .toContain("CSS scale")

    expect(container.querySelector(".coordinate-space-bridge canvas")).toBeNull()
    expect(container.querySelector(".coordinate-stage svg")).toBeNull()
  })

  it("renders the visible coordinate proof with StayCanvas text", () => {
    const restorePointerEvents = installPointerEvents()
    const frames: FrameRequestCallback[] = []
    window.requestAnimationFrame = (callback) => {
      frames.push(callback)
      return frames.length
    }
    const contextPrototype = Object.getPrototypeOf(
      document.createElement("canvas").getContext("2d")!,
    ) as CanvasRenderingContext2D
    const textDraws: Array<{
      canvas: HTMLCanvasElement
      fillStyle: string
      globalAlpha: number
      text: string
    }> = []
    vi.spyOn(contextPrototype, "fillText").mockImplementation(function (value) {
      textDraws.push({
        canvas: this.canvas,
        fillStyle: String(this.fillStyle),
        globalAlpha: this.globalAlpha,
        text: String(value),
      })
    })
    const rect = (x: number, y: number, width: number, height: number) => ({
      bottom: y + height,
      height,
      left: x,
      right: x + width,
      top: y,
      width,
      x,
      y,
      toJSON: () => ({}),
    }) as DOMRect
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      if (this.classList.contains("coordinate-live-exhibit")) return rect(620, 90, 270, 300)
      if (this.classList.contains("coordinate-console")) return rect(40, 330, 840, 130)
      if (this instanceof HTMLCanvasElement && this.closest(".coordinate-stack-canvas")) {
        return rect(0, 0, 920, 480)
      }
      return rect(0, 0, 0, 0)
    })
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(<I18nProvider><CoordinatesExample /></I18nProvider>)
    })
    act(() => frames.splice(0).forEach((frame) => frame(0)))

    const stackLayers = container.querySelectorAll<HTMLCanvasElement>(".coordinate-stack-canvas canvas")
    expect(stackLayers).toHaveLength(4)
    const overlayCanvas = stackLayers[stackLayers.length - 1]
    const visibleOverlayDraws = textDraws.filter((draw) => draw.canvas === overlayCanvas
      && draw.globalAlpha > 0
      && !draw.fillStyle.replaceAll(" ", "").endsWith(",0)"))
    const drawnText = visibleOverlayDraws.map(({ text }) => text)
    expect(drawnText).toEqual(expect.arrayContaining([
      "One point, three spaces.",
      "LIVE CANVAS",
      "COORDINATE FACADE",
      "CLIENT",
      "VIEW",
      "CONTENT",
    ]))
    expect(drawnText.some((value) => value.startsWith("CONTENT FRAME · X "))).toBe(false)
    expect(container.querySelector(".coordinate-hero")?.classList.contains("coordinate-semantic-only"))
      .toBe(true)
    expect(container.querySelector(".coordinate-live-heading .coordinate-semantic-only"))
      .not.toBeNull()
    expect(container.querySelector(".coordinate-flow")?.getAttribute("aria-live")).toBe("polite")
    expect(container.querySelector(".coordinate-evidence")?.classList.contains("coordinate-semantic-only"))
      .toBe(true)
    expect(drawnText).not.toContain("Projection evidence")
    clickCoordinateConsoleControl({
      canvas: overlayCanvas,
      name: "evidence",
      viewHeight: 480,
      viewWidth: 920,
    })
    act(() => frames.splice(0).forEach((frame) => frame(16)))
    const evidenceText = textDraws
      .filter((draw) => draw.canvas === overlayCanvas && draw.globalAlpha > 0)
      .map(({ text }) => text)
    expect(evidenceText).toEqual(expect.arrayContaining([
      "Projection evidence",
      "Zoom changes the projection, not the Shape",
      "Content Shape geometry",
      "View projection",
      "Client footprint",
      "Canvas event · Content · e.point",
    ]))
    restorePointerEvents()
  })

  it("routes visible desktop controls through root StayCanvas hit regions", () => {
    const restorePointerEvents = installPointerEvents()
    viewportWidth = 1440
    viewportHeight = 1000
    const frames: FrameRequestCallback[] = []
    window.requestAnimationFrame = (callback) => {
      frames.push(callback)
      return frames.length
    }
    const rect = (x: number, y: number, width: number, height: number) => ({
      bottom: y + height,
      height,
      left: x,
      right: x + width,
      top: y,
      width,
      x,
      y,
      toJSON: () => ({}),
    }) as DOMRect
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      if (this.closest(".coordinate-stack-canvas")) return rect(0, 0, 1440, 1000)
      if (this.closest(".coordinate-canvas")) return rect(1004, 284, 396, 370)
      return rect(0, 0, this.width, this.height)
    })
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(<I18nProvider><CoordinatesExample /></I18nProvider>)
    })
    act(() => frames.splice(0).forEach((frame) => frame(0)))
    const stackLayers = container.querySelectorAll<HTMLCanvasElement>(".coordinate-stack-canvas canvas")
    const top = stackLayers[stackLayers.length - 1]
    const click = (name: CoordinateConsoleControlName, xRatio?: number) => {
      clickCoordinateConsoleControl({
        canvas: top,
        name,
        viewHeight: 1000,
        viewWidth: 1440,
        xRatio,
      })
      act(() => frames.splice(0).forEach((frame) => frame(16)))
    }
    const cssState = () => container.querySelector(".coordinate-css-state code")?.textContent
    const viewportState = () => container.querySelector(".coordinate-viewport-state code")?.textContent
    const evidenceState = () => container.querySelector(".coordinate-evidence-state")?.textContent
    const evidence = container.querySelector<HTMLElement>("#coordinate-evidence")

    expect(COORDINATE_CONSOLE_CONTROL_NAMES).toHaveLength(10)
    expect(cssState()).toBe("translate(0, 0) scale(0.85, 0.85)")
    expect(viewportState()).toBe("translate(59, 19) scale(0.82)")

    click("scale-x")
    expect(cssState()).toBe("translate(0, 0) scale(0.75, 0.75)")
    // 0.55 lies between the initial-scale and current-scale rail positions, so
    // this also proves the long-lived listener reads the latest viewport state.
    click("translate-x", 0.55)
    expect(cssState()).toBe("translate(0, 0) scale(0.75, 0.75)")
    expect(viewportState()).toMatch(/scale\(0\.98\)$/)
    click("css-reset")
    expect(cssState()).toBe("translate(0, 0) scale(0.85, 0.85)")

    click("translate-x", 0.25)
    expect(viewportState()).toBe("translate(59, 19) scale(0.82)")
    click("viewport-reset")
    expect(viewportState()).toBe("translate(59, 19) scale(0.82)")

    expect(evidenceState()).toBe("closed")
    expect(evidence?.hidden).toBe(true)
    click("evidence")
    expect(evidenceState()).toBe("open")
    expect(evidence?.hidden).toBe(false)
    click("evidence")
    expect(evidenceState()).toBe("closed")
    restorePointerEvents()
  })

  it("routes every compact control through the resized root StayCanvas", () => {
    const restorePointerEvents = installPointerEvents()
    const originalResizeObserver = globalThis.ResizeObserver
    const callbacks: ResizeObserverCallback[] = []
    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver
    viewportWidth = 1440
    viewportHeight = 1000
    const frames: FrameRequestCallback[] = []
    window.requestAnimationFrame = (callback) => {
      frames.push(callback)
      return frames.length
    }
    const rect = (x: number, y: number, width: number, height: number) => ({
      bottom: y + height,
      height,
      left: x,
      right: x + width,
      top: y,
      width,
      x,
      y,
      toJSON: () => ({}),
    }) as DOMRect
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      if (this.closest(".coordinate-stack-canvas")) return rect(0, 0, viewportWidth, viewportHeight)
      if (this.closest(".coordinate-canvas")) return rect(476, 92, 300, 381)
      return rect(0, 0, this.width, this.height)
    })
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    try {
      act(() => {
        root?.render(<I18nProvider><CoordinatesExample /></I18nProvider>)
      })
      act(() => frames.splice(0).forEach((frame) => frame(0)))
      const stackLayers = container.querySelectorAll<HTMLCanvasElement>(".coordinate-stack-canvas canvas")
      const top = stackLayers[stackLayers.length - 1]
      const cssState = () => container.querySelector(".coordinate-css-state code")?.textContent
      const viewportState = () => container.querySelector(".coordinate-viewport-state code")?.textContent
      const click = (name: CoordinateConsoleControlName, width: number, height: number) => {
        clickCoordinateConsoleControl({ canvas: top, name, viewHeight: height, viewWidth: width })
        act(() => frames.splice(0).forEach((frame) => frame(16)))
      }

      click("scale-x", 1440, 1000)
      expect(cssState()).toBe("translate(0, 0) scale(0.75, 0.75)")

      viewportWidth = 800
      viewportHeight = 600
      act(() => callbacks.forEach((callback) => callback([], {} as ResizeObserver)))
      act(() => frames.splice(0).forEach((frame) => frame(32)))

      const compactRects = coordinateConsoleControlRects(
        createCoordinateSceneLayout(800, 600).console,
      )
      for (const hidden of ["scale-x", "scale-y", "translate-x", "translate-y", "pan"] as const) {
        expect(compactRects[hidden]).toMatchObject({ width: 0, height: 0 })
      }

      click("css-reset", 800, 600)
      expect(cssState()).toBe("translate(0, 0) scale(0.85, 0.85)")
      click("zoom-in", 800, 600)
      expect(viewportState()).toContain("scale(0.98)")
      click("zoom-out", 800, 600)
      expect(viewportState()).toContain("scale(0.82)")
      click("zoom-in", 800, 600)
      click("viewport-reset", 800, 600)
      expect(viewportState()).toBe("translate(59, 19) scale(0.82)")
      expect(container.querySelector(".coordinate-evidence-state")?.textContent).toBe("closed")
      click("evidence", 800, 600)
      expect(container.querySelector(".coordinate-evidence-state")?.textContent).toBe("open")
      click("evidence", 800, 600)
      expect(container.querySelector(".coordinate-evidence-state")?.textContent).toBe("closed")

      viewportHeight = 720
      act(() => callbacks.forEach((callback) => callback([], {} as ResizeObserver)))
      act(() => frames.splice(0).forEach((frame) => frame(48)))
      click("evidence", 800, 720)
      expect(container.querySelector(".coordinate-evidence-state")?.textContent).toBe("open")
    } finally {
      globalThis.ResizeObserver = originalResizeObserver
      restorePointerEvents()
    }
  })

  it("resynchronizes Client coordinates when the local workspace scrolls", () => {
    const frames: FrameRequestCallback[] = []
    window.requestAnimationFrame = (callback) => {
      frames.push(callback)
      return frames.length
    }
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(<I18nProvider><CoordinatesExample /></I18nProvider>)
    })
    const liveLayers = container.querySelectorAll<HTMLCanvasElement>(".coordinate-canvas canvas")
    let scrollOffset = 0
    liveLayers.forEach((layer) => {
      vi.spyOn(layer, "getBoundingClientRect").mockImplementation(() => ({
        bottom: 100 + layer.height * 0.8,
        height: layer.height * 0.8,
        left: 626 - scrollOffset,
        right: 626 - scrollOffset + layer.width * 0.8,
        top: 100,
        width: layer.width * 0.8,
        x: 626 - scrollOffset,
        y: 100,
        toJSON: () => ({}),
      }))
    })

    act(() => {
      window.dispatchEvent(new Event("resize"))
      frames.splice(0).forEach((frame) => frame(0))
    })
    const before = container.querySelector(".coordinate-flow-client strong")?.textContent
    scrollOffset = 162
    act(() => {
      window.dispatchEvent(new Event("scroll"))
      frames.splice(0).forEach((frame) => frame(16))
    })
    const after = container.querySelector(".coordinate-flow-client strong")?.textContent
    expect(before).toBe("814, 254")
    expect(after).toBe("652, 254")
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

      expect(container.querySelector<HTMLCanvasElement>(".coordinate-canvas canvas")?.width).toBe(1082)
      expect(container.querySelector<HTMLCanvasElement>(".coordinate-canvas canvas")?.height).toBe(565)

      viewportWidth = 210
      viewportHeight = 81
      act(() => callbacks.forEach((callback) => callback([], {} as ResizeObserver)))

      expect(container.querySelector<HTMLCanvasElement>(".coordinate-canvas canvas")?.width).toBe(247)
      expect(container.querySelector<HTMLCanvasElement>(".coordinate-canvas canvas")?.height).toBe(95)
      expect(container.querySelector<HTMLCanvasElement>(".coordinate-stack-canvas canvas")?.width).toBe(210)
      expect(container.querySelector<HTMLCanvasElement>(".coordinate-stack-canvas canvas")?.height).toBe(81)
      expect([...container.querySelectorAll(".coordinate-zoom-proof dl > div")]
        .find((item) => item.querySelector("dt")?.textContent === "Viewport")
        ?.querySelector("dd")?.textContent)
        .toBe("59, 19 / 40%")
    } finally {
      globalThis.ResizeObserver = originalResizeObserver
    }
  })

  it("caps coordinate backing stores on high-density displays", () => {
    const originalPixelRatio = window.devicePixelRatio
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 })
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    try {
      act(() => {
        root?.render(<I18nProvider><CoordinatesExample /></I18nProvider>)
      })

      const stackLayers = container.querySelectorAll<HTMLCanvasElement>(".coordinate-stack-canvas canvas")
      const liveLayers = container.querySelectorAll<HTMLCanvasElement>(".coordinate-canvas canvas")
      expect([...stackLayers].map((canvas) => [canvas.width, canvas.height])).toEqual([
        [1150, 600],
        [1150, 600],
        [920, 480],
        [1150, 600],
      ])
      expect([...liveLayers].map((canvas) => [canvas.width, canvas.height])).toEqual([
        [1082, 565],
        [1353, 706],
      ])
    } finally {
      Object.defineProperty(window, "devicePixelRatio", {
        configurable: true,
        value: originalPixelRatio,
      })
    }
  })

  it("reports the actual shrunken drawing-buffer area to mounted scenes", () => {
    viewportWidth = 210
    viewportHeight = 81
    let tools: StayTools | undefined
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <CanvasSurface shrinkToViewport>
          <StayCanvas
            height={120}
            layers={1}
            mounted={(mountedTools) => { tools = mountedTools }}
            width={240}
          />
        </CanvasSurface>,
      )
    })

    expect(container.querySelector<HTMLCanvasElement>("canvas")?.width).toBe(210)
    expect(container.querySelector<HTMLCanvasElement>("canvas")?.height).toBe(81)
    expect(sceneCanvasArea(tools!, 240, 120)).toEqual({ x: 0, y: 0, width: 210, height: 81 })
  })

  it("coalesces plain pointer samples to the latest animation frame", () => {
    const restorePointerEvents = installPointerEvents()
    const frames: FrameRequestCallback[] = []
    window.requestAnimationFrame = (callback) => {
      frames.push(callback)
      return frames.length
    }
    window.cancelAnimationFrame = (handle) => {
      if (handle > 0 && handle <= frames.length) frames[handle - 1] = () => {}
    }
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    try {
      act(() => {
        root?.render(<I18nProvider><CoordinatesExample /></I18nProvider>)
      })
      act(() => frames.splice(0).forEach((frame) => frame(0)))

      const liveLayers = container.querySelectorAll<HTMLCanvasElement>(".coordinate-canvas canvas")
      const top = liveLayers[liveLayers.length - 1]
      const before = container.querySelector(".coordinate-flow-client strong")?.textContent

      act(() => {
        top.dispatchEvent(pointer("pointermove", 120, 140))
        top.dispatchEvent(pointer("pointermove", 220, 180))
      })

      expect(frames.length).toBeGreaterThan(0)
      expect(container.querySelector(".coordinate-flow-client strong")?.textContent).toBe(before)

      act(() => frames.splice(0).forEach((frame) => frame(16)))
      expect(container.querySelector(".coordinate-flow-client strong")?.textContent).toBe("220, 180")
    } finally {
      restorePointerEvents()
    }
  })

  it("ends a Space pan and restores the cursor even without pointer movement", () => {
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

      act(() => {
        top.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }))
        top.dispatchEvent(pointer("pointerdown", 100, 100, { button: 0, buttons: 1 }))
      })
      expect(top.style.cursor).toBe("grabbing")

      act(() => {
        top.dispatchEvent(pointer("pointerup", 100, 100, { button: 0, buttons: 0 }))
      })
      expect(top.style.cursor).toBe("grab")

      act(() => {
        top.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }))
      })
      expect(top.style.cursor).toBe("default")
    } finally {
      restorePointerEvents()
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
        .toBe(`${Math.round(outside.x)}, ${Math.round(outside.y)}`)
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
      expect(viewportBeforeCancellation?.querySelector("dd")?.textContent).toBe("122, 56 / 82%")
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
      expect(viewportAfterCancellation?.querySelector("dd")?.textContent).toBe("59, 19 / 82%")

      act(() => {
        top.dispatchEvent(pointer("pointerdown", 200, 200, { button: 0, buttons: 1 }))
        top.dispatchEvent(pointer("pointermove", 240, 230, { buttons: 1 }))
        top.dispatchEvent(pointer("lostpointercapture", 0, 0, { buttons: 0 }))
      })

      const viewportAfterRelease = [...container.querySelectorAll(".coordinate-zoom-proof dl > div")]
        .find((item) => item.querySelector("dt")?.textContent === "Viewport")
      const eventPoint = [...container.querySelectorAll(".coordinate-zoom-proof dl > div")]
        .find((item) => item.querySelector("dt")?.textContent === "Canvas event · Content · e.point")
        ?.querySelector("dd")
      expect(container.querySelector(".coordinate-flow-view strong")?.textContent).toBe("275, 250")
      expect(viewportAfterRelease?.querySelector("dd")?.textContent).toBe("109, 56 / 82%")
      expect(eventPoint?.textContent).toBe("264, 282 · match")

      const rootLayers = container.querySelectorAll<HTMLCanvasElement>(".coordinate-stack-canvas canvas")
      const rootTop = rootLayers[rootLayers.length - 1]
      clickCoordinateConsoleControl({
        canvas: rootTop,
        name: "viewport-reset",
        viewHeight: 480,
        viewWidth: 920,
      })
      expect(eventPoint?.textContent).toBe("264, 282 · match")

      act(() => {
        top.dispatchEvent(new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: 80,
          clientY: 90,
          deltaY: -100,
        }))
      })
      expect(eventPoint?.textContent).toBe("20, 68 · match")
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

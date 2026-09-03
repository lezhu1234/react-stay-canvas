import { useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  Circle,
  type CanvasLayerConfig,
  type Coordinate,
  type EventProps,
  Line,
  type ListenerProps,
  MOUSE_EVENTS,
  Rectangle,
  type ShapeDrawProps,
  StayCanvas,
  StayText,
  type StayTools,
  type ViewportState,
} from "react-stay-canvas"

import { CanvasSurface, colors, rgba } from "../../components/DemoKit"
import { useI18n } from "../../i18n"
import { hasPointerPosition } from "../actionEventGuards"
import {
  CoordinateStack,
  coordinateCanvas2DContext,
  coordinateDynamicCanvas2DContext,
  type CoordinateMappingFocus,
} from "./CoordinateStack"
import { createCoordinateSceneLayout } from "./coordinateSceneModel"
import {
  containsRect,
  clientReferenceRange,
  contentReferenceRange,
  formatPoint,
  formatRect,
  LAB_CONTENT_BOUNDS,
  LAB_SHAPE,
  readCoordinateEvidence,
  type CoordinateEvidence,
  type CoordinateEventEvidence,
  type CoordinateProbe,
} from "./coordinateLabModel"

const isSpacePressed = (keys: Set<string>) => keys.has(" ") || keys.has("Spacebar")

type CssDisplayTransform = {
  offsetX: number
  offsetY: number
  scaleX: number
  scaleY: number
}

const DEFAULT_CSS_DISPLAY: Readonly<CssDisplayTransform> = {
  offsetX: 0,
  offsetY: 0,
  scaleX: 0.85,
  scaleY: 0.85,
}

const VIEWPORT_MIN_SCALE = 0.4
const INITIAL_VIEWPORT_SCALE = 0.818
const LIVE_PLOT_BOTTOM = 496
const LIVE_PLOT_RIGHT = 650
const LIVE_GRID_STEP = 100 / 3
const INITIAL_CONTENT_POINT: Readonly<Coordinate> = {
  x: LAB_SHAPE.x + 71,
  // Keep the real sample above the Shape by enough logical space for the point,
  // glow, and Shape edge to remain distinct after the initial viewport scale.
  y: LAB_SHAPE.y - 28,
}

const INITIAL_PROBE: CoordinateProbe = {
  client: { x: 0, y: 0 },
  view: { x: 0, y: 0 },
  content: { x: 0, y: 0 },
  viewSize: { width: 320, height: 440 },
  surface: { left: 0, top: 0, width: 320, height: 440, scaleX: 1, scaleY: 1 },
}

const COORDINATE_LIVE_LAYERS = [
  { backend: "canvas2d", context: coordinateDynamicCanvas2DContext },
  { backend: "canvas2d", context: coordinateCanvas2DContext },
] satisfies CanvasLayerConfig[]

function fillLiveShape(this: Rectangle, { context }: ShapeDrawProps) {
  const gradient = context.createLinearGradient(this.x, this.y, this.x, this.y + this.height)
  gradient.addColorStop(0, "rgb(34 77 186 / 0.72)")
  gradient.addColorStop(1, "rgb(42 87 194 / 0.72)")
  context.fillStyle = gradient
  context.fillRect(this.x, this.y, this.width, this.height)
}

const spaceMoveEnd: EventProps<string> = {
  name: "moveend",
  trigger: MOUSE_EVENTS.MOUSE_UP,
  successCallback: ({ store, deleteEvent }) => {
    store.set("coordinatePanning", false)
    deleteEvent("move")
    deleteEvent("moveend")
  },
}

const spaceMove: EventProps<string> = {
  name: "move",
  trigger: MOUSE_EVENTS.MOUSE_MOVE,
  conditionCallback: ({ e }) => isSpacePressed(e.pressedKeys) && e.pressedKeys.has("mouse0"),
  successCallback: ({ store }) => {
    store.set("coordinatePanning", true)
    return spaceMoveEnd
  },
}

const spaceStartMove: EventProps<string> = {
  name: "startmove",
  trigger: MOUSE_EVENTS.MOUSE_DOWN,
  conditionCallback: ({ e }) => isSpacePressed(e.pressedKeys) && e.pressedKeys.has("mouse0"),
  successCallback: ({ store }) => {
    store.set("coordinatePanning", false)
    return [spaceMove, spaceMoveEnd]
  },
}

function surfaceFrame({
  logicalWidth,
  logicalHeight,
  clientRect,
}: {
  logicalWidth: number
  logicalHeight: number
  clientRect: { left: number; top: number; width: number; height: number }
}) {
  const width = clientRect.width || logicalWidth
  const height = clientRect.height || logicalHeight
  return {
    left: clientRect.left,
    top: clientRect.top,
    width,
    height,
    scaleX: logicalWidth / width,
    scaleY: logicalHeight / height,
  }
}

const scaleFactors = ({ scaleX, scaleY }: CoordinateProbe["surface"]) =>
  `(${scaleX.toFixed(2)}, ${scaleY.toFixed(2)})`

const coordinatesMatch = (
  first: Readonly<Coordinate>,
  second: Readonly<Coordinate>,
  tolerance = 0.01,
) => Math.abs(first.x - second.x) <= tolerance
  && Math.abs(first.y - second.y) <= tolerance

function clientRangeForProbe(
  probe: Readonly<CoordinateProbe>,
  _cssDisplay: Readonly<CssDisplayTransform>,
) {
  // Freeze a legible Client-space window around the initial real DOM surface.
  // Subsequent CSS controls move that surface inside this window instead of
  // shrinking the default evidence to reserve every possible future extreme.
  return clientReferenceRange(probe)
}

function initialContentViewport(width: number, height: number): Readonly<ViewportState> {
  const safeRight = LAB_SHAPE.x + LAB_SHAPE.width + 24
  const safeBottom = LAB_SHAPE.y + LAB_SHAPE.height + 24
  const scale = Math.max(VIEWPORT_MIN_SCALE, Math.min(
    INITIAL_VIEWPORT_SCALE,
    width / safeRight,
    height / safeBottom,
  ))
  return {
    x: 59,
    y: 19,
    scale,
  }
}

export function coordinateContentBoundsStyle(mappingFocus: CoordinateMappingFocus) {
  const visible = mappingFocus === "content-view"
  return {
    fillConfig: { color: rgba(47, 138, 104, visible ? 0.006 : 0) },
    strokeConfig: { color: rgba(47, 138, 104, visible ? 0.18 : 0), lineWidth: 1 },
  }
}

export default function CoordinatesExample() {
  const { text } = useI18n()
  const toolsRef = useRef<StayTools>()
  const liveExhibitRef = useRef<HTMLElement | null>(null)
  const homeViewportRef = useRef<Readonly<ViewportState>>({ x: 0, y: 0, scale: 1 })
  const surfaceCanvasRef = useRef<ReturnType<StayTools["appendChild"]>["canvas"]>()
  const contentBoundsRef = useRef<Rectangle>()
  const contentShapeRef = useRef<Rectangle>()
  const markerRef = useRef<{ halo: Circle; dot: Circle; horizontal: Line; vertical: Line; label: StayText }>()
  const markerContentRef = useRef<Readonly<Coordinate>>(INITIAL_CONTENT_POINT)
  const pendingProbeFrameRef = useRef<number>()
  const pendingProbeRef = useRef<{
    canvas: Parameters<ListenerProps["callback"]>[0]["canvas"]
    client: Coordinate
    content: Coordinate
    eventEvidence?: CoordinateEventEvidence
    surface: CoordinateProbe["surface"]
    tools: StayTools
    view: Coordinate
    viewport: Readonly<ViewportState>
  }>()
  const [cssDisplay, setCssDisplay] = useState<CssDisplayTransform>({ ...DEFAULT_CSS_DISPLAY })
  const cssDisplayRef = useRef<Readonly<CssDisplayTransform>>(cssDisplay)
  cssDisplayRef.current = cssDisplay
  const [clientRange, setClientRange] = useState(() => clientReferenceRange(INITIAL_PROBE))
  const [probe, setProbe] = useState<CoordinateProbe>(INITIAL_PROBE)
  const [coordinateEvidence, setCoordinateEvidence] = useState<CoordinateEvidence>()
  const [eventEvidence, setEventEvidence] = useState<CoordinateEventEvidence>()
  const [viewport, setViewport] = useState<Readonly<ViewportState>>({ x: 0, y: 0, scale: 1 })
  const [mappingFocus, setMappingFocus] = useState<CoordinateMappingFocus>("view-client")
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [sceneLayout, setSceneLayout] = useState(() => createCoordinateSceneLayout(1280, 720))

  useLayoutEffect(() => {
    contentBoundsRef.current?.update(coordinateContentBoundsStyle(mappingFocus))
  }, [mappingFocus])

  useLayoutEffect(() => () => {
    if (pendingProbeFrameRef.current !== undefined) {
      window.cancelAnimationFrame(pendingProbeFrameRef.current)
    }
  }, [])

  const captureCoordinateEvidence = (
    tools: StayTools,
    canvas: NonNullable<typeof surfaceCanvasRef.current>,
  ) => {
    const contentShape = contentShapeRef.current
    const contentBounds = contentBoundsRef.current
    if (!contentShape || !contentBounds) return
    setCoordinateEvidence(readCoordinateEvidence(tools.coordinates, {
      width: canvas.width,
      height: canvas.height,
    }, contentShape.getBound(), contentBounds.getBound()))
  }

  const syncLiveSurface = (updatesClientReference: boolean) => {
    const canvas = surfaceCanvasRef.current
    const tools = toolsRef.current
    if (!canvas || !tools) return
    const content = markerContentRef.current
    const view = tools.coordinates.contentToView(content)
    const client = tools.coordinates.viewToClient(view)
    const nextProbe = {
      client,
      view,
      content,
      viewSize: { width: canvas.width, height: canvas.height },
      surface: surfaceFrame(canvas.getSurfaceMetrics()),
    }
    setProbe(nextProbe)
    if (updatesClientReference) {
      setClientRange(clientRangeForProbe(nextProbe, cssDisplayRef.current))
    }
    captureCoordinateEvidence(tools, canvas)
  }

  useLayoutEffect(() => {
    const output = liveExhibitRef.current
    if (!output) return
    const sync = () => syncLiveSurface(true)
    sync()
    window.addEventListener("resize", sync)
    window.addEventListener("scroll", sync, { passive: true })
    const observer = typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(sync)
    observer?.observe(output)
    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", sync)
      window.removeEventListener("scroll", sync)
    }
  }, [])

  const moveMarker = (point: Coordinate) => {
    markerContentRef.current = point
    const marker = markerRef.current
    if (!marker) return
    marker.halo.update(point)
    marker.dot.update(point)
    marker.horizontal.update({ x1: -600, y1: point.y, x2: 1400, y2: point.y })
    marker.vertical.update({ x1: point.x, y1: -600, x2: point.x, y2: 1200 })
    marker.label.update({
      x: point.x - 28,
      y: point.y - 152,
      text: `(${formatPoint(point)})`,
    })
  }

  const syncProbeWithViewport = (viewport: Readonly<ViewportState>) => {
    setViewport(viewport)
    const tools = toolsRef.current
    const canvas = surfaceCanvasRef.current
    if (!tools) return
    setProbe((current) => {
      const content = tools.coordinates.viewToContent(current.view)
      moveMarker(content)
      return { ...current, content }
    })
    if (canvas) captureCoordinateEvidence(tools, canvas)
  }

  useLayoutEffect(() => {
    syncLiveSurface(false)
  }, [cssDisplay])

  useLayoutEffect(() => {
    // The root Canvas owns the physical Output placement. Re-sample the live
    // Canvas after that placement commits so the displayed Client coordinate
    // and the cross-canvas signal share the same current DOM frame.
    syncLiveSurface(true)
  }, [
    sceneLayout.output.height,
    sceneLayout.output.width,
    sceneLayout.output.x,
    sceneLayout.output.y,
    sceneLayout.outputHeaderHeight,
  ])

  const listeners = useMemo<ListenerProps[]>(() => {
    const readObservation = (
      { e, originEvent, canvas, tools }: Parameters<ListenerProps["callback"]>[0],
      nextViewport?: Readonly<ViewportState>,
      recordsEventEvidence = true,
    ) => {
      if (!hasPointerPosition(e) || !(originEvent instanceof MouseEvent)) return false
      const client = { x: originEvent.clientX, y: originEvent.clientY }
      const view = tools.coordinates.clientToView(client)
      const viewport = nextViewport ?? tools.viewport.get()
      const content = tools.coordinates.viewToContent(view)
      return {
        canvas,
        client,
        content,
        eventEvidence: recordsEventEvidence
          ? {
              point: e.point,
              facadeContent: content,
              matchesFacade: coordinatesMatch(e.point, content),
            }
          : undefined,
        surface: surfaceFrame(canvas.getSurfaceMetrics()),
        tools,
        view,
        viewport,
      }
    }

    const commitObservation = (
      observation: NonNullable<typeof pendingProbeRef.current>,
      updateMarker = true,
    ) => {
      const { canvas, client, content, eventEvidence, surface, tools, view, viewport } = observation
      if (updateMarker) moveMarker(content)
      setProbe({
        client,
        view,
        content,
        viewSize: { width: canvas.width, height: canvas.height },
        surface,
      })
      if (eventEvidence) setEventEvidence(eventEvidence)
      setViewport(viewport)
      captureCoordinateEvidence(tools, canvas)
    }

    const observe = (
      props: Parameters<ListenerProps["callback"]>[0],
      updateMarker = true,
      nextViewport?: Readonly<ViewportState>,
      recordsEventEvidence = true,
    ) => {
      const observation = readObservation(props, nextViewport, recordsEventEvidence)
      if (!observation) return false
      commitObservation(observation, updateMarker)
      return true
    }

    const cancelPendingProbe = () => {
      pendingProbeRef.current = undefined
      if (pendingProbeFrameRef.current === undefined) return
      window.cancelAnimationFrame(pendingProbeFrameRef.current)
      pendingProbeFrameRef.current = undefined
    }

    const queueProbe = (props: Parameters<ListenerProps["callback"]>[0]) => {
      const observation = readObservation(props)
      if (!observation) return
      pendingProbeRef.current = observation
      if (pendingProbeFrameRef.current !== undefined) return
      pendingProbeFrameRef.current = window.requestAnimationFrame(() => {
        pendingProbeFrameRef.current = undefined
        const pending = pendingProbeRef.current
        pendingProbeRef.current = undefined
        if (pending) commitObservation(pending)
      })
    }

    return [
      {
        name: "coordinate-probe",
        selector: ".stay-canvas",
        event: ["mousemove", "mousedown"],
        callback: (props) => {
          if (props.originEvent.type === "mousemove" || props.originEvent.type === "pointermove") {
            const isPanning = isSpacePressed(props.e.pressedKeys)
              && props.e.pressedKeys.has("mouse0")
            if (!isPanning) queueProbe(props)
            return
          }
          cancelPendingProbe()
          observe(props)
        },
      },
      {
        name: "coordinate-pan",
        selector: ".stay-canvas",
        event: ["startmove", "move", "moveend"],
        callback: (props) => ({
          startmove: () => {
            cancelPendingProbe()
            props.tools.changeCursor("grabbing")
            return { originViewport: props.tools.viewport.get() }
          },
          move: () => {
            cancelPendingProbe()
            setMappingFocus("content-view")
            if (hasPointerPosition(props.e) && props.originEvent instanceof MouseEvent) {
              const eventClient = { x: props.originEvent.clientX, y: props.originEvent.clientY }
              const eventView = props.tools.coordinates.clientToView(eventClient)
              const eventFacadeContent = props.tools.coordinates.viewToContent(eventView)
              setEventEvidence({
                point: props.e.point,
                facadeContent: eventFacadeContent,
                matchesFacade: coordinatesMatch(props.e.point, eventFacadeContent),
              })
            }
            const viewport = props.tools.viewport.panBy(props.e.movement ?? { x: 0, y: 0 })
            observe(props, true, viewport, false)
            return props.composeStore
          },
          moveend: () => {
            const viewport = props.e.cancelled && props.composeStore.originViewport
              ? props.tools.viewport.restore(props.composeStore.originViewport)
              : props.tools.viewport.get()
            const keepsLastClientSample = props.e.cancelled || props.originEvent.type === "lostpointercapture"
            if (keepsLastClientSample) {
              syncProbeWithViewport(viewport)
            } else if (!observe(props, true, viewport)) {
              syncProbeWithViewport(viewport)
            }
            props.tools.changeCursor(isSpacePressed(props.e.pressedKeys) ? "grab" : "default")
            return { originViewport: undefined }
          },
        }),
      },
      {
        name: "coordinate-zoom",
        selector: ".stay-canvas",
        event: ["zoomin", "zoomout"],
        callback: ({ e, originEvent, tools, canvas }) => {
          if (!hasPointerPosition(e) || e.deltaY === undefined || !(originEvent instanceof MouseEvent)) return
          cancelPendingProbe()
          originEvent.preventDefault()
          setMappingFocus("content-view")
          const client = { x: originEvent.clientX, y: originEvent.clientY }
          const view = tools.coordinates.clientToView(client)
          const eventFacadeContent = tools.coordinates.viewToContent(view)
          setEventEvidence({
            point: e.point,
            facadeContent: eventFacadeContent,
            matchesFacade: coordinatesMatch(e.point, eventFacadeContent),
          })
          const viewport = tools.viewport.zoomBy(Math.max(0.1, 1 - e.deltaY * 0.001), e.point)
          const content = tools.coordinates.viewToContent(view)
          moveMarker(content)
          setProbe({
            client,
            view,
            content,
            viewSize: { width: canvas.width, height: canvas.height },
            surface: surfaceFrame(canvas.getSurfaceMetrics()),
          })
          setViewport(viewport)
          captureCoordinateEvidence(tools, canvas)
        },
      },
      {
        name: "coordinate-space-key",
        event: ["keydown", "keyup"],
        callback: ({ e, originEvent, tools }) => {
          if (!isSpacePressed(e.pressedKeys) && e.key !== " " && e.key !== "Spacebar") return
          originEvent.preventDefault()
          tools.changeCursor(e.name === "keydown" ? "grab" : "default")
        },
      },
    ]
  }, [])

  const mounted = (tools: StayTools) => {
    toolsRef.current = tools
    const grid = new Map<string, Line>()
    const liveGridColor = { r: 175, g: 187, b: 183, a: 0.8 }
    for (let x = 0; x <= LIVE_PLOT_RIGHT; x += LIVE_GRID_STEP) {
      grid.set(`x:${x}`, new Line({ x1: x, y1: 0, x2: x, y2: LIVE_PLOT_BOTTOM, zIndex: -10, strokeConfig: { color: liveGridColor, lineWidth: x === 0 ? 1.4 : 0.9 } }))
    }
    for (let y = 0; y <= LIVE_PLOT_BOTTOM; y += LIVE_GRID_STEP) {
      grid.set(`y:${y}`, new Line({
        x1: 0,
        y1: y,
        x2: LIVE_PLOT_RIGHT,
        y2: y,
        zIndex: -10,
        strokeConfig: {
          color: y === 0 ? rgba(255, 255, 255, 0.5) : liveGridColor,
          lineWidth: y === 0 ? 1 : 0.9,
        },
      }))
    }
    const gridChild = tools.appendChild({ className: "coordinate-grid", shape: grid })
    const homeViewport = initialContentViewport(gridChild.canvas.width, gridChild.canvas.height)
    const visibleLeft = -homeViewport.x / homeViewport.scale
    const visibleTop = -homeViewport.y / homeViewport.scale
    const visibleRight = visibleLeft + gridChild.canvas.width / homeViewport.scale
    const visibleBottom = visibleTop + gridChild.canvas.height / homeViewport.scale
    const plotWidth = Math.min(LIVE_PLOT_RIGHT, visibleRight)
    const plotHeight = Math.min(LIVE_PLOT_BOTTOM, visibleBottom)
    tools.appendChild({
      className: "coordinate-live-glass-wash",
      shape: [
        new Rectangle({
          x: 0,
          y: 0,
          width: plotWidth,
          height: plotHeight,
          zIndex: -12,
          filter: "blur(2px)",
          fillConfig: { color: rgba(236, 239, 238, 0.55) },
          strokeConfig: { color: rgba(0, 0, 0, 0), lineWidth: 0 },
        }),
      ],
    })
    const axisLineColor = rgba(255, 255, 255, 0.9)
    const axisTextColor = rgba(25, 32, 31, 0.94)
    tools.appendChild({
      className: "coordinate-live-axes",
      shape: [
        new Line({ x1: 0, y1: LIVE_PLOT_BOTTOM, x2: LIVE_PLOT_RIGHT, y2: LIVE_PLOT_BOTTOM, zIndex: -8, strokeConfig: { color: axisLineColor, lineWidth: 1.3 } }),
        new Line({ x1: 0, y1: 0, x2: 0, y2: LIVE_PLOT_BOTTOM, zIndex: -8, strokeConfig: { color: axisLineColor, lineWidth: 1.3 } }),
        new Line({ x1: LIVE_PLOT_RIGHT, y1: 0, x2: LIVE_PLOT_RIGHT, y2: LIVE_PLOT_BOTTOM, zIndex: -8, strokeConfig: { color: rgba(255, 255, 255, 1), lineWidth: 1.8 } }),
        new StayText({
          x: LIVE_PLOT_RIGHT + 22,
          y: LIVE_PLOT_BOTTOM + 22,
          text: "x",
          zIndex: -7,
          textAlign: "right",
          textBaseline: "middle",
          font: { size: 18, fontWeight: 400 },
          fillConfig: { color: axisTextColor },
        }),
        new StayText({
          x: -20,
          y: visibleTop + 5,
          text: "y ↓",
          zIndex: -7,
          textAlign: "right",
          textBaseline: "top",
          font: { size: 18, fontWeight: 400 },
          fillConfig: { color: axisTextColor },
        }),
        ...([0, 100, 200, 300, 400, 500] as const).map((value) => new StayText({
          x: value,
          y: LIVE_PLOT_BOTTOM + 18,
          text: String(value),
          zIndex: -7,
          textAlign: "center",
          textBaseline: "top",
          font: { size: 20, fontWeight: 300, fontFamily: '"Helvetica Neue", Arial, sans-serif' },
          fillConfig: { color: rgba(25, 32, 31, 0.92) },
        })),
        ...([100, 200, 300, 400] as const).map((value) => new StayText({
          x: -26,
          y: value,
          text: String(value),
          zIndex: -7,
          textAlign: "right",
          textBaseline: "middle",
          font: { size: 20, fontWeight: 300, fontFamily: '"Helvetica Neue", Arial, sans-serif' },
          fillConfig: { color: rgba(25, 32, 31, 0.92) },
        })),
      ],
    })
    surfaceCanvasRef.current = gridChild.canvas
    setProbe((current) => ({
      ...current,
      viewSize: { width: gridChild.canvas.width, height: gridChild.canvas.height },
    }))
    const contentBounds = new Rectangle({
      ...LAB_CONTENT_BOUNDS,
      zIndex: -5,
      ...coordinateContentBoundsStyle("view-client"),
    })
    contentBoundsRef.current = contentBounds
    tools.appendChild({
      className: "coordinate-content-bounds",
      shape: [contentBounds],
    })
    const contentShape = new Rectangle({
      ...LAB_SHAPE,
      stateDrawFuncMap: {
        default: {
          commonDraw: Rectangle.prototype.commonDraw,
          stroke: Rectangle.prototype.stroke,
          fill: fillLiveShape,
          afterDraw: Rectangle.prototype.afterDraw,
        },
      },
      fillConfig: { color: rgba(38, 82, 190, 0.72) },
      strokeConfig: { color: rgba(89, 145, 255, 1), lineWidth: 1.8 },
    })
    contentShapeRef.current = contentShape
    tools.appendChild({
      className: "coordinate-object",
      shape: [
        new Rectangle({
          x: LAB_SHAPE.x + 7,
          y: LAB_SHAPE.y + 9,
          width: LAB_SHAPE.width,
          height: LAB_SHAPE.height,
          zIndex: -1,
          filter: "blur(6px)",
          fillConfig: { color: rgba(65, 118, 240, 0.2) },
          strokeConfig: { color: rgba(39, 51, 67, 0), lineWidth: 0 },
        }),
        contentShape,
      ],
    })
    const halo = new Circle({
      x: 0,
      y: 0,
      radius: 13,
      zIndex: 19,
      fillConfig: { color: rgba(229, 109, 72, 0.07) },
      strokeConfig: { color: rgba(229, 109, 72, 0.48), lineWidth: 1.2 },
    })
    const dot = new Circle({
      x: 0,
      y: 0,
      radius: 7.5,
      zIndex: 20,
      fillConfig: { color: { ...colors.orange, a: 0.92 } },
      strokeConfig: { color: rgba(255, 255, 255, 0.96), lineWidth: 1.8 },
    })
    const markerGuideStyle = { color: rgba(229, 109, 72, 0.48), lineWidth: 1.2, dash: [6, 6] }
    const horizontal = new Line({ x1: -600, y1: 0, x2: 1400, y2: 0, zIndex: 19, strokeConfig: markerGuideStyle })
    const vertical = new Line({ x1: 0, y1: -600, x2: 0, y2: 1200, zIndex: 19, strokeConfig: markerGuideStyle })
    const label = new StayText({
      x: -28,
      y: -152,
      text: "(0, 0)",
      textBaseline: "bottom",
      font: { size: 16, fontWeight: 500 },
      zIndex: 20,
      fillConfig: { color: colors.orange },
    })
    markerRef.current = { halo, dot, horizontal, vertical, label }
    tools.appendChild({ className: "coordinate-marker", shape: [halo, dot, horizontal, vertical, label] })
    const surface = surfaceFrame(gridChild.canvas.getSurfaceMetrics())
    homeViewportRef.current = homeViewport
    const currentViewport = tools.viewport.restore(homeViewport)
    const content = { ...INITIAL_CONTENT_POINT }
    const view = tools.coordinates.contentToView(content)
    const client = tools.coordinates.viewToClient(view)
    setViewport(currentViewport)
    moveMarker(content)
    const initialProbe = {
      client,
      view,
      content,
      viewSize: { width: gridChild.canvas.width, height: gridChild.canvas.height },
      surface,
    }
    setProbe(initialProbe)
    captureCoordinateEvidence(tools, gridChild.canvas)
    setClientRange(clientRangeForProbe(initialProbe, DEFAULT_CSS_DISPLAY))
  }

  const changeViewport = (action: (tools: StayTools) => Readonly<ViewportState>) => {
    const tools = toolsRef.current
    if (!tools) return
    setMappingFocus("content-view")
    const viewport = action(tools)
    syncProbeWithViewport(viewport)
  }

  const updateCssDisplay = (patch: Partial<CssDisplayTransform>) => {
    setMappingFocus("view-client")
    setCssDisplay((current) => ({ ...current, ...patch }))
  }

  const shapeProjection = coordinateEvidence?.shape
  const visibleContent = coordinateEvidence?.visibleContent
  const visibleWindowIsContained = visibleContent
    ? containsRect(contentReferenceRange(probe), visibleContent)
    : false
  const viewWidthFormula = shapeProjection
    ? `tools.coordinates.contentToView · ${Math.round(shapeProjection.view.width)} px`
    : "measuring"
  const clientWidthFormula = shapeProjection
    ? `tools.coordinates.contentToClient · ${Math.round(shapeProjection.client.width)} px`
    : "measuring"

  return (
    <div className="coordinate-experience">
      <CoordinateStack
        clientRange={clientRange}
        coordinateEvidence={coordinateEvidence}
        evidenceOpen={evidenceOpen}
        cssDisplay={cssDisplay}
        eventEvidence={eventEvidence}
        mappingFocus={mappingFocus}
        onCssDisplayChange={updateCssDisplay}
        onEvidenceToggle={() => setEvidenceOpen((open) => !open)}
        onSceneLayoutChange={setSceneLayout}
        onViewportAction={(action) => {
          if (action === "zoom-in") {
            changeViewport((tools) => tools.viewport.zoomBy(1.2))
          } else if (action === "zoom-out") {
            changeViewport((tools) => tools.viewport.zoomBy(1 / 1.2))
          } else if (action === "pan") {
            changeViewport((tools) => tools.viewport.panBy({ x: 40, y: 20 }))
          } else {
            changeViewport((tools) => tools.viewport.restore(homeViewportRef.current))
          }
        }}
        probe={probe}
        viewport={viewport}
      />
      <header className="coordinate-hero coordinate-semantic-only">
        <p>{text("Coordinate laboratory · 01", "坐标实验室 · 01")}</p>
        <h2>
          <span>{text("One point,", "一个点，")}</span>
          <span>{text("three spaces.", "三个空间。")}</span>
        </h2>
        <span>{text(
          "One point and one Shape, mapped across three coordinate spaces and rendered on Live Canvas.",
          "同一点与同一 Shape，在三个坐标空间中映射，最终呈现于 Live Canvas。",
        )}</span>
      </header>
      <section className="coordinate-stage">
        <section
          className={`coordinate-live-exhibit coordinate-focus-${mappingFocus}`}
          ref={liveExhibitRef}
          style={{
            height: sceneLayout.output.height,
            left: sceneLayout.output.x,
            paddingBottom: sceneLayout.outputGroundGap,
            top: sceneLayout.output.y,
            width: sceneLayout.output.width,
            gridTemplateRows: `${sceneLayout.outputHeaderHeight}px minmax(0, 1fr)`,
          }}
        >
          <header className="coordinate-live-heading">
            <div className="coordinate-semantic-only">
              <small>Output</small>
              <h3>Live Canvas</h3>
              <span className="coordinate-live-range">
                {visibleContent
                  ? `Content frame · x ${Math.round(visibleContent.x)}—${Math.round(visibleContent.x + visibleContent.width)} · y ${Math.round(visibleContent.y)}—${Math.round(visibleContent.y + visibleContent.height)}`
                  : "Content frame · measuring"}
              </span>
            </div>
          </header>
          <CanvasSurface
            canvasDisplayTransform={cssDisplay}
            className="coordinate-live-surface"
            fitInitialDisplayTransformToViewport
            shrinkToViewport
            viewportLabel={`CLIENT DOM · ${Math.round(cssDisplay.scaleX * 100)}% × ${Math.round(cssDisplay.scaleY * 100)}%`}
          >
            <StayCanvas
              className="demo-canvas coordinate-canvas"
              eventList={[spaceStartMove]}
              height={360}
              layers={COORDINATE_LIVE_LAYERS}
              listenerList={listeners}
              mounted={mounted}
              passive={false}
              viewport={{ minScale: VIEWPORT_MIN_SCALE, maxScale: 3 }}
              width={480}
            />
          </CanvasSurface>
        </section>
      </section>

      <footer
        aria-label={text("Coordinate conversion status", "坐标转换状态")}
        className="coordinate-console coordinate-semantic-only"
      >
        <section
          aria-label={text("Coordinate conversion flow", "坐标转换流程")}
          aria-live="polite"
          className="coordinate-flow"
        >
          <h3>Coordinates</h3>
          <p className="coordinate-sync-status">{eventEvidence
            ? eventEvidence.matchesFacade
              ? text("Event matches facade", "事件与 facade 一致")
              : text("Event differs from facade", "事件与 facade 不一致")
            : text("Awaiting Canvas event", "等待 Canvas 事件")}</p>
          <dl className="coordinate-flow-values">
            <div className="coordinate-flow-client">
              <dt>Client</dt>
              <dd><strong>{formatPoint(probe.client)}</strong> · {text("Browser", "浏览器")}</dd>
            </div>
            <div className="coordinate-flow-view">
              <dt>View</dt>
              <dd><strong>{formatPoint(probe.view)}</strong> · Canvas</dd>
            </div>
            <div className="coordinate-flow-result">
              <dt>Content</dt>
              <dd><strong>{formatPoint(probe.content)}</strong> · {text("Scene coordinates", "场景坐标")}</dd>
            </div>
          </dl>
          <p className="coordinate-flow-operation">
            <span>{text(
              "Subtract the Canvas DOM origin, then apply the inverse CSS scale",
              "减去 Canvas DOM 原点，再乘 CSS 缩放的倒数（逻辑尺寸 ÷ DOM 尺寸）",
            )}</span>
            <code>[({formatPoint(probe.client)}) - ({Math.round(probe.surface.left)}, {Math.round(probe.surface.top)})] × {scaleFactors(probe.surface)}</code>
          </p>
          <p className="coordinate-flow-operation">
            <span>{text("Undo viewport offset and scale", "撤销 viewport 平移与缩放")}</span>
            <code>[({formatPoint(probe.view)}) - ({Math.round(viewport.x)}, {Math.round(viewport.y)})] ÷ {viewport.scale.toFixed(2)}</code>
          </p>
          <dl className="coordinate-control-status">
            <div>
              <dt>CSS display</dt>
              <dd className="coordinate-css-state"><code>translate({cssDisplay.offsetX}, {cssDisplay.offsetY}) scale({cssDisplay.scaleX.toFixed(2)}, {cssDisplay.scaleY.toFixed(2)})</code></dd>
            </div>
            <div>
              <dt>Viewport</dt>
              <dd className="coordinate-viewport-state"><code>translate({Math.round(viewport.x)}, {Math.round(viewport.y)}) scale({viewport.scale.toFixed(2)})</code></dd>
            </div>
            <div>
              <dt>Evidence</dt>
              <dd className="coordinate-evidence-state">{evidenceOpen ? "open" : "closed"}</dd>
            </div>
          </dl>
        </section>
      </footer>

      <aside
        aria-hidden={!evidenceOpen}
        className="coordinate-evidence coordinate-semantic-only"
        data-open={evidenceOpen ? "true" : "false"}
        hidden={!evidenceOpen}
        id="coordinate-evidence"
      >
        <div className="coordinate-evidence-heading">
          <span>{text("Projection evidence", "投影证据")}</span>
        </div>
        <div className="coordinate-zoom-proof" aria-label={text("Zoom cause and effect", "缩放因果证据")}>
          <p>{text("Zoom changes the projection, not the Shape", "缩放改变投影，不改变 Shape")}</p>
          <dl>
          <div className="coordinate-proof-stable">
            <dt>{text("Content Shape geometry", "Content Shape 几何")}</dt>
            <dd>{coordinateEvidence ? formatRect(coordinateEvidence.shape.content) : "measuring"}</dd>
            <small>{text(
              `Fixed source data inside explicit Demo Content bounds ${formatRect(LAB_CONTENT_BOUNDS)}. Root itself has no geometry. The logical View stays ${Math.round(probe.viewSize.width)}×${Math.round(probe.viewSize.height)}; CSS controls the current DOM footprint ${Math.round(probe.surface.width)}×${Math.round(probe.surface.height)}.`,
              `固定的源数据，位于显式定义的 Demo Content 边界 ${formatRect(LAB_CONTENT_BOUNDS)} 内。Root 本身没有几何边界。逻辑 View 保持 ${Math.round(probe.viewSize.width)}×${Math.round(probe.viewSize.height)}；当前 DOM 显示尺寸 ${Math.round(probe.surface.width)}×${Math.round(probe.surface.height)} 由 CSS 控制。`,
            )}</small>
          </div>
          <div>
            <dt>Viewport</dt>
            <dd>{Math.round(viewport.x)}, {Math.round(viewport.y)} / {Math.round(viewport.scale * 100)}%</dd>
            <small>{text("The value changed by zoom", "缩放实际修改的值")}</small>
          </div>
          <div className="coordinate-proof-client-map">
            <dt>{text("CSS View to Client", "CSS View 到 Client")}</dt>
            <dd>
              {Math.round(probe.viewSize.width)}×{Math.round(probe.viewSize.height)} → {Math.round(probe.surface.width)}×{Math.round(probe.surface.height)}
            </dd>
            <code>{text("CSS scale", "CSS 缩放")} {(1 / probe.surface.scaleX).toFixed(2)} × {(1 / probe.surface.scaleY).toFixed(2)}</code>
            <small>{text(
              `Fixed Client crop ${clientRange ? formatRect(clientRange) : "measuring"}; Canvas DOM moves and scales inside it.`,
              `固定 Client 裁切范围 ${clientRange ? formatRect(clientRange) : "测量中"}；Canvas DOM 在其中移动和缩放。`,
            )}</small>
          </div>
          <div className="coordinate-proof-changing">
            <dt>{text("View projection", "View 中的投影")}</dt>
            <dd>{shapeProjection ? formatRect(shapeProjection.view) : "measuring"}</dd>
            <code>{viewWidthFormula}</code>
          </div>
          <div className="coordinate-proof-changing">
            <dt>{text("Client footprint", "Client 中的显示区域")}</dt>
            <dd>{shapeProjection ? formatRect(shapeProjection.client) : "measuring"}</dd>
            <code>{clientWidthFormula}</code>
          </div>
          <div>
            <dt>{text("Visible Content window", "可见 Content 窗口")}</dt>
            <dd>{visibleContent ? formatRect(visibleContent) : "measuring"}</dd>
            <small>{visibleWindowIsContained
              ? text("Fully shown in the fixed reference. It changes inversely while View stays fixed.", "完整显示在固定参考系中。View 不变时，它会反向变化。")
                : text("Extends beyond the fixed reference. Only the intersection is filled; no false boundary is drawn.", "超出固定参考系。只填充交集，不绘制伪造边界。")}</small>
          </div>
          <div>
            <dt>Canvas event · Content · e.point</dt>
            <dd>{eventEvidence
              ? `${formatPoint(eventEvidence.point)} · ${eventEvidence.matchesFacade ? "match" : "mismatch"}`
              : text("Awaiting event", "等待事件")}</dd>
          </div>
          </dl>
        </div>
      </aside>
    </div>
  )
}

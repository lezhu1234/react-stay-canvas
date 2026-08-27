import { useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  Circle,
  type Coordinate,
  type EventProps,
  Line,
  type ListenerProps,
  MOUSE_EVENTS,
  Rectangle,
  StayCanvas,
  StayText,
  type StayTools,
  type ViewportState,
} from "react-stay-canvas"

import { Button, CanvasSurface, colors, rgba, Toolbar } from "../../components/DemoKit"
import { useI18n } from "../../i18n"
import { hasPointerPosition } from "../actionEventGuards"
import { CoordinateStack, type CoordinateMappingFocus } from "./CoordinateStack"
import {
  containsRect,
  clientReferenceRange,
  contentReferenceRange,
  formatPoint,
  formatRect,
  LAB_CONTENT_BOUNDS,
  LAB_SHAPE,
  projectContentRect,
  type CoordinateProbe,
  visibleContentRange,
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
  scaleX: 0.8,
  scaleY: 0.8,
}

const CSS_SCALE_MAX = 1
const CSS_OFFSET_MAX = 96
const VIEWPORT_MIN_SCALE = 0.4

function ViewportIcon({ name }: { name: "zoom-in" | "zoom-out" | "pan" | "reset" }) {
  if (name === "pan") {
    return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8.5 11V6.7a1.45 1.45 0 0 1 2.9 0V10 5.2a1.45 1.45 0 0 1 2.9 0V10 6.2a1.45 1.45 0 0 1 2.9 0v5.3l.9-1.1a1.55 1.55 0 0 1 2.35-.08 1.6 1.6 0 0 1 .08 2.06l-3.4 4.65A6.2 6.2 0 0 1 12.1 19.6H11a6.1 6.1 0 0 1-5.4-3.25L3.7 12.8a1.5 1.5 0 0 1 2.55-1.56L8.5 14" /></svg>
  }
  if (name === "reset") {
    return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" /></svg>
  }
  const isZoomIn = name === "zoom-in"
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.2 15.2 5 5M7.5 10.5h6" />{isZoomIn && <path d="M10.5 7.5v6" />}</svg>
}

function ConsoleLabel({ index, children }: { index: number; children: string }) {
  return <span className="coordinate-console-label"><b>{index}</b>{children}</span>
}

const INITIAL_PROBE: CoordinateProbe = {
  client: { x: 0, y: 0 },
  view: { x: 0, y: 0 },
  content: { x: 0, y: 0 },
  viewSize: { width: 320, height: 440 },
  surface: { left: 0, top: 0, width: 320, height: 440, scaleX: 1, scaleY: 1 },
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const spaceMoveEnd: EventProps<string> = {
  name: "moveend",
  trigger: MOUSE_EVENTS.MOUSE_UP,
  conditionCallback: ({ e, store }) => Boolean(e.cancelled || store.get("coordinatePanning")),
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

function fitContentViewport(width: number, height: number): Readonly<ViewportState> {
  if (width >= LAB_CONTENT_BOUNDS.width && height >= LAB_CONTENT_BOUNDS.height) {
    return { x: 0, y: 0, scale: 1 }
  }

  const scale = Math.max(
    VIEWPORT_MIN_SCALE,
    Math.min(1, width / LAB_CONTENT_BOUNDS.width, height / LAB_CONTENT_BOUNDS.height),
  )
  return {
    x: (width - LAB_CONTENT_BOUNDS.width * scale) / 2,
    y: (height - LAB_CONTENT_BOUNDS.height * scale) / 2,
    scale,
  }
}

export default function CoordinatesExample() {
  const { text } = useI18n()
  const toolsRef = useRef<StayTools>()
  const homeViewportRef = useRef<Readonly<ViewportState>>({ x: 0, y: 0, scale: 1 })
  const surfaceCanvasRef = useRef<ReturnType<StayTools["appendChild"]>["canvas"]>()
  const markerRef = useRef<{ dot: Circle; horizontal: Line; vertical: Line; label: StayText }>()
  const [cssDisplay, setCssDisplay] = useState<CssDisplayTransform>({ ...DEFAULT_CSS_DISPLAY })
  const [clientRange, setClientRange] = useState(() => clientReferenceRange(INITIAL_PROBE))
  const [probe, setProbe] = useState<CoordinateProbe>(INITIAL_PROBE)
  const [eventPoint, setEventPoint] = useState<Coordinate>({ x: 0, y: 0 })
  const [viewport, setViewport] = useState<Readonly<ViewportState>>({ x: 0, y: 0, scale: 1 })
  const [mappingFocus, setMappingFocus] = useState<CoordinateMappingFocus>("view-client")
  const [evidenceOpen, setEvidenceOpen] = useState(false)

  const moveMarker = (point: Coordinate) => {
    const marker = markerRef.current
    if (!marker) return
    marker.dot.update(point)
    marker.horizontal.update({ x1: point.x - 18, y1: point.y, x2: point.x + 18, y2: point.y })
    marker.vertical.update({ x1: point.x, y1: point.y - 18, x2: point.x, y2: point.y + 18 })
    marker.label.update({ x: point.x + 14, y: point.y - 22 })
  }

  const syncProbeWithViewport = (viewport: Readonly<ViewportState>) => {
    setViewport(viewport)
    const tools = toolsRef.current
    if (!tools) return
    setProbe((current) => {
      const content = tools.coordinates.viewToContent(current.view)
      moveMarker(content)
      return { ...current, content }
    })
  }

  useLayoutEffect(() => {
    const canvas = surfaceCanvasRef.current
    const tools = toolsRef.current
    if (!canvas || !tools) return
    const surface = surfaceFrame(canvas.getSurfaceMetrics())
    setProbe((current) => ({
      ...current,
      client: tools.coordinates.viewToClient(current.view),
      surface,
      viewSize: { width: canvas.width, height: canvas.height },
    }))
  }, [cssDisplay])

  const listeners = useMemo<ListenerProps[]>(() => {
    const observe = (
      { e, originEvent, canvas, tools }: Parameters<ListenerProps["callback"]>[0],
      updateMarker = true,
      nextViewport?: Readonly<ViewportState>,
    ) => {
      if (!hasPointerPosition(e) || !(originEvent instanceof MouseEvent)) return false
      const client = { x: originEvent.clientX, y: originEvent.clientY }
      const view = tools.coordinates.clientToView(client)
      const viewport = nextViewport ?? tools.viewport.get()
      const content = tools.coordinates.viewToContent(view)
      if (updateMarker) moveMarker(content)
      setProbe({
        client,
        view,
        content,
        viewSize: { width: canvas.width, height: canvas.height },
        surface: surfaceFrame(canvas.getSurfaceMetrics()),
      })
      setEventPoint(e.point)
      setViewport(viewport)
      return true
    }

    return [
      {
        name: "coordinate-probe",
        selector: ".stay-canvas",
        event: ["mousemove", "mousedown"],
        callback: (props) => {
          observe(props)
        },
      },
      {
        name: "coordinate-pan",
        selector: ".stay-canvas",
        event: ["startmove", "move", "moveend"],
        callback: (props) => ({
          startmove: () => {
            props.tools.changeCursor("grabbing")
            return { originViewport: props.tools.viewport.get() }
          },
          move: () => {
            setMappingFocus("content-view")
            const viewport = props.tools.viewport.panBy(props.e.movement ?? { x: 0, y: 0 })
            observe(props, true, viewport)
            return props.composeStore
          },
          moveend: () => {
            const viewport = props.e.cancelled && props.composeStore.originViewport
              ? props.tools.viewport.restore(props.composeStore.originViewport)
              : props.tools.viewport.get()
            const keepsLastClientSample = props.e.cancelled || props.originEvent.type === "lostpointercapture"
            if (keepsLastClientSample) {
              if (hasPointerPosition(props.e)) setEventPoint(props.e.point)
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
          originEvent.preventDefault()
          setMappingFocus("content-view")
          const viewport = tools.viewport.zoomBy(Math.max(0.1, 1 - e.deltaY * 0.001), e.point)
          const client = { x: originEvent.clientX, y: originEvent.clientY }
          const view = tools.coordinates.clientToView(client)
          const content = tools.coordinates.viewToContent(view)
          moveMarker(content)
          setProbe({
            client,
            view,
            content,
            viewSize: { width: canvas.width, height: canvas.height },
            surface: surfaceFrame(canvas.getSurfaceMetrics()),
          })
          setEventPoint(e.point)
          setViewport(viewport)
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
    for (let x = -600; x <= 1400; x += 50) {
      grid.set(`x:${x}`, new Line({ x1: x, y1: -600, x2: x, y2: 1200, zIndex: -10, strokeConfig: { color: { r: 78, g: 89, b: 104, a: 0.1 }, lineWidth: x === 0 ? 2 : 1 } }))
    }
    for (let y = -600; y <= 1200; y += 50) {
      grid.set(`y:${y}`, new Line({ x1: -600, y1: y, x2: 1400, y2: y, zIndex: -10, strokeConfig: { color: { r: 78, g: 89, b: 104, a: 0.1 }, lineWidth: y === 0 ? 2 : 1 } }))
    }
    const gridChild = tools.appendChild({ className: "coordinate-grid", shape: grid })
    surfaceCanvasRef.current = gridChild.canvas
    setProbe((current) => ({
      ...current,
      viewSize: { width: gridChild.canvas.width, height: gridChild.canvas.height },
    }))
    const shapeCenterX = LAB_SHAPE.x + LAB_SHAPE.width / 2
    const shapeCenterY = LAB_SHAPE.y + LAB_SHAPE.height / 2
    tools.appendChild({
      className: "coordinate-content-bounds",
      shape: [
        new Rectangle({
          ...LAB_CONTENT_BOUNDS,
          zIndex: -5,
          fillConfig: { color: rgba(44, 137, 91, 0.035) },
          strokeConfig: { color: rgba(44, 137, 91, 0.72), lineWidth: 2 },
        }),
        new StayText({
          x: LAB_CONTENT_BOUNDS.x + 12,
          y: LAB_CONTENT_BOUNDS.y + 12,
          text: text("Demo Content bounds", "Demo Content 边界"),
          textBaseline: "top",
          zIndex: -4,
          font: { size: 12, fontWeight: 700 },
          fillConfig: { color: colors.green },
        }),
      ],
    })
    tools.appendChild({
      className: "coordinate-object",
      shape: [
        new Rectangle({
          x: LAB_SHAPE.x + 7,
          y: LAB_SHAPE.y + 9,
          width: LAB_SHAPE.width,
          height: LAB_SHAPE.height,
          zIndex: -1,
          filter: "blur(8px)",
          fillConfig: { color: rgba(39, 51, 67, 0.16) },
          strokeConfig: { color: rgba(39, 51, 67, 0), lineWidth: 0 },
        }),
        new Rectangle({ ...LAB_SHAPE, fillConfig: { color: colors.blueSoft }, strokeConfig: { color: colors.blue, lineWidth: 2 } }),
        new Line({
          x1: LAB_SHAPE.x + 18,
          y1: LAB_SHAPE.y + 38,
          x2: LAB_SHAPE.x + LAB_SHAPE.width - 18,
          y2: LAB_SHAPE.y + 38,
          strokeConfig: { color: rgba(54, 105, 221, 0.28), lineWidth: 1 },
        }),
        new StayText({ x: shapeCenterX, y: shapeCenterY - 8, text: text("Same Shape", "同一个 Shape"), textAlign: "center", textBaseline: "middle", font: { size: 18, fontWeight: 700 }, fillConfig: { color: colors.ink } }),
        new StayText({ x: shapeCenterX, y: shapeCenterY + 24, text: `Content ${formatRect(LAB_SHAPE)}`, textAlign: "center", textBaseline: "middle", font: { size: 12 }, fillConfig: { color: colors.gray } }),
      ],
    })
    const dot = new Circle({ x: 0, y: 0, radius: 6, zIndex: 20, fillConfig: { color: colors.orange } })
    const horizontal = new Line({ x1: -18, y1: 0, x2: 18, y2: 0, zIndex: 19, strokeConfig: { color: colors.orange, lineWidth: 2 } })
    const vertical = new Line({ x1: 0, y1: -18, x2: 0, y2: 18, zIndex: 19, strokeConfig: { color: colors.orange, lineWidth: 2 } })
    const label = new StayText({ x: 14, y: -22, text: "e.point (Content)", textBaseline: "bottom", font: { size: 11, fontWeight: 700 }, zIndex: 20, fillConfig: { color: colors.orange } })
    markerRef.current = { dot, horizontal, vertical, label }
    tools.appendChild({ className: "coordinate-marker", shape: [dot, horizontal, vertical, label] })
    const surface = surfaceFrame(gridChild.canvas.getSurfaceMetrics())
    const view = { x: gridChild.canvas.width / 2, y: gridChild.canvas.height / 2 }
    const client = tools.coordinates.viewToClient(view)
    const homeViewport = fitContentViewport(gridChild.canvas.width, gridChild.canvas.height)
    homeViewportRef.current = homeViewport
    const currentViewport = tools.viewport.restore(homeViewport)
    setViewport(currentViewport)
    const content = tools.coordinates.viewToContent(view)
    moveMarker(content)
    const initialProbe = {
      client,
      view,
      content,
      viewSize: { width: gridChild.canvas.width, height: gridChild.canvas.height },
      surface,
    }
    setProbe(initialProbe)
    setClientRange(clientReferenceRange(initialProbe, {
      x: surface.left + CSS_OFFSET_MAX - DEFAULT_CSS_DISPLAY.offsetX,
      y: surface.top + CSS_OFFSET_MAX - DEFAULT_CSS_DISPLAY.offsetY,
      width: gridChild.canvas.width * CSS_SCALE_MAX,
      height: gridChild.canvas.height * CSS_SCALE_MAX,
    }))
    setEventPoint(content)
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

  const shapeProjection = projectContentRect(probe, viewport)
  const visibleContent = visibleContentRange(probe, viewport)
  const visibleWindowIsContained = containsRect(contentReferenceRange(probe), visibleContent)
  const viewWidthFormula = `${LAB_SHAPE.width} × ${viewport.scale.toFixed(2)} = ${Math.round(shapeProjection.view.width)}`
  const clientWidthFormula = `${Math.round(shapeProjection.view.width)} ÷ ${probe.surface.scaleX.toFixed(2)} = ${Math.round(shapeProjection.client.width)}`

  return (
    <div className="coordinate-experience">
      <section className="coordinate-stage">
        <header className="coordinate-hero">
          <p>{text("Coordinate laboratory · 01", "坐标实验室 · 01")}</p>
          <h2>
            <span>{text("One point,", "一个点，")}</span>
            <span>{text("three spaces.", "三个空间。")}</span>
          </h2>
          <span>{text(
            "The same point, expressed and mapped across three coordinate spaces.",
            "同一个点在不同坐标空间中的表达与映射关系。",
          )}</span>
        </header>
        <div className="coordinate-workspace">
          <CoordinateStack clientRange={clientRange} mappingFocus={mappingFocus} probe={probe} viewport={viewport} />
          <section className={`coordinate-live-exhibit coordinate-focus-${mappingFocus}`}>
            <header className="coordinate-live-heading">
              <div>
                <h3>Live Canvas</h3>
                <span>CLIENT SPACE</span>
              </div>
              <p>{Math.round(probe.viewSize.width)} × {Math.round(probe.viewSize.height)}</p>
            </header>
            <CanvasSurface
              canvasDisplayTransform={cssDisplay}
              className="coordinate-live-surface"
              shrinkToViewport
              viewportLabel={`CLIENT DOM · ${Math.round(cssDisplay.scaleX * 100)}% × ${Math.round(cssDisplay.scaleY * 100)}%`}
            >
              <StayCanvas
                className="demo-canvas coordinate-canvas"
                eventList={[spaceStartMove]}
                height={360}
                layers={2}
                listenerList={listeners}
                mounted={mounted}
                passive={false}
                viewport={{ minScale: VIEWPORT_MIN_SCALE, maxScale: 3 }}
                width={480}
              />
            </CanvasSurface>
          </section>
        </div>
      </section>

      <footer className="coordinate-console">
        <div className="coordinate-console-intro">
          <ConsoleLabel index={1}>Live signal</ConsoleLabel>
          <div className="coordinate-signal-card">
            <strong>{mappingFocus === "view-client" ? "VIEW → CLIENT" : "CONTENT → VIEW"}</strong>
          </div>
          <small className="coordinate-sync-status">{text("Synchronized", "同步正常")}</small>
        </div>

        <div className="coordinate-flow" aria-label={text("Coordinate conversion flow", "坐标转换流程")}>
          <p><ConsoleLabel index={2}>Coordinates</ConsoleLabel></p>
          <div className="coordinate-flow-value coordinate-flow-client">
            <span>Client</span><strong>{formatPoint(probe.client)}</strong><small>{text("Browser window", "浏览器窗口")}</small>
          </div>
          <div className="coordinate-flow-operation">
            <span>{text(
              "Subtract the Canvas DOM origin, then apply the inverse CSS scale",
              "减去 Canvas DOM 原点，再乘 CSS 缩放的倒数（逻辑尺寸 ÷ DOM 尺寸）",
            )}</span>
            <code>[({formatPoint(probe.client)}) - ({Math.round(probe.surface.left)}, {Math.round(probe.surface.top)})] × {scaleFactors(probe.surface)}</code>
          </div>
          <div className="coordinate-flow-value coordinate-flow-view">
            <span>View</span><strong>{formatPoint(probe.view)}</strong><small>{text("Logical Canvas", "逻辑 Canvas")}</small>
          </div>
          <div className="coordinate-flow-operation">
            <span>{text("Undo viewport offset and scale", "撤销 viewport 平移与缩放")}</span>
            <code>[({formatPoint(probe.view)}) - ({Math.round(viewport.x)}, {Math.round(viewport.y)})] ÷ {viewport.scale.toFixed(2)}</code>
          </div>
          <div className="coordinate-flow-value coordinate-flow-result">
            <span>Content</span><strong>{formatPoint(probe.content)}</strong><small>{text("Scene result", "场景结果")}</small>
          </div>
          <p className="coordinate-event-sample">e.point: <code>{formatPoint(eventPoint)}</code></p>
        </div>

        <div className="coordinate-operations">
          <section className="coordinate-operation-group">
            <div className="coordinate-operation-heading">
              <strong><ConsoleLabel index={3}>CSS display</ConsoleLabel></strong>
              <code>translate({cssDisplay.offsetX}, {cssDisplay.offsetY}) scale({cssDisplay.scaleX.toFixed(2)}, {cssDisplay.scaleY.toFixed(2)})</code>
            </div>
            <label className="coordinate-scale-control">
              <span>scaleX</span>
              <input
                aria-label="CSS scale X"
                max={CSS_SCALE_MAX * 100}
                min={50}
                onChange={(event) => updateCssDisplay({ scaleX: Number(event.target.value) / 100 })}
                step={5}
                type="range"
                value={Math.round(cssDisplay.scaleX * 100)}
              />
              <output>{cssDisplay.scaleX.toFixed(3)}</output>
            </label>
            <label className="coordinate-scale-control">
              <span>scaleY</span>
              <input
                aria-label="CSS scale Y"
                max={CSS_SCALE_MAX * 100}
                min={50}
                onChange={(event) => updateCssDisplay({ scaleY: Number(event.target.value) / 100 })}
                step={5}
                type="range"
                value={Math.round(cssDisplay.scaleY * 100)}
              />
              <output>{cssDisplay.scaleY.toFixed(3)}</output>
            </label>
            <div className="coordinate-offset-controls">
              <label>
                <span>translateX</span>
                <input
                  aria-label="CSS translate X"
                  max={CSS_OFFSET_MAX}
                  min={0}
                  onChange={(event) => updateCssDisplay({ offsetX: clamp(Number(event.target.value), 0, CSS_OFFSET_MAX) })}
                  step={8}
                  type="number"
                  value={cssDisplay.offsetX}
                />
              </label>
              <label>
                <span>translateY</span>
                <input
                  aria-label="CSS translate Y"
                  max={CSS_OFFSET_MAX}
                  min={0}
                  onChange={(event) => updateCssDisplay({ offsetY: clamp(Number(event.target.value), 0, CSS_OFFSET_MAX) })}
                  step={8}
                  type="number"
                  value={cssDisplay.offsetY}
                />
              </label>
            </div>
            <Button onClick={() => {
              setMappingFocus("view-client")
              setCssDisplay({ ...DEFAULT_CSS_DISPLAY })
            }}>Reset</Button>
          </section>
          <section className="coordinate-operation-group">
            <div className="coordinate-operation-heading">
              <strong><ConsoleLabel index={4}>Viewport</ConsoleLabel></strong>
              <code>translate({Math.round(viewport.x)}, {Math.round(viewport.y)}) scale({viewport.scale.toFixed(2)})</code>
            </div>
            <Toolbar>
              <Button onClick={() => changeViewport((tools) => tools.viewport.zoomBy(1.2))}><ViewportIcon name="zoom-in" />zoom in</Button>
              <Button onClick={() => changeViewport((tools) => tools.viewport.zoomBy(1 / 1.2))}><ViewportIcon name="zoom-out" />zoom out</Button>
              <Button onClick={() => changeViewport((tools) => tools.viewport.panBy({ x: 40, y: 20 }))}><ViewportIcon name="pan" />pan</Button>
              <Button onClick={() => changeViewport((tools) => tools.viewport.restore(homeViewportRef.current))}><ViewportIcon name="reset" />reset</Button>
            </Toolbar>
            <button
              aria-controls="coordinate-evidence"
              aria-expanded={evidenceOpen}
              className="coordinate-evidence-toggle"
              onClick={() => setEvidenceOpen((open) => !open)}
              type="button"
            >
              <span aria-hidden="true">▤</span>
              <strong>Evidence</strong>
            </button>
          </section>
        </div>
      </footer>

      <aside
        aria-hidden={!evidenceOpen}
        className="coordinate-evidence"
        data-open={evidenceOpen ? "true" : "false"}
        hidden={!evidenceOpen}
        id="coordinate-evidence"
      >
        <div className="coordinate-evidence-heading">
          <span>{text("Projection evidence", "投影证据")}</span>
          <button
            aria-label={text("Close evidence", "关闭证据面板")}
            onClick={() => setEvidenceOpen(false)}
            type="button"
          >×</button>
        </div>
        <div className="coordinate-zoom-proof" aria-label={text("Zoom cause and effect", "缩放因果证据")}>
          <p>{text("Zoom changes the projection, not the Shape", "缩放改变投影，不改变 Shape")}</p>
          <dl>
          <div className="coordinate-proof-stable">
            <dt>{text("Content Shape geometry", "Content Shape 几何")}</dt>
            <dd>{formatRect(LAB_SHAPE)}</dd>
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
            <dd>{formatRect(shapeProjection.view)}</dd>
            <code>{viewWidthFormula}</code>
          </div>
          <div className="coordinate-proof-changing">
            <dt>{text("Client footprint", "Client 中的显示区域")}</dt>
            <dd>{formatRect(shapeProjection.client)}</dd>
            <code>{clientWidthFormula}</code>
          </div>
          <div>
            <dt>{text("Visible Content window", "可见 Content 窗口")}</dt>
            <dd>{formatRect(visibleContent)}</dd>
            <small>{visibleWindowIsContained
              ? text("Fully shown in the fixed reference. It changes inversely while View stays fixed.", "完整显示在固定参考系中。View 不变时，它会反向变化。")
              : text("Extends beyond the fixed reference. Only the intersection is filled; no false boundary is drawn.", "超出固定参考系。只填充交集，不绘制伪造边界。")}</small>
          </div>
          </dl>
        </div>
      </aside>
    </div>
  )
}

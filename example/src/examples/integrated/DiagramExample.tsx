import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  Circle,
  type Coordinate,
  type Cursor,
  type EventProps,
  Line,
  type ListenerProps,
  MOUSE_EVENTS,
  Rectangle,
  type ShapeDrawProps,
  StayCanvas,
  StayText,
  type StayTools,
} from "react-stay-canvas"

import {
  Button,
  CanvasCard,
  colors,
  DemoLayout,
  EventLog,
  rgba,
  ResetButton,
  sceneArea,
  scenePoint,
  StatusGrid,
  Toolbar,
} from "../../components/DemoKit"
import { useI18n } from "../../i18n"
import { hasPointerPosition } from "../actionEventGuards"

const SCENE_WIDTH = 900
const SCENE_HEIGHT = 560
const MIN_NODE_WIDTH = 96
const MIN_NODE_HEIGHT = 56
const HANDLE_SIZE = 10
const PORT_RADIUS = 6
const PORT_OFFSET = 13
const EDGE_HANDLE_RADIUS = 7
const GRID_SIZE = 20
const transparent = rgba(0, 0, 0, 0)
const NODE_KIND_KEY = "diagram-node-kind"
const EDGE_FROM_KEY = "diagram-edge-from"
const EDGE_FROM_PORT_KEY = "diagram-edge-from-port"
const EDGE_TO_KEY = "diagram-edge-to"
const EDGE_TO_PORT_KEY = "diagram-edge-to-port"
const GENERATED_ID_LIMIT = 1_000_000

export type NodeKind = "start" | "process" | "decision" | "end"
type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"
type Port = "n" | "e" | "s" | "w"
type NodeShape = Rectangle | StayText | Circle
type EdgeShape = Line | Circle | StayText
type NodeChild = ReturnType<StayTools["appendChild"]>
type EdgeChild = ReturnType<StayTools["appendChild"]>
type NodeSnapshots = Map<string, NodeShape[]>

const HANDLE_ORDER: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]
const PORT_ORDER: Port[] = ["n", "e", "s", "w"]
const cursors: Record<Handle, Cursor> = {
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
  nw: "nwse-resize",
}

export type DiagramDocument = {
  version: 1
  nodes: Array<{
    id: string
    kind: NodeKind
    label: string
    x: number
    y: number
    width: number
    height: number
  }>
  edges: Array<{
    id: string
    from: string
    fromPort: Port
    to: string
    toPort: Port
    label?: string
  }>
}

export type DiagramEngine = {
  selected: Set<string>
  selectedEdge?: string
  hovered?: string
  nodeSequence: number
  edgeSequence: number
  changed: () => void
  edit: (id: string) => void
  viewport: { scale: number; x: number; y: number }
  setViewport: (viewport: DiagramEngine["viewport"]) => void
  say: (en: string, zh: string) => void
  save: () => void
  import: () => void
}

type EdgeMeta = Omit<DiagramDocument["edges"][number], "label"> & { label: string }

type GestureSelection = {
  selected: string[]
  selectedEdge?: string
}

type DiagramGestureSession = GestureSelection & (
  | {
    kind: "move"
    ids: string[]
    start: Coordinate
    limits: { minX: number; maxX: number; minY: number; maxY: number }
    origins: NodeSnapshots
  }
  | { kind: "resize"; id: string; handle: Handle; origin: Rectangle; origins: NodeSnapshots }
  | { kind: "connect"; from: string; fromPort: Port; start: Coordinate; previewId: string }
  | { kind: "reconnect"; edgeId: string; end: "from" | "to"; meta: EdgeMeta; edgeOrigin: EdgeShape[] }
  | { kind: "marquee"; start: Coordinate; marqueeId: string }
)

const nodes = (tools: StayTools) => tools.getChildrenBySelector<NodeShape>(".node") as NodeChild[]
const edges = (tools: StayTools) => tools.getChildrenBySelector<EdgeShape>(".edge") as EdgeChild[]
const bodyOf = (child: NodeChild) => child.shapeMap.get("0") as Rectangle
const labelOf = (child: NodeChild) => child.shapeMap.get("1") as StayText
const portOf = (child: NodeChild, port: Port) => child.shapeMap.get(String(2 + PORT_ORDER.indexOf(port))) as Circle
const handleOf = (child: NodeChild, handle: Handle) => child.shapeMap.get(String(6 + HANDLE_ORDER.indexOf(handle))) as Rectangle
const outlineOf = (child: NodeChild) => child.shapeMap.get("14") as Rectangle
const nodeKind = (child: NodeChild): NodeKind => bodyOf(child).shapeStore.get(NODE_KIND_KEY) as NodeKind
const edgeLabelOf = (child: EdgeChild) => child.shapeMap.get("7") as StayText
const edgeHandleOf = (child: EdgeChild, end: "from" | "to") => child.shapeMap.get(end === "from" ? "5" : "6") as Circle

export const DiagramDoubleClickEvent: EventProps<"dblclick"> = {
  name: "dblclick",
  trigger: MOUSE_EVENTS.DB_CLICK,
  conditionCallback: () => true,
}

function nextDiagramId(tools: StayTools, engine: DiagramEngine, prefix: "node" | "edge") {
  const sequence = prefix === "node" ? "nodeSequence" : "edgeSequence"
  let candidate = Number.isSafeInteger(engine[sequence]) ? engine[sequence] : 0
  for (let attempts = 0; attempts < GENERATED_ID_LIMIT; attempts++) {
    candidate = candidate >= GENERATED_ID_LIMIT ? 1 : candidate + 1
    const id = `${prefix}-${candidate}`
    if (!tools.hasChild(id)) {
      engine[sequence] = candidate
      return id
    }
  }
  throw new Error(`Diagram ${prefix} id space is exhausted`)
}

function rememberDiagramSequence(engine: DiagramEngine, prefix: "node" | "edge", id: string) {
  const expectedPrefix = `${prefix}-`
  if (!id.startsWith(expectedPrefix)) return
  const suffix = id.slice(expectedPrefix.length)
  if (!/^\d+$/.test(suffix)) return
  const value = Number(suffix)
  if (!Number.isSafeInteger(value) || value < 1 || value > GENERATED_ID_LIMIT) return
  const sequence = prefix === "node" ? "nodeSequence" : "edgeSequence"
  engine[sequence] = Math.max(engine[sequence], value)
}

function kindColors(kind: NodeKind) {
  if (kind === "start") return { fill: colors.greenSoft, stroke: colors.green }
  if (kind === "decision") return { fill: colors.orangeSoft, stroke: colors.orange }
  if (kind === "end") return { fill: colors.graySoft, stroke: colors.gray }
  return { fill: colors.blueSoft, stroke: colors.blue }
}

function traceNodePath(context: ShapeDrawProps["context"], rect: Rectangle, kind: NodeKind) {
  const { x, y, width, height } = rect
  context.beginPath()
  if (kind === "decision") {
    context.moveTo(x + width / 2, y)
    context.lineTo(x + width, y + height / 2)
    context.lineTo(x + width / 2, y + height)
    context.lineTo(x, y + height / 2)
    context.closePath()
    return
  }
  if (kind === "start" || kind === "end") {
    const radius = Math.min(height / 2, width / 4)
    context.moveTo(x + radius, y)
    context.lineTo(x + width - radius, y)
    context.bezierCurveTo(x + width, y, x + width, y + height, x + width - radius, y + height)
    context.lineTo(x + radius, y + height)
    context.bezierCurveTo(x, y + height, x, y, x + radius, y)
    context.closePath()
    return
  }
  context.rect(x, y, width, height)
}

function nodeDrawState(kind: NodeKind) {
  return {
    commonDraw(this: Rectangle, { context }: ShapeDrawProps) {
      traceNodePath(context, this, kind)
    },
    stroke() {},
    fill({ context }: ShapeDrawProps) {
      context.fill()
      context.stroke()
    },
  }
}

const NODE_DRAW_STATES = {
  start: nodeDrawState("start"),
  process: nodeDrawState("process"),
  decision: nodeDrawState("decision"),
  end: nodeDrawState("end"),
}

const snap = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE

function defaultNodeSize(kind: NodeKind) {
  if (kind === "decision") return { width: 148, height: 96 }
  if (kind === "start" || kind === "end") return { width: 132, height: 64 }
  return { width: 148, height: 80 }
}

function defaultNodeLabel(kind: NodeKind) {
  if (kind === "start") return "Start"
  if (kind === "decision") return "Decision"
  if (kind === "end") return "End"
  return "Process"
}

function graphBound(tools: StayTools) {
  return sceneArea(tools, SCENE_WIDTH, SCENE_HEIGHT)
}

function handleCenters(rect: Rectangle): Record<Handle, Coordinate> {
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2
  return {
    nw: { x: rect.x, y: rect.y },
    n: { x: centerX, y: rect.y },
    ne: { x: rect.x + rect.width, y: rect.y },
    e: { x: rect.x + rect.width, y: centerY },
    se: { x: rect.x + rect.width, y: rect.y + rect.height },
    s: { x: centerX, y: rect.y + rect.height },
    sw: { x: rect.x, y: rect.y + rect.height },
    w: { x: rect.x, y: centerY },
  }
}

function portCenters(rect: Rectangle): Record<Port, Coordinate> {
  const handles = handleCenters(rect)
  return {
    n: { x: handles.n.x, y: handles.n.y - PORT_OFFSET },
    e: { x: handles.e.x + PORT_OFFSET, y: handles.e.y },
    s: { x: handles.s.x, y: handles.s.y + PORT_OFFSET },
    w: { x: handles.w.x - PORT_OFFSET, y: handles.w.y },
  }
}

function syncNodeGeometry(child: NodeChild) {
  const body = bodyOf(child)
  const handles = handleCenters(body)
  const ports = portCenters(body)
  labelOf(child).update({ x: body.x + body.width / 2, y: body.y + body.height / 2 })
  PORT_ORDER.forEach((port) => portOf(child, port).update({ ...ports[port], radius: PORT_RADIUS }))
  HANDLE_ORDER.forEach((handle) => {
    const center = handles[handle]
    handleOf(child, handle).update({
      x: center.x - HANDLE_SIZE / 2,
      y: center.y - HANDLE_SIZE / 2,
      width: HANDLE_SIZE,
      height: HANDLE_SIZE,
    })
  })
  outlineOf(child).update({ x: body.x, y: body.y, width: body.width, height: body.height })
}

function setNodeKind(child: NodeChild, kind: NodeKind) {
  const palette = kindColors(kind)
  const body = bodyOf(child)
  body.shapeStore.set(NODE_KIND_KEY, kind)
  body.update({
    state: kind,
    fillConfig: { color: palette.fill },
    strokeConfig: { color: palette.stroke, lineWidth: 2 },
  })
}

function createNode(
  tools: StayTools,
  engine: DiagramEngine,
  props: {
    id?: string
    kind: NodeKind
    label: string
    x: number
    y: number
    width?: number
    height?: number
  },
) {
  const defaults = defaultNodeSize(props.kind)
  const width = props.width ?? defaults.width
  const height = props.height ?? defaults.height
  const palette = kindColors(props.kind)
  const id = props.id ?? nextDiagramId(tools, engine, "node")
  if (tools.hasChild(id)) throw new Error(`Diagram node id already exists: ${id}`)
  const body = new Rectangle({
    x: props.x,
    y: props.y,
    width,
    height,
    layer: 1,
    zIndex: 2,
    state: props.kind,
    stateDrawFuncMap: NODE_DRAW_STATES,
    fillConfig: { color: palette.fill },
    strokeConfig: { color: palette.stroke, lineWidth: 2 },
    shapeStore: new Map([[NODE_KIND_KEY, props.kind]]),
  })
  const child = tools.appendChild<NodeShape>({
    id,
    className: "node",
    shape: [
      body,
      new StayText({
        x: props.x + width / 2,
        y: props.y + height / 2,
        text: props.label,
        textAlign: "center",
        textBaseline: "middle",
        font: { size: 14, fontWeight: 700 },
        layer: 2,
        zIndex: 4,
        fillConfig: { color: colors.ink },
      }),
      ...PORT_ORDER.map(() => new Circle({
        x: props.x,
        y: props.y,
        radius: PORT_RADIUS,
        layer: 2,
        zIndex: 6,
        fillConfig: { color: colors.paper },
        strokeConfig: { color: colors.blue, lineWidth: 2 },
      })),
      ...HANDLE_ORDER.map(() => new Rectangle({
        x: props.x,
        y: props.y,
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
        layer: 2,
        zIndex: 8,
        fillConfig: { color: transparent },
        strokeConfig: { color: transparent, lineWidth: 2 },
      })),
      new Rectangle({
        x: props.x,
        y: props.y,
        width,
        height,
        layer: 2,
        zIndex: 7,
        fillConfig: { color: transparent },
        strokeConfig: { color: transparent, lineWidth: 3 },
      }),
    ],
  }) as NodeChild
  syncNodeGeometry(child)
  rememberDiagramSequence(engine, "node", id)
  return child
}

function edgeMeta(child: EdgeChild): EdgeMeta | undefined {
  const main = child.shapeMap.get("0") as Line
  const from = main.shapeStore.get(EDGE_FROM_KEY)
  const fromPort = main.shapeStore.get(EDGE_FROM_PORT_KEY)
  const to = main.shapeStore.get(EDGE_TO_KEY)
  const toPort = main.shapeStore.get(EDGE_TO_PORT_KEY)
  if (typeof from !== "string" || typeof to !== "string" || !validPort(fromPort) || !validPort(toPort)) return
  return { id: child.id, from, fromPort, to, toPort, label: edgeLabelOf(child)?.text ?? "" }
}

function storeEdgeMeta(shape: Line, meta: Pick<EdgeMeta, "from" | "fromPort" | "to" | "toPort">) {
  shape.shapeStore.set(EDGE_FROM_KEY, meta.from)
  shape.shapeStore.set(EDGE_FROM_PORT_KEY, meta.fromPort)
  shape.shapeStore.set(EDGE_TO_KEY, meta.to)
  shape.shapeStore.set(EDGE_TO_PORT_KEY, meta.toPort)
}

function routePoints(start: Coordinate, end: Coordinate, fromPort: Port, toPort?: Port) {
  const fromHorizontal = fromPort === "e" || fromPort === "w"
  const toHorizontal = toPort === "e" || toPort === "w"
  if (toPort && fromHorizontal !== toHorizontal) {
    const corner = fromHorizontal ? { x: end.x, y: start.y } : { x: start.x, y: end.y }
    return [start, corner, corner, end]
  }
  if (fromHorizontal) {
    const middleX = snap((start.x + end.x) / 2)
    return [start, { x: middleX, y: start.y }, { x: middleX, y: end.y }, end]
  }
  const middleY = snap((start.y + end.y) / 2)
  return [start, { x: start.x, y: middleY }, { x: end.x, y: middleY }, end]
}

function updateEdgeShapes(child: EdgeChild, start: Coordinate, end: Coordinate, fromPort: Port, toPort?: Port) {
  const points = routePoints(start, end, fromPort, toPort)
  const segments = [0, 1, 2].map((index) => child.shapeMap.get(String(index)) as Line)
  segments.forEach((line, index) => line.update({
    x1: points[index].x,
    y1: points[index].y,
    x2: points[index + 1].x,
    y2: points[index + 1].y,
  }))
  const wingA = child.shapeMap.get("3") as Line
  const wingB = child.shapeMap.get("4") as Line
  const finalStart = points[2]
  const targetAngle: Record<Port, number> = {
    w: 0,
    e: Math.PI,
    n: Math.PI / 2,
    s: -Math.PI / 2,
  }
  const angle = toPort === undefined
    ? Math.atan2(end.y - finalStart.y, end.x - finalStart.x)
    : targetAngle[toPort]
  const arrowLength = 12
  const wing = (offset: number) => ({
    x: end.x - Math.cos(angle + offset) * arrowLength,
    y: end.y - Math.sin(angle + offset) * arrowLength,
  })
  const a = wing(Math.PI / 6)
  const b = wing(-Math.PI / 6)
  wingA.update({ x1: end.x, y1: end.y, x2: a.x, y2: a.y })
  wingB.update({ x1: end.x, y1: end.y, x2: b.x, y2: b.y })
  edgeHandleOf(child, "from")?.update({ ...start, radius: EDGE_HANDLE_RADIUS })
  edgeHandleOf(child, "to")?.update({ ...end, radius: EDGE_HANDLE_RADIUS })
  edgeLabelOf(child)?.update({
    x: (points[1].x + points[2].x) / 2,
    y: (points[1].y + points[2].y) / 2 - 8,
  })
}

function createEdgeShapes(start: Coordinate, end: Coordinate, preview = false) {
  const strokeConfig = {
    color: preview ? colors.orange : colors.gray,
    lineWidth: preview ? 2 : 3,
    lineCap: "round" as CanvasLineCap,
    dash: preview ? [7, 5] : [],
  }
  const lines = [0, 1, 2, 3, 4].map(() => new Line({
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    layer: preview ? 2 : 0,
    zIndex: preview ? 9 : 1,
    strokeConfig,
  }))
  if (preview) return lines
  return [
    ...lines,
    ...[start, end].map((point) => new Circle({
      ...point,
      radius: EDGE_HANDLE_RADIUS,
      layer: 2,
      zIndex: 9,
      fillConfig: { color: transparent },
      strokeConfig: { color: transparent, lineWidth: 2 },
    })),
    new StayText({
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2 - 8,
      text: "",
      textAlign: "center",
      textBaseline: "bottom",
      font: { size: 12, fontWeight: 700 },
      layer: 2,
      zIndex: 5,
      fillConfig: { color: colors.ink },
    }),
  ]
}

function createEdge(
  tools: StayTools,
  engine: DiagramEngine,
  props: Omit<EdgeMeta, "id" | "label"> & { id?: string; label?: string },
) {
  if (props.from === props.to) return
  const from = tools.getChildById<NodeShape>(props.from) as NodeChild | undefined
  const to = tools.getChildById<NodeShape>(props.to) as NodeChild | undefined
  if (!from || !to) throw new Error("Diagram edge references a missing node")
  const duplicate = edges(tools).some((edge) => {
    const meta = edgeMeta(edge)
    return meta?.from === props.from && meta.fromPort === props.fromPort && meta.to === props.to && meta.toPort === props.toPort
  })
  if (duplicate) return
  const id = props.id ?? nextDiagramId(tools, engine, "edge")
  if (tools.hasChild(id)) throw new Error(`Diagram edge id already exists: ${id}`)
  const start = portOf(from, props.fromPort).getCenterPoint()
  const end = portOf(to, props.toPort).getCenterPoint()
  const shapes = createEdgeShapes(start, end)
  storeEdgeMeta(shapes[0] as Line, props)
  ;(shapes[7] as StayText).update({ text: props.label ?? "" })
  const child = tools.appendChild<EdgeShape>({
    id,
    className: "edge",
    shape: shapes,
  }) as EdgeChild
  updateEdgeShapes(child, start, end, props.fromPort, props.toPort)
  rememberDiagramSequence(engine, "edge", id)
  return child
}

function relationExists(
  tools: StayTools,
  relation: Pick<EdgeMeta, "from" | "fromPort" | "to" | "toPort">,
  exceptId?: string,
) {
  return edges(tools).some((edge) => {
    if (edge.id === exceptId) return false
    const meta = edgeMeta(edge)
    return meta?.from === relation.from && meta.fromPort === relation.fromPort &&
      meta.to === relation.to && meta.toPort === relation.toPort
  })
}

function syncEdges(tools: StayTools) {
  edges(tools).forEach((edge) => {
    const meta = edgeMeta(edge)
    const from = meta && tools.getChildById<NodeShape>(meta.from) as NodeChild | undefined
    const to = meta && tools.getChildById<NodeShape>(meta.to) as NodeChild | undefined
    if (!meta || !from || !to) return
    updateEdgeShapes(
      edge,
      portOf(from, meta.fromPort).getCenterPoint(),
      portOf(to, meta.toPort).getCenterPoint(),
      meta.fromPort,
      meta.toPort,
    )
  })
}

function paintControls(tools: StayTools, engine: Pick<DiagramEngine, "selected" | "selectedEdge" | "hovered">) {
  nodes(tools).forEach((child) => {
    const active = engine.selected.has(child.id)
    const portsVisible = active || engine.hovered === child.id
    outlineOf(child).update({ strokeConfig: { color: active ? colors.blue : transparent, lineWidth: 3 } })
    PORT_ORDER.forEach((port) => portOf(child, port).update({
      fillConfig: { color: portsVisible ? colors.paper : transparent },
      strokeConfig: { color: portsVisible ? colors.blue : transparent, lineWidth: 2 },
    }))
    HANDLE_ORDER.forEach((handle) => handleOf(child, handle).update({
      fillConfig: { color: active ? colors.paper : transparent },
      strokeConfig: { color: active ? colors.blue : transparent, lineWidth: 2 },
    }))
  })
  edges(tools).forEach((edge) => {
    const active = engine.selectedEdge === edge.id
    for (let index = 0; index < 5; index++) {
      ;(edge.shapeMap.get(String(index)) as Line).update({
        strokeConfig: { color: active ? colors.blue : colors.gray, lineWidth: active ? 3 : 2.5 },
      })
    }
    ;(["from", "to"] as const).forEach((end) => edgeHandleOf(edge, end).update({
      fillConfig: { color: active ? colors.paper : transparent },
      strokeConfig: { color: active ? colors.blue : transparent, lineWidth: 2 },
    }))
  })
}

function selectNode(tools: StayTools, engine: DiagramEngine, child?: NodeChild, additive = false) {
  if (!additive) engine.selected.clear()
  engine.selectedEdge = undefined
  if (child) {
    if (additive && engine.selected.has(child.id)) engine.selected.delete(child.id)
    else engine.selected.add(child.id)
  }
  paintControls(tools, engine)
  engine.changed()
}

function selectEdge(tools: StayTools, engine: DiagramEngine, child?: EdgeChild) {
  engine.selected.clear()
  engine.selectedEdge = child?.id
  paintControls(tools, engine)
  engine.changed()
}

function commit(tools: StayTools, engine: DiagramEngine) {
  paintControls(tools, { selected: new Set() })
  tools.log()
  paintControls(tools, engine)
  engine.changed()
}

function nodeContains(child: NodeChild, point: Coordinate) {
  const body = bodyOf(child)
  if (nodeKind(child) !== "decision") return body.contains(point)
  const center = body.getCenterPoint()
  return Math.abs(point.x - center.x) / (body.width / 2) +
    Math.abs(point.y - center.y) / (body.height / 2) <= 1
}

function hitNode(tools: StayTools, point: Coordinate) {
  return nodes(tools).filter((child) => nodeContains(child, point)).sort((a, b) => bodyOf(a).area - bodyOf(b).area)[0]
}

function segmentDistance(line: Line, point: Coordinate) {
  const dx = line.x2 - line.x1
  const dy = line.y2 - line.y1
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(point.x - line.x1, point.y - line.y1)
  const ratio = Math.max(0, Math.min(1, ((point.x - line.x1) * dx + (point.y - line.y1) * dy) / lengthSquared))
  return Math.hypot(point.x - (line.x1 + ratio * dx), point.y - (line.y1 + ratio * dy))
}

function hitEdge(tools: StayTools, point: Coordinate) {
  return [...edges(tools)].reverse().find((edge) => {
    const label = edgeLabelOf(edge)
    const labelBound = label.getBound()
    const labelHit = Boolean(label.text) &&
      point.x >= labelBound.x - 5 && point.x <= labelBound.x + labelBound.width + 5 &&
      point.y >= labelBound.y - 5 && point.y <= labelBound.y + labelBound.height + 5
    return labelHit || [0, 1, 2]
      .some((index) => segmentDistance(edge.shapeMap.get(String(index)) as Line, point) <= 7)
  })
}

function selectedHandle(tools: StayTools, engine: DiagramEngine, point: Coordinate) {
  for (const child of nodes(tools).filter(({ id }) => engine.selected.has(id))) {
    const match = HANDLE_ORDER.map((handle) => ({ handle, shape: handleOf(child, handle) }))
      .filter(({ shape }) => shape.contains(point))
      .sort((a, b) => {
        const ac = a.shape.getCenterPoint()
        const bc = b.shape.getCenterPoint()
        return Math.hypot(ac.x - point.x, ac.y - point.y) - Math.hypot(bc.x - point.x, bc.y - point.y)
      })[0]
    if (match) return { child, handle: match.handle }
  }
}

function hitPort(tools: StayTools, engine: DiagramEngine, point: Coordinate) {
  for (const child of nodes(tools)) {
    const port = PORT_ORDER.find((candidate) => portOf(child, candidate).contains(point))
    if (port) return { child, port }
  }
}

function selectedEdgeHandle(tools: StayTools, engine: DiagramEngine, point: Coordinate) {
  const child = engine.selectedEdge && tools.getChildById<EdgeShape>(engine.selectedEdge) as EdgeChild | undefined
  if (!child) return
  const end = (["from", "to"] as const).find((candidate) => edgeHandleOf(child, candidate).contains(point))
  return end ? { child, end } : undefined
}

function nearestPort(child: NodeChild, point: Coordinate) {
  return [...PORT_ORDER].sort((a, b) => {
    const ac = portOf(child, a).getCenterPoint()
    const bc = portOf(child, b).getCenterPoint()
    return Math.hypot(ac.x - point.x, ac.y - point.y) - Math.hypot(bc.x - point.x, bc.y - point.y)
  })[0]
}

function resizeAxis(
  start: number,
  size: number,
  point: number,
  fromStart: boolean,
  fromEnd: boolean,
  boundStart: number,
  boundSize: number,
  minimum: number,
) {
  const boundEnd = boundStart + boundSize
  let nextStart = start
  let nextEnd = start + size
  if (fromStart) nextStart = Math.max(boundStart, Math.min(point, nextEnd - minimum))
  if (fromEnd) nextEnd = Math.min(boundEnd, Math.max(point, nextStart + minimum))
  return { start: nextStart, size: nextEnd - nextStart }
}

function resizeNode(child: NodeChild, origin: Rectangle, handle: Handle, point: Coordinate, bound: ReturnType<typeof graphBound>) {
  const margin = PORT_OFFSET + PORT_RADIUS
  const insetBound = { x: bound.x + margin, y: bound.y + margin, width: bound.width - margin * 2, height: bound.height - margin * 2 }
  const horizontal = resizeAxis(
    origin.x,
    origin.width,
    snap(point.x),
    handle.includes("w"),
    handle.includes("e"),
    insetBound.x,
    insetBound.width,
    MIN_NODE_WIDTH,
  )
  const vertical = resizeAxis(
    origin.y,
    origin.height,
    snap(point.y),
    handle.includes("n"),
    handle.includes("s"),
    insetBound.y,
    insetBound.height,
    MIN_NODE_HEIGHT,
  )
  bodyOf(child).update({ x: horizontal.start, y: vertical.start, width: horizontal.size, height: vertical.size })
  syncNodeGeometry(child)
}

function snapshotNodes(tools: StayTools, ids: string[]) {
  return new Map(ids.flatMap((id) => {
    const child = tools.getChildById<NodeShape>(id) as NodeChild | undefined
    if (!child) return []
    return [[id, [...child.shapeMap.values()].map((shape) => shape.copy()) as NodeShape[]]]
  }))
}

function snapshotEdge(child: EdgeChild) {
  return [...child.shapeMap.values()].map((shape) => shape.copy()) as EdgeShape[]
}

function moveLimits(tools: StayTools, ids: string[]) {
  const selectedBodies = ids.flatMap((id) => {
    const child = tools.getChildById<NodeShape>(id) as NodeChild | undefined
    return child ? [bodyOf(child)] : []
  })
  const bound = graphBound(tools)
  const margin = PORT_OFFSET + PORT_RADIUS
  return {
    minX: bound.x + margin - Math.min(...selectedBodies.map((body) => body.x)),
    maxX: bound.x + bound.width - margin - Math.max(...selectedBodies.map((body) => body.x + body.width)),
    minY: bound.y + margin - Math.min(...selectedBodies.map((body) => body.y)),
    maxY: bound.y + bound.height - margin - Math.max(...selectedBodies.map((body) => body.y + body.height)),
  }
}

function rectBetween(start: Coordinate, end: Coordinate) {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }
}

function createMarquee(tools: StayTools, start: Coordinate) {
  return tools.appendChild<Rectangle>({
    className: "diagram-marquee",
    shape: new Rectangle({
      x: start.x,
      y: start.y,
      width: 1,
      height: 1,
      layer: 2,
      zIndex: 10,
      fillConfig: { color: colors.blueSoft },
      strokeConfig: { color: colors.blue, lineWidth: 1, dash: [6, 4] },
    }),
  })
}

function createConnectionPreview(tools: StayTools, start: Coordinate) {
  return tools.appendChild<EdgeShape>({
    className: "connection-preview",
    shape: createEdgeShapes(start, start, true),
  }) as EdgeChild
}

function restoreGesture(tools: StayTools, engine: DiagramEngine, session: DiagramGestureSession) {
  if (session.kind === "connect") tools.removeChild(session.previewId)
  if (session.kind === "marquee") tools.removeChild(session.marqueeId)
  if (session.kind === "move" || session.kind === "resize") {
    session.origins.forEach((shapes, id) => tools.getChildById<NodeShape>(id)?.update({ shape: shapes }))
  }
  if (session.kind === "reconnect") {
    tools.getChildById<EdgeShape>(session.edgeId)?.update({ shape: session.edgeOrigin })
  }
  engine.selected.clear()
  session.selected?.forEach((id: string) => engine.selected.add(id))
  engine.selectedEdge = session.selectedEdge
  syncEdges(tools)
  paintControls(tools, engine)
  engine.changed()
}

export function removeDiagramSelection(tools: StayTools, engine: DiagramEngine) {
  if (engine.selected.size === 0 && !engine.selectedEdge) return false
  if (engine.selectedEdge) tools.removeChild(engine.selectedEdge)
  edges(tools).forEach((edge) => {
    const meta = edgeMeta(edge)
    if (meta && (engine.selected.has(meta.from) || engine.selected.has(meta.to))) tools.removeChild(edge.id)
  })
  engine.selected.forEach((id) => tools.removeChild(id))
  engine.selected.clear()
  engine.selectedEdge = undefined
  commit(tools, engine)
  engine.say("Selection deleted", "已删除选择")
  return true
}

export function duplicateDiagramSelection(tools: StayTools, engine: DiagramEngine) {
  const selected = nodes(tools).filter(({ id }) => engine.selected.has(id))
  if (selected.length === 0) return false
  const selectedIds = new Set(selected.map(({ id }) => id))
  const selectedEdges = edges(tools).flatMap((edge) => {
    const meta = edgeMeta(edge)
    return meta && selectedIds.has(meta.from) && selectedIds.has(meta.to) ? [meta] : []
  })
  const mapping = new Map<string, NodeChild>()
  const bound = graphBound(tools)
  const margin = PORT_OFFSET + PORT_RADIUS
  selected.forEach((child) => {
    const body = bodyOf(child)
    const copy = createNode(tools, engine, {
      kind: nodeKind(child),
      label: `${labelOf(child).text} · ${engine.nodeSequence + 1}`,
      x: Math.min(body.x + 28, bound.x + bound.width - margin - body.width),
      y: Math.min(body.y + 28, bound.y + bound.height - margin - body.height),
      width: body.width,
      height: body.height,
    })
    mapping.set(child.id, copy)
  })
  selectedEdges.forEach((meta) => {
    const from = mapping.get(meta.from)
    const to = mapping.get(meta.to)
    if (from && to) createEdge(tools, engine, {
      from: from.id,
      fromPort: meta.fromPort,
      to: to.id,
      toPort: meta.toPort,
      label: meta.label,
    })
  })
  engine.selected.clear()
  mapping.forEach(({ id }) => engine.selected.add(id))
  commit(tools, engine)
  engine.say("Selection duplicated", "已复制选择")
  return true
}

export function updateDiagramNode(tools: StayTools, engine: DiagramEngine, id: string, label: string, kind: NodeKind) {
  const child = tools.getChildById<NodeShape>(id) as NodeChild | undefined
  const nextLabel = label.trim()
  if (!child || !nextLabel) return false
  labelOf(child).update({ text: nextLabel })
  setNodeKind(child, kind)
  syncNodeGeometry(child)
  commit(tools, engine)
  engine.say("Node updated", "已更新节点")
  return true
}

export function updateDiagramEdge(tools: StayTools, engine: DiagramEngine, id: string, label: string) {
  const child = tools.getChildById<EdgeShape>(id) as EdgeChild | undefined
  if (!child) return false
  edgeLabelOf(child).update({ text: label.trim() })
  syncEdges(tools)
  commit(tools, engine)
  engine.say("Connection updated", "已更新连线")
  return true
}

export function addDiagramNode(
  tools: StayTools,
  engine: DiagramEngine,
  kind: NodeKind = "process",
  center?: Coordinate,
) {
  const bound = graphBound(tools)
  const index = nodes(tools).length
  const size = defaultNodeSize(kind)
  const fallback = {
    x: bound.x + 100 + (index % 4) * 176,
    y: bound.y + 110 + (Math.floor(index / 4) % 3) * 130,
  }
  const target = center ?? fallback
  const margin = PORT_OFFSET + PORT_RADIUS
  const child = createNode(tools, engine, {
    kind,
    label: defaultNodeLabel(kind),
    x: Math.max(bound.x + margin, Math.min(snap(target.x - size.width / 2), bound.x + bound.width - margin - size.width)),
    y: Math.max(bound.y + margin, Math.min(snap(target.y - size.height / 2), bound.y + bound.height - margin - size.height)),
    ...size,
  })
  selectNode(tools, engine, child)
  commit(tools, engine)
  engine.say("Node added", "已添加节点")
  return child
}

function validNodeKind(value: unknown): value is NodeKind {
  return typeof value === "string" && ["start", "process", "decision", "end"].includes(value)
}

function validPort(value: unknown): value is Port {
  return typeof value === "string" && PORT_ORDER.includes(value as Port)
}

function validDocumentId(value: unknown, used: Set<string>) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]+$/.test(value) && !used.has(value)
}

function nodeInsideScene(node: DiagramDocument["nodes"][number]) {
  const margin = PORT_OFFSET + PORT_RADIUS
  return node.x >= margin &&
    node.y >= margin &&
    node.x + node.width <= SCENE_WIDTH - margin &&
    node.y + node.height <= SCENE_HEIGHT - margin
}

function readDiagramDocument(data: unknown): DiagramDocument {
  const source = data as Partial<DiagramDocument>
  if (!source || source.version !== 1 || !Array.isArray(source.nodes) || !Array.isArray(source.edges)) {
    throw new Error("Diagram document must contain version 1 nodes and edges")
  }
  const ids = new Set<string>()
  const parsedNodes = source.nodes.map((node) => {
    const values = [node?.x, node?.y, node?.width, node?.height]
    if (!node || !validDocumentId(node.id, ids)) {
      throw new Error("Diagram node ids must be unique and URL-safe")
    }
    if (!validNodeKind(node.kind) || typeof node.label !== "string" || !node.label.trim() || !values.every(Number.isFinite)) {
      throw new Error("Diagram node has invalid content")
    }
    if (node.width < MIN_NODE_WIDTH || node.height < MIN_NODE_HEIGHT || !nodeInsideScene(node)) {
      throw new Error("Diagram node is outside the scene")
    }
    ids.add(node.id)
    return { ...node, label: node.label.trim() }
  })
  const edgeIds = new Set<string>()
  const relations = new Set<string>()
  const parsedEdges = source.edges.map((edge) => {
    const usedIds = new Set([...ids, ...edgeIds])
    if (!edge || !validDocumentId(edge.id, usedIds)) {
      throw new Error("Diagram edge ids must be unique and URL-safe")
    }
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to || !validPort(edge.fromPort) || !validPort(edge.toPort)) {
      throw new Error("Diagram edge has invalid endpoints")
    }
    if (edge.label !== undefined && (typeof edge.label !== "string" || edge.label.length > 32)) {
      throw new Error("Diagram edge has invalid label")
    }
    const relation = `${edge.from}:${edge.fromPort}:${edge.to}:${edge.toPort}`
    if (relations.has(relation)) throw new Error("Diagram edges must not duplicate a connection")
    edgeIds.add(edge.id)
    relations.add(relation)
    return { ...edge, label: edge.label?.trim() ?? "" }
  })
  return { version: 1, nodes: parsedNodes, edges: parsedEdges }
}

export function toDiagramDocument(tools: StayTools): DiagramDocument {
  const bound = graphBound(tools)
  return {
    version: 1,
    nodes: nodes(tools).map((child) => {
      const body = bodyOf(child)
      return {
        id: child.id,
        kind: nodeKind(child),
        label: labelOf(child).text,
        x: body.x - bound.x,
        y: body.y - bound.y,
        width: body.width,
        height: body.height,
      }
    }),
    edges: edges(tools).map(edgeMeta).filter((meta): meta is EdgeMeta => Boolean(meta)),
  }
}

export function replaceDiagramFromDocument(tools: StayTools, engine: DiagramEngine, data: unknown) {
  const document = readDiagramDocument(data)
  const graphIds = new Set([...nodes(tools), ...edges(tools)].map(({ id }) => id))
  const conflict = [...document.nodes, ...document.edges]
    .find(({ id }) => tools.hasChild(id) && !graphIds.has(id))
  if (conflict) throw new Error(`Diagram id conflicts with the canvas: ${conflict.id}`)
  const bound = graphBound(tools)
  engine.selected.clear()
  engine.selectedEdge = undefined
  edges(tools).forEach(({ id }) => tools.removeChild(id))
  nodes(tools).forEach(({ id }) => tools.removeChild(id))
  document.nodes.forEach((node) => createNode(tools, engine, { ...node, x: bound.x + node.x, y: bound.y + node.y }))
  document.edges.forEach((edge) => createEdge(tools, engine, edge))
  commit(tools, engine)
  engine.say("Diagram imported", "已导入图表")
  return document
}

export function navigateDiagramHistory(tools: StayTools, engine: DiagramEngine, direction: "undo" | "redo") {
  engine.selected.clear()
  engine.selectedEdge = undefined
  paintControls(tools, engine)
  tools[direction]()
  syncEdges(tools)
  paintControls(tools, engine)
  engine.changed()
}

function runShortcut(tools: StayTools, engine: DiagramEngine, key: string, shift: boolean, modifier: boolean) {
  if ((key === "delete" || key === "backspace") && !modifier) return removeDiagramSelection(tools, engine)
  if (!modifier) return false
  if (key === "s") engine.save()
  else if (key === "i") engine.import()
  else if (key === "d") duplicateDiagramSelection(tools, engine)
  else if (key === "z") {
    navigateDiagramHistory(tools, engine, shift ? "redo" : "undo")
    engine.say(shift ? "Redo" : "Undo", shift ? "重做" : "撤销")
  } else return false
  return true
}

export function bindDiagramShortcuts(engine: DiagramEngine, getTools: () => StayTools | undefined) {
  const listener = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLCanvasElement) return
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
    const tools = getTools()
    if (tools && runShortcut(tools, engine, event.key.toLowerCase(), event.shiftKey, event.metaKey || event.ctrlKey)) event.preventDefault()
  }
  window.addEventListener("keydown", listener)
  return () => window.removeEventListener("keydown", listener)
}

function beginDiagramGesture(
  tools: StayTools,
  engine: DiagramEngine,
  start: Coordinate,
  pressedKeys: Set<string>,
): DiagramGestureSession {
  const selected = [...engine.selected]
  const selectedEdge = engine.selectedEdge
  const edgeHandle = selectedEdgeHandle(tools, engine, start)
  if (edgeHandle) {
    const meta = edgeMeta(edgeHandle.child)
    if (meta) {
      return {
        kind: "reconnect",
        edgeId: edgeHandle.child.id,
        end: edgeHandle.end,
        meta,
        edgeOrigin: snapshotEdge(edgeHandle.child),
        selected,
        selectedEdge,
      }
    }
  }
  const handle = selectedHandle(tools, engine, start)
  if (handle) {
    return {
      kind: "resize",
      id: handle.child.id,
      handle: handle.handle,
      origin: bodyOf(handle.child).copy(),
      origins: snapshotNodes(tools, [handle.child.id]),
      selected,
      selectedEdge,
    }
  }

  const port = hitPort(tools, engine, start)
  if (port) {
    selectNode(tools, engine, port.child)
    const startPoint = portOf(port.child, port.port).getCenterPoint()
    const preview = createConnectionPreview(tools, startPoint)
    return {
      kind: "connect",
      from: port.child.id,
      fromPort: port.port,
      start: startPoint,
      previewId: preview.id,
      selected,
      selectedEdge,
    }
  }

  const target = hitNode(tools, start)
  if (target) {
    const additive = pressedKeys.has("Meta") || pressedKeys.has("Control")
    if (!engine.selected.has(target.id)) selectNode(tools, engine, target, additive)
    const ids = [...engine.selected]
    ids.forEach((id) => tools.getChildById(id)?.moveInit())
    return {
      kind: "move",
      ids,
      start,
      limits: moveLimits(tools, ids),
      origins: snapshotNodes(tools, ids),
      selected,
      selectedEdge,
    }
  }

  const marquee = createMarquee(tools, start)
  return { kind: "marquee", start, marqueeId: marquee.id, selected, selectedEdge }
}

function updateDiagramGesture(
  tools: StayTools,
  engine: DiagramEngine,
  session: DiagramGestureSession,
  point: Coordinate,
) {
  if (session.kind === "move") {
    const offsetX = Math.max(
      session.limits.minX,
      Math.min(snap(point.x - session.start.x), session.limits.maxX),
    )
    const offsetY = Math.max(
      session.limits.minY,
      Math.min(snap(point.y - session.start.y), session.limits.maxY),
    )
    session.ids.forEach((id: string) => tools.getChildById(id)?.move(offsetX, offsetY))
    syncEdges(tools)
    return
  }
  if (session.kind === "resize") {
    const child = tools.getChildById<NodeShape>(session.id) as NodeChild | undefined
    if (!child) return
    resizeNode(child, session.origin, session.handle, point, graphBound(tools))
    syncEdges(tools)
    return
  }
  if (session.kind === "connect") {
    const preview = tools.getChildById<EdgeShape>(session.previewId) as EdgeChild | undefined
    if (preview) updateEdgeShapes(preview, session.start, point, session.fromPort)
    return
  }
  if (session.kind === "reconnect") {
    const edge = tools.getChildById<EdgeShape>(session.edgeId) as EdgeChild | undefined
    if (!edge) return
    const from = tools.getChildById<NodeShape>(session.meta.from) as NodeChild | undefined
    const to = tools.getChildById<NodeShape>(session.meta.to) as NodeChild | undefined
    if (!from || !to) return
    if (session.end === "from") {
      updateEdgeShapes(edge, point, portOf(to, session.meta.toPort).getCenterPoint(), session.meta.fromPort, session.meta.toPort)
    } else {
      updateEdgeShapes(edge, portOf(from, session.meta.fromPort).getCenterPoint(), point, session.meta.fromPort, session.meta.toPort)
    }
    return
  }
  if (session.kind === "marquee") {
    tools.getChildById<Rectangle>(session.marqueeId)?.shape.update(rectBetween(session.start, point))
  }
}

function finishConnection(
  tools: StayTools,
  engine: DiagramEngine,
  session: Extract<DiagramGestureSession, { kind: "connect" }>,
  point?: Coordinate,
) {
  tools.removeChild(session.previewId)
  const target = point && hitNode(tools, point)
  const connected = target && target.id !== session.from
    ? createEdge(tools, engine, {
        from: session.from,
        fromPort: session.fromPort,
        to: target.id,
        toPort: nearestPort(target, point),
      })
    : undefined
  if (connected) return true
  paintControls(tools, engine)
  engine.changed()
  return false
}

function finishReconnect(
  tools: StayTools,
  engine: DiagramEngine,
  session: Extract<DiagramGestureSession, { kind: "reconnect" }>,
  point?: Coordinate,
) {
  const edge = tools.getChildById<EdgeShape>(session.edgeId) as EdgeChild | undefined
  const target = point && hitNode(tools, point)
  if (!edge || !target) return false
  const next: EdgeMeta = session.end === "from"
    ? { ...session.meta, from: target.id, fromPort: nearestPort(target, point) }
    : { ...session.meta, to: target.id, toPort: nearestPort(target, point) }
  if (next.from === next.to || relationExists(tools, next, edge.id)) return false
  storeEdgeMeta(edge.shapeMap.get("0") as Line, next)
  syncEdges(tools)
  engine.selectedEdge = edge.id
  return true
}

function finishMarquee(
  tools: StayTools,
  engine: DiagramEngine,
  session: Extract<DiagramGestureSession, { kind: "marquee" }>,
  point?: Coordinate,
) {
  tools.removeChild(session.marqueeId)
  if (!point) return
  const area = rectBetween(session.start, point)
  engine.selected.clear()
  engine.selectedEdge = undefined
  nodes(tools).filter((node) => {
    const center = bodyOf(node).getCenterPoint()
    return center.x >= area.x &&
      center.x <= area.x + area.width &&
      center.y >= area.y &&
      center.y <= area.y + area.height
  }).forEach(({ id }) => engine.selected.add(id))
}

const DIAGRAM_GESTURE_KINDS = new Set<DiagramGestureSession["kind"]>(["move", "resize", "connect", "reconnect", "marquee"])

function currentDiagramGesture(value: unknown): DiagramGestureSession | undefined {
  if (!value || typeof value !== "object") return
  const kind = (value as { kind?: unknown }).kind
  // The compose store only receives sessions returned by beginDiagramGesture.
  return typeof kind === "string" && DIAGRAM_GESTURE_KINDS.has(kind as DiagramGestureSession["kind"])
    ? value as DiagramGestureSession
    : undefined
}

export function createDiagramListeners(engine: DiagramEngine): ListenerProps[] {
  return [
    {
      name: "diagram-gesture",
      selector: ".stay-canvas",
      event: ["drag", "dragend"],
      callback: ({ e, composeStore, store, tools }) => {
        if (e.name === "drag" && !hasPointerPosition(e)) return
        return {
          drag: () => {
            if (!hasPointerPosition(e)) return composeStore
            const session = currentDiagramGesture(composeStore)
              ?? beginDiagramGesture(
                tools,
                engine,
                store.get("dragStartPosition") as Coordinate,
                e.pressedKeys,
              )
            updateDiagramGesture(tools, engine, session, e.point)
            return session
          },
          dragend: () => {
            const session = currentDiagramGesture(composeStore)
            if (!session) return { kind: undefined }
            if (e.cancelled) {
              restoreGesture(tools, engine, session)
              engine.say("Change cancelled", "已取消更改")
              return { kind: undefined }
            }
            if (session.kind === "connect") {
              const connected = finishConnection(
                tools,
                engine,
                session,
                hasPointerPosition(e) ? e.point : undefined,
              )
              if (!connected) {
                engine.say("Connection cancelled", "已取消连接")
                return { kind: undefined }
              }
            } else if (session.kind === "reconnect") {
              const reconnected = finishReconnect(
                tools,
                engine,
                session,
                hasPointerPosition(e) ? e.point : undefined,
              )
              if (!reconnected) {
                restoreGesture(tools, engine, session)
                engine.say("Connection unchanged", "连线未更改")
                return { kind: undefined }
              }
            } else if (session.kind === "marquee") {
              finishMarquee(tools, engine, session, hasPointerPosition(e) ? e.point : undefined)
            }
            commit(tools, engine)
            engine.say(
              session.kind === "connect" || session.kind === "reconnect"
                ? "Connection updated"
                : session.kind === "marquee" ? "Area selected" : "Diagram updated",
              session.kind === "connect" || session.kind === "reconnect"
                ? "已更新连线"
                : session.kind === "marquee" ? "已框选节点" : "已更新图表",
            )
            return { kind: undefined }
          },
        }
      },
    },
    {
      name: "diagram-select",
      selector: ".stay-canvas",
      event: "click",
      callback: ({ e, tools }) => {
        if (!hasPointerPosition(e)) return
        const node = hitNode(tools, e.point)
        if (node) {
          selectNode(tools, engine, node, e.pressedKeys.has("Meta") || e.pressedKeys.has("Control"))
          engine.say("Selection changed", "已更新选择")
          return
        }
        const edge = hitEdge(tools, e.point)
        selectEdge(tools, engine, edge)
        engine.say(edge ? "Connection selected" : "Selection cleared", edge ? "已选择连线" : "已取消选择")
      },
    },
    {
      name: "diagram-edit",
      selector: ".stay-canvas",
      event: "dblclick",
      callback: ({ e, tools }) => {
        if (!hasPointerPosition(e)) return
        const node = hitNode(tools, e.point)
        const edge = node ? undefined : hitEdge(tools, e.point)
        if (node) selectNode(tools, engine, node)
        else if (edge) selectEdge(tools, engine, edge)
        if (node || edge) engine.edit((node ?? edge)!.id)
      },
    },
    {
      name: "diagram-cursor",
      selector: ".stay-canvas",
      event: ["mousemove", "mouseleave"],
      callback: ({ e, tools }) => {
        if (e.name === "mouseleave" || !hasPointerPosition(e)) {
          engine.hovered = undefined
          paintControls(tools, engine)
          tools.changeCursor("default")
          return
        }
        const node = hitNode(tools, e.point)
        const port = hitPort(tools, engine, e.point)
        const nextHovered = node?.id ?? port?.child.id
        if (nextHovered !== engine.hovered) {
          engine.hovered = nextHovered
          paintControls(tools, engine)
        }
        const edgeHandle = selectedEdgeHandle(tools, engine, e.point)
        const handle = selectedHandle(tools, engine, e.point)
        if (edgeHandle || port) tools.changeCursor("crosshair")
        else if (handle) tools.changeCursor(cursors[handle.handle])
        else {
          const edge = hitEdge(tools, e.point)
          tools.changeCursor(node && engine.selected.has(node.id) ? "move" : node || edge ? "pointer" : "default")
        }
      },
    },
    {
      name: "diagram-drop",
      selector: ".stay-canvas",
      event: "drop",
      callback: ({ e, originEvent, tools }) => {
        if (!hasPointerPosition(e)) return
        const kind = (originEvent as DragEvent).dataTransfer?.getData("application/x-diagram-node-kind")
        if (!validNodeKind(kind)) return
        addDiagramNode(tools, engine, kind, e.point)
      },
    },
    {
      name: "diagram-pan",
      selector: ".stay-canvas",
      event: ["startmove", "move", "moveend"],
      callback: ({ e, composeStore, originEvent }) => ({
        startmove: () => {
          const pointer = originEvent as MouseEvent
          const viewport = engine.viewport ?? { scale: 1, x: 0, y: 0 }
          return {
            startX: pointer.clientX,
            startY: pointer.clientY,
            originX: viewport.x,
            originY: viewport.y,
          }
        },
        move: () => {
          const pointer = originEvent as MouseEvent
          const viewport = engine.viewport ?? { scale: 1, x: 0, y: 0 }
          engine.setViewport({
            ...viewport,
            x: composeStore.originX + pointer.clientX - composeStore.startX,
            y: composeStore.originY + pointer.clientY - composeStore.startY,
          })
          return composeStore
        },
        moveend: () => {
          const viewport = engine.viewport ?? { scale: 1, x: 0, y: 0 }
          if (e.cancelled) engine.setViewport({ ...viewport, x: composeStore.originX, y: composeStore.originY })
          return { startX: undefined }
        },
      }),
    },
    {
      name: "diagram-zoom",
      selector: ".stay-canvas",
      event: ["zoomin", "zoomout"],
      callback: ({ e, originEvent }) => {
        if (!hasPointerPosition(e) || e.deltaY === undefined) return
        originEvent.preventDefault()
        const current = engine.viewport ?? { scale: 1, x: 0, y: 0 }
        const nextScale = Math.max(0.6, Math.min(1.8, current.scale * (1 - e.deltaY * 0.001)))
        engine.setViewport({
          scale: nextScale,
          x: current.x + e.point.x * (current.scale - nextScale),
          y: current.y + e.point.y * (current.scale - nextScale),
        })
      },
    },
    {
      name: "diagram-shortcuts",
      event: "keydown",
      callback: ({ e, originEvent, tools }) => {
        const key = e.key?.toLowerCase() ?? ""
        const modifier = e.pressedKeys.has("Meta") || e.pressedKeys.has("Control")
        if (runShortcut(tools, engine, key, e.pressedKeys.has("Shift"), modifier)) originEvent.preventDefault()
      },
    },
  ]
}

export function seedDiagram(tools: StayTools, engine: DiagramEngine, text: (en: string, zh: string) => string) {
  const at = (x: number, y: number) => scenePoint(tools, x, y)
  const start = createNode(tools, engine, { kind: "start", label: text("Brief", "需求"), ...at(54, 226), width: 124, height: 68 })
  const design = createNode(tools, engine, { kind: "process", label: text("Design", "设计"), ...at(238, 214), width: 146, height: 92 })
  const review = createNode(tools, engine, { kind: "decision", label: text("Review", "评审"), ...at(460, 214), width: 146, height: 92 })
  const ship = createNode(tools, engine, { kind: "end", label: text("Ship", "发布"), ...at(702, 116), width: 130, height: 72 })
  const revise = createNode(tools, engine, { kind: "process", label: text("Revise", "修改"), ...at(702, 344), width: 130, height: 72 })
  createEdge(tools, engine, { from: start.id, fromPort: "e", to: design.id, toPort: "w", label: "" })
  createEdge(tools, engine, { from: design.id, fromPort: "e", to: review.id, toPort: "w", label: "" })
  createEdge(tools, engine, { from: review.id, fromPort: "e", to: ship.id, toPort: "w", label: text("Yes", "通过") })
  createEdge(tools, engine, { from: review.id, fromPort: "s", to: revise.id, toPort: "w", label: text("No", "驳回") })
  createEdge(tools, engine, { from: revise.id, fromPort: "w", to: design.id, toPort: "s", label: "" })
  paintControls(tools, engine)
  tools.log()
  tools.resetHistory()
  engine.changed()
}

export default function DiagramExample() {
  const { text } = useI18n()
  const toolsRef = useRef<StayTools>()
  const inputRef = useRef<HTMLInputElement>(null)
  const stageShellRef = useRef<HTMLDivElement>(null)
  const [summary, setSummary] = useState({ nodes: 0, edges: 0, selected: 0 })
  const [entries, setEntries] = useState<string[]>([])
  const [draftLabel, setDraftLabel] = useState("")
  const [draftKind, setDraftKind] = useState<NodeKind>("process")
  const [viewport, setViewport] = useState({ scale: 1, x: 0, y: 0 })
  const [inlineEdit, setInlineEdit] = useState<{
    id: string
    value: string
    left: number
    top: number
    width: number
  }>()
  const engineRef = useRef<DiagramEngine>({
    selected: new Set(),
    nodeSequence: 0,
    edgeSequence: 0,
    changed: () => {},
    edit: () => {},
    viewport: { scale: 1, x: 0, y: 0 },
    setViewport: () => {},
    say: () => {},
    save: () => {},
    import: () => {},
  })
  const engine = engineRef.current

  engine.viewport = viewport
  engine.setViewport = setViewport
  engine.say = (en, zh) => setEntries((current) => [text(en, zh), ...current].slice(0, 8))
  engine.changed = () => {
    const tools = toolsRef.current
    setSummary({
      nodes: tools ? nodes(tools).length : 0,
      edges: tools ? edges(tools).length : 0,
      selected: engine.selected.size + (engine.selectedEdge ? 1 : 0),
    })
  }
  engine.import = () => inputRef.current?.click()
  engine.save = () => {
    const tools = toolsRef.current
    if (!tools) return
    const contents = JSON.stringify(toDiagramDocument(tools), null, 2)
    const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }))
    const link = Object.assign(document.createElement("a"), { href: url, download: "workflow-diagram.json" })
    link.click()
    URL.revokeObjectURL(url)
    engine.say("Diagram exported", "已导出图表")
  }

  const selectedNode = engine.selected.size === 1 && toolsRef.current
    ? toolsRef.current.getChildById<NodeShape>([...engine.selected][0]) as NodeChild | undefined
    : undefined
  const selectedEdge = engine.selectedEdge && toolsRef.current
    ? toolsRef.current.getChildById<EdgeShape>(engine.selectedEdge) as EdgeChild | undefined
    : undefined
  const selectedId = selectedNode?.id ?? selectedEdge?.id
  const selectedLabel = selectedNode ? labelOf(selectedNode).text : selectedEdge ? edgeLabelOf(selectedEdge).text : ""
  const selectedKind = selectedNode ? nodeKind(selectedNode) : "process"

  const runWithTools = (action: (tools: StayTools) => void) => {
    const tools = toolsRef.current
    if (tools) action(tools)
  }

  const openInlineEditor = (id: string) => {
    const tools = toolsRef.current
    const shell = stageShellRef.current
    const canvas = shell?.querySelector<HTMLElement>(".diagram-canvas")
    if (!tools || !shell || !canvas) return
    const node = tools.getChildById<NodeShape>(id) as NodeChild | undefined
    const edge = tools.getChildById<EdgeShape>(id) as EdgeChild | undefined
    const shellRect = shell.getBoundingClientRect()
    const canvasRect = canvas.getBoundingClientRect()
    if (node?.className === "node") {
      const body = bodyOf(node)
      setInlineEdit({
        id,
        value: labelOf(node).text,
        left: canvasRect.left - shellRect.left + body.x * viewport.scale,
        top: canvasRect.top - shellRect.top + (body.y + body.height / 2) * viewport.scale - 17,
        width: Math.max(100, body.width * viewport.scale),
      })
    } else if (edge?.className === "edge") {
      const label = edgeLabelOf(edge)
      setInlineEdit({
        id,
        value: label.text,
        left: canvasRect.left - shellRect.left + label.x * viewport.scale - 70,
        top: canvasRect.top - shellRect.top + label.y * viewport.scale - 24,
        width: 140,
      })
    }
  }

  engine.edit = openInlineEditor

  const commitInlineEdit = () => {
    const edit = inlineEdit
    setInlineEdit(undefined)
    if (!edit) return
    runWithTools((tools) => {
      const node = tools.getChildById<NodeShape>(edit.id) as NodeChild | undefined
      if (node?.className === "node") {
        if (edit.value.trim()) updateDiagramNode(tools, engine, edit.id, edit.value, nodeKind(node))
      } else {
        updateDiagramEdge(tools, engine, edit.id, edit.value)
      }
    })
  }

  useEffect(() => {
    if (selectedNode || selectedEdge) {
      setDraftLabel(selectedLabel)
      if (selectedNode) setDraftKind(selectedKind)
    } else {
      setDraftLabel("")
      setDraftKind("process")
    }
  }, [selectedEdge, selectedId, selectedKind, selectedLabel, selectedNode])

  useLayoutEffect(() => {
    const canvas = stageShellRef.current?.querySelector<HTMLElement>(".diagram-canvas")
    if (!canvas) return
    canvas.style.transformOrigin = "0 0"
    canvas.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`
  }, [summary.nodes, viewport])

  useEffect(() => bindDiagramShortcuts(engine, () => toolsRef.current), [engine])
  const listeners = useMemo(() => createDiagramListeners(engine), [engine])

  const mounted = (tools: StayTools) => {
    toolsRef.current = tools
    seedDiagram(tools, engine, text)
  }

  const importDocument = async (file?: File) => {
    const tools = toolsRef.current
    if (!tools || !file) return
    try {
      replaceDiagramFromDocument(tools, engine, JSON.parse(await file.text()))
    } catch (error) {
      engine.say(error instanceof Error ? error.message : "Import failed", "导入失败，文件格式无效")
    }
  }

  const changeScale = (nextScale: number) => {
    const scale = Math.max(0.6, Math.min(1.8, nextScale))
    const center = { x: SCENE_WIDTH / 2, y: SCENE_HEIGHT / 2 }
    setViewport((current) => ({
      scale,
      x: current.x + center.x * (current.scale - scale),
      y: current.y + center.y * (current.scale - scale),
    }))
  }

  const palette = (["start", "process", "decision", "end"] as NodeKind[]).map((kind) => ({
    kind,
    label: text(
      { start: "Start", process: "Process", decision: "Decision", end: "End" }[kind],
      { start: "开始", process: "流程", decision: "判断", end: "结束" }[kind],
    ),
  }))

  return (
    <DemoLayout>
      <div className="diagram-stage-shell diagram-workspace" ref={stageShellRef}>
        <aside className="diagram-palette" aria-label={text("Flowchart shapes", "流程图形库")}>
          <strong>{text("Shapes", "图形")}</strong>
          <p>{text("Drag onto canvas", "拖入画布")}</p>
          {palette.map(({ kind, label }) => (
            <button
              draggable
              key={kind}
              onClick={() => runWithTools((tools) => addDiagramNode(tools, engine, kind))}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "copy"
                event.dataTransfer.setData("application/x-diagram-node-kind", kind)
              }}
              title={text(`Drag ${label} onto the canvas`, `拖动${label}到画布`)}
              type="button"
            >
              <span className={`diagram-palette-shape ${kind}`} />
              <span>{label}</span>
            </button>
          ))}
        </aside>
        <div className="diagram-canvas-area">
          <CanvasCard
            title={text("Workflow diagram editor", "流程图编辑器")}
            description={text(
              "Drag shapes in, double-click labels, connect blue ports, and Ctrl-drag to pan.",
              "拖入图形，双击编辑文字，拖动蓝色连接点连线，Ctrl 拖动画布。",
            )}
            wide
          >
            <StayCanvas
              className="demo-canvas demo-canvas-grid diagram-canvas"
              eventList={[DiagramDoubleClickEvent as EventProps<string>]}
              height={SCENE_HEIGHT}
              layers={3}
              listenerList={listeners}
              mounted={mounted}
              passive={false}
              width={SCENE_WIDTH}
            />
          </CanvasCard>
          <div className="diagram-floating-toolbar" aria-label={text("Diagram toolbar", "图表工具栏")}>
            <button onClick={() => runWithTools((tools) => navigateDiagramHistory(tools, engine, "undo"))} title={text("Undo", "撤销")}>↶</button>
            <button onClick={() => runWithTools((tools) => navigateDiagramHistory(tools, engine, "redo"))} title={text("Redo", "重做")}>↷</button>
            <span />
            <button disabled={engine.selected.size === 0} onClick={() => runWithTools((tools) => duplicateDiagramSelection(tools, engine))} title={text("Duplicate", "复制")}>⧉</button>
            <button disabled={summary.selected === 0} onClick={() => runWithTools((tools) => removeDiagramSelection(tools, engine))} title={text("Delete", "删除")}>⌫</button>
            <span />
            <button onClick={() => changeScale(viewport.scale - 0.1)} title={text("Zoom out", "缩小")}>−</button>
            <output>{Math.round(viewport.scale * 100)}%</output>
            <button onClick={() => changeScale(viewport.scale + 0.1)} title={text("Zoom in", "放大")}>＋</button>
            <button onClick={() => setViewport({ scale: 1, x: 0, y: 0 })} title={text("Reset view", "重置视图")}>⌂</button>
          </div>
        </div>
        {inlineEdit && (
          <input
            autoFocus
            className="diagram-inline-editor"
            maxLength={32}
            onBlur={commitInlineEdit}
            onChange={(event) => setInlineEdit({ ...inlineEdit, value: event.target.value })}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === "Enter") commitInlineEdit()
              if (event.key === "Escape") setInlineEdit(undefined)
            }}
            style={{ left: inlineEdit.left, top: inlineEdit.top, width: inlineEdit.width }}
            value={inlineEdit.value}
          />
        )}
      </div>

      <section className="diagram-inspector" aria-label={text("Selection inspector", "选择检查器")}>
        <div className="diagram-inspector-heading">
          <strong>{text("Inspector", "检查器")}</strong>
          <span>{selectedId ?? text("Nothing selected", "未选择内容")}</span>
        </div>
        <label>
          <span>{selectedEdge ? text("Connection label", "连线文字") : text("Label", "名称")}</span>
          <input disabled={!selectedNode && !selectedEdge} maxLength={32} onChange={(event) => setDraftLabel(event.target.value)} value={draftLabel} />
        </label>
        {selectedNode && <label>
          <span>{text("Type", "类型")}</span>
          <select onChange={(event) => setDraftKind(event.target.value as NodeKind)} value={draftKind}>
            <option value="start">{text("Start", "开始")}</option>
            <option value="process">{text("Process", "流程")}</option>
            <option value="decision">{text("Decision", "判断")}</option>
            <option value="end">{text("End", "结束")}</option>
          </select>
        </label>}
        <Button disabled={!selectedNode && !selectedEdge} onClick={() => runWithTools((tools) => {
          if (selectedNode && draftLabel.trim()) updateDiagramNode(tools, engine, selectedNode.id, draftLabel, draftKind)
          if (selectedEdge) updateDiagramEdge(tools, engine, selectedEdge.id, draftLabel)
        })}>{text("Apply", "应用")}</Button>
        <p>{text(
          "Double-click a node or connection to edit in place. Select a connection and drag either endpoint to reconnect it.",
          "双击节点或连线可原位编辑；选中连线后拖动任一端点即可重新连接。",
        )}</p>
      </section>

      <section className="diagram-document-controls">
        <strong>{text("Document", "文档")}</strong>
        <Toolbar>
          <Button onClick={engine.save}>{text("Export JSON", "导出 JSON")}</Button>
          <Button onClick={engine.import}>{text("Import JSON", "导入 JSON")}</Button>
          <ResetButton />
        </Toolbar>
        <input
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            void importDocument(event.target.files?.[0])
            event.target.value = ""
          }}
          ref={inputRef}
          type="file"
        />
      </section>

      <StatusGrid items={[
        [text("Nodes", "节点"), summary.nodes],
        [text("Edges", "连线"), summary.edges],
        [text("Selected", "已选择"), summary.selected],
        [text("Zoom", "缩放"), `${Math.round(viewport.scale * 100)}%`],
      ]} />
      <EventLog entries={entries} />
    </DemoLayout>
  )
}

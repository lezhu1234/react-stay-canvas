import {
  Circle,
  type Coordinate,
  Line,
  Path,
  Point,
  Polygon,
  Rectangle,
  type ShapeDrawProps,
  StayText,
  type StayTools,
  unionRects,
} from "react-stay-canvas"

import { colors, rgba, sceneArea, scenePoint } from "../../../components/DemoKit"
import {
  EDGE_FROM_KEY,
  EDGE_FROM_PORT_KEY,
  EDGE_HANDLE_RADIUS,
  EDGE_TO_KEY,
  EDGE_TO_PORT_KEY,
  GENERATED_ID_LIMIT,
  GRID_SIZE,
  HANDLE_ORDER,
  HANDLE_SIZE,
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
  NODE_KIND_KEY,
  PORT_OFFSET,
  PORT_ORDER,
  PORT_RADIUS,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type DiagramEngine,
  type EdgeChild,
  type EdgeMeta,
  type EdgeShape,
  type Handle,
  type NodeChild,
  type NodeKind,
  type NodeShape,
  type Port,
} from "./model"

const transparent = rgba(0, 0, 0, 0)
export const EDGE_PATH_KEY = "path"
const EDGE_HIT_PATH_KEY = "hit-area"
const EDGE_ARROW_KEY = "arrow"
const NODE_BODY_KEY = "body"
const NODE_LABEL_KEY = "label"
const NODE_OUTLINE_KEY = "outline"
const EDGE_LABEL_KEY = "label"
const nodePortKey = (port: Port) => `port:${port}`
const nodeHandleKey = (handle: Handle) => `handle:${handle}`
const edgeHandleKey = (end: "from" | "to") => `handle:${end}`

export const nodes = (tools: StayTools) => tools.getChildrenBySelector<NodeShape>(".node") as NodeChild[]
export const edges = (tools: StayTools) => tools.getChildrenBySelector<EdgeShape>(".edge") as EdgeChild[]

export function fitDiagramViewport(tools: StayTools) {
  const bounds = unionRects([...nodes(tools), ...edges(tools)].map((child) => child.getBound()))
  return bounds ? tools.viewport.fit(bounds, { padding: 36 }) : tools.viewport.get()
}

export const bodyOf = (child: NodeChild) => child.shapeMap.get(NODE_BODY_KEY) as Rectangle
export const labelOf = (child: NodeChild) => child.shapeMap.get(NODE_LABEL_KEY) as StayText
export const portOf = (child: NodeChild, port: Port) => child.shapeMap.get(nodePortKey(port)) as Circle
const handleOf = (child: NodeChild, handle: Handle) => child.shapeMap.get(nodeHandleKey(handle)) as Rectangle
const outlineOf = (child: NodeChild) => child.shapeMap.get(NODE_OUTLINE_KEY) as Rectangle
export const nodeKind = (child: NodeChild): NodeKind => bodyOf(child).shapeStore.get(NODE_KIND_KEY) as NodeKind
export const edgeLabelOf = (child: EdgeChild) => child.shapeMap.get(EDGE_LABEL_KEY) as StayText
export const edgeHandleOf = (child: EdgeChild, end: "from" | "to") => child.shapeMap.get(edgeHandleKey(end)) as Circle
export const edgePathOf = (child: EdgeChild) => child.shapeMap.get(EDGE_PATH_KEY) as Path
const edgeHitPathOf = (child: EdgeChild) => child.shapeMap.get(EDGE_HIT_PATH_KEY) as Path | undefined
const edgeArrowOf = (child: EdgeChild) => child.shapeMap.get(EDGE_ARROW_KEY) as Polygon

const validPort = (value: unknown): value is Port =>
  typeof value === "string" && PORT_ORDER.includes(value as Port)

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

export const snap = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE

export function defaultNodeSize(kind: NodeKind) {
  if (kind === "decision") return { width: 148, height: 96 }
  if (kind === "start" || kind === "end") return { width: 132, height: 64 }
  return { width: 148, height: 80 }
}

export function defaultNodeLabel(kind: NodeKind) {
  if (kind === "start") return "Start"
  if (kind === "decision") return "Decision"
  if (kind === "end") return "End"
  return "Process"
}

export function graphBound(tools: StayTools) {
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

export function syncNodeGeometry(child: NodeChild) {
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

export function setNodeKind(child: NodeChild, kind: NodeKind) {
  const palette = kindColors(kind)
  const body = bodyOf(child)
  body.shapeStore.set(NODE_KIND_KEY, kind)
  body.update({
    state: kind,
    fillConfig: { color: palette.fill },
    strokeConfig: { color: palette.stroke, lineWidth: 2 },
  })
}

export function createNode(
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
    shape: new Map<string, NodeShape>([
      [NODE_BODY_KEY, body],
      [NODE_LABEL_KEY, new StayText({
        x: props.x + width / 2,
        y: props.y + height / 2,
        text: props.label,
        textAlign: "center",
        textBaseline: "middle",
        font: { size: 14, fontWeight: 700 },
        layer: 2,
        zIndex: 4,
        fillConfig: { color: colors.ink },
      })],
      ...PORT_ORDER.map((port): [string, NodeShape] => [nodePortKey(port), new Circle({
        x: props.x,
        y: props.y,
        radius: PORT_RADIUS,
        layer: 2,
        zIndex: 6,
        fillConfig: { color: colors.paper },
        strokeConfig: { color: colors.blue, lineWidth: 2 },
      })]),
      ...HANDLE_ORDER.map((handle): [string, NodeShape] => [nodeHandleKey(handle), new Rectangle({
        x: props.x,
        y: props.y,
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
        layer: 2,
        zIndex: 8,
        fillConfig: { color: transparent },
        strokeConfig: { color: transparent, lineWidth: 2 },
      })]),
      [NODE_OUTLINE_KEY, new Rectangle({
        x: props.x,
        y: props.y,
        width,
        height,
        layer: 2,
        zIndex: 7,
        fillConfig: { color: transparent },
        strokeConfig: { color: transparent, lineWidth: 3 },
      })],
    ]),
  }) as NodeChild
  syncNodeGeometry(child)
  rememberDiagramSequence(engine, "node", id)
  return child
}

export function edgeMeta(child: EdgeChild): EdgeMeta | undefined {
  const main = edgePathOf(child)
  const from = main.shapeStore.get(EDGE_FROM_KEY)
  const fromPort = main.shapeStore.get(EDGE_FROM_PORT_KEY)
  const to = main.shapeStore.get(EDGE_TO_KEY)
  const toPort = main.shapeStore.get(EDGE_TO_PORT_KEY)
  if (typeof from !== "string" || typeof to !== "string" || !validPort(fromPort) || !validPort(toPort)) return
  return { id: child.id, from, fromPort, to, toPort, label: edgeLabelOf(child)?.text ?? "" }
}

export function storeEdgeMeta(shape: Path, meta: Pick<EdgeMeta, "from" | "fromPort" | "to" | "toPort">) {
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

export function updateEdgeShapes(child: EdgeChild, start: Coordinate, end: Coordinate, fromPort: Port, toPort?: Port) {
  const points = routePoints(start, end, fromPort, toPort)
  const pathPoints = points.map((point) => new Point(point))
  edgePathOf(child).update({ points: pathPoints })
  edgeHitPathOf(child)?.update({ points: pathPoints.map((point) => point.copy()) })
  const arrow = edgeArrowOf(child)
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
  arrow.update({ points: [end, a, b] })
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
  const path = new Path({
    points: [new Point(start), new Point(end)],
    layer: preview ? 2 : 0,
    zIndex: preview ? 9 : 1,
    strokeConfig,
  })
  const arrow = new Polygon({
    points: [start, end, end],
    layer: preview ? 2 : 0,
    zIndex: preview ? 9 : 1,
    fillConfig: { color: strokeConfig.color },
    strokeConfig: {
      color: strokeConfig.color,
      lineWidth: preview ? 1 : 1.5,
      lineJoin: "round",
    },
  })
  const visibleShapes: [string, EdgeShape][] = [
    [EDGE_PATH_KEY, path],
    [EDGE_ARROW_KEY, arrow],
  ]
  if (preview) return new Map<string, EdgeShape>(visibleShapes)
  return new Map<string, EdgeShape>([
    ...visibleShapes,
    [EDGE_HIT_PATH_KEY, new Path({
      points: [new Point(start), new Point(end)],
      layer: 0,
      zIndex: 0,
      strokeConfig: { color: transparent, lineWidth: 14 },
    })],
    ...(["from", "to"] as const).map((endpoint, index): [string, EdgeShape] => [edgeHandleKey(endpoint), new Circle({
      ...[start, end][index],
      radius: EDGE_HANDLE_RADIUS,
      layer: 2,
      zIndex: 9,
      fillConfig: { color: transparent },
      strokeConfig: { color: transparent, lineWidth: 2 },
    })]),
    [EDGE_LABEL_KEY, new StayText({
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2 - 8,
      text: "",
      textAlign: "center",
      textBaseline: "bottom",
      font: { size: 12, fontWeight: 700 },
      layer: 2,
      zIndex: 5,
      fillConfig: { color: colors.ink },
    })],
  ])
}

export function createEdge(
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
  storeEdgeMeta(shapes.get(EDGE_PATH_KEY) as Path, props)
  ;(shapes.get(EDGE_LABEL_KEY) as StayText).update({ text: props.label ?? "" })
  const child = tools.appendChild<EdgeShape>({
    id,
    className: "edge",
    shape: shapes,
  }) as EdgeChild
  updateEdgeShapes(child, start, end, props.fromPort, props.toPort)
  rememberDiagramSequence(engine, "edge", id)
  return child
}

export function relationExists(
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

export function syncEdges(tools: StayTools) {
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

export function paintControls(tools: StayTools, engine: Pick<DiagramEngine, "selected" | "selectedEdge" | "hovered">) {
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
    edgePathOf(edge).update({
      strokeConfig: { color: active ? colors.blue : colors.gray, lineWidth: active ? 3 : 2.5 },
    })
    const arrowColor = active ? colors.blue : colors.gray
    edgeArrowOf(edge).update({
      fillConfig: { color: arrowColor },
      strokeConfig: { color: arrowColor, lineWidth: active ? 2 : 1.5 },
    })
    ;(["from", "to"] as const).forEach((end) => edgeHandleOf(edge, end).update({
      fillConfig: { color: active ? colors.paper : transparent },
      strokeConfig: { color: active ? colors.blue : transparent, lineWidth: 2 },
    }))
  })
}

export function selectNode(tools: StayTools, engine: DiagramEngine, child?: NodeChild, additive = false) {
  if (!additive) engine.selected.clear()
  engine.selectedEdge = undefined
  if (child) {
    if (additive && engine.selected.has(child.id)) engine.selected.delete(child.id)
    else engine.selected.add(child.id)
  }
  paintControls(tools, engine)
  engine.changed()
}

export function selectEdge(tools: StayTools, engine: DiagramEngine, child?: EdgeChild) {
  engine.selected.clear()
  engine.selectedEdge = child?.id
  paintControls(tools, engine)
  engine.changed()
}

export function commit(tools: StayTools, engine: DiagramEngine) {
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

export function hitNode(tools: StayTools, point: Coordinate) {
  return nodes(tools).filter((child) => nodeContains(child, point)).sort((a, b) => bodyOf(a).area - bodyOf(b).area)[0]
}

export function hitEdge(tools: StayTools, point: Coordinate) {
  return [...edges(tools)].reverse().find((edge) => {
    const label = edgeLabelOf(edge)
    const labelBound = label.getBound()
    const labelHit = Boolean(label.text) &&
      point.x >= labelBound.x - 5 && point.x <= labelBound.x + labelBound.width + 5 &&
      point.y >= labelBound.y - 5 && point.y <= labelBound.y + labelBound.height + 5
    return labelHit || Boolean(edgeHitPathOf(edge)?.contains(point))
  })
}

export function selectedHandle(tools: StayTools, engine: DiagramEngine, point: Coordinate) {
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

export function hitPort(tools: StayTools, engine: DiagramEngine, point: Coordinate) {
  for (const child of nodes(tools)) {
    const port = PORT_ORDER.find((candidate) => portOf(child, candidate).contains(point))
    if (port) return { child, port }
  }
}

export function selectedEdgeHandle(tools: StayTools, engine: DiagramEngine, point: Coordinate) {
  const child = engine.selectedEdge && tools.getChildById<EdgeShape>(engine.selectedEdge) as EdgeChild | undefined
  if (!child) return
  const end = (["from", "to"] as const).find((candidate) => edgeHandleOf(child, candidate).contains(point))
  return end ? { child, end } : undefined
}

export function nearestPort(child: NodeChild, point: Coordinate) {
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

export function resizeNode(child: NodeChild, origin: Rectangle, handle: Handle, point: Coordinate, bound: ReturnType<typeof graphBound>) {
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

export function snapshotNodes(tools: StayTools, ids: string[]) {
  return new Map(ids.flatMap((id) => {
    const child = tools.getChildById<NodeShape>(id) as NodeChild | undefined
    if (!child) return []
    return [[id, new Map([...child.shapeMap].map(([key, shape]) => [key, shape.copy() as NodeShape]))]]
  }))
}

export function snapshotEdge(child: EdgeChild) {
  return new Map([...child.shapeMap].map(([key, shape]) => [key, shape.copy() as EdgeShape]))
}

export function moveLimits(tools: StayTools, ids: string[]) {
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

export function rectBetween(start: Coordinate, end: Coordinate) {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }
}

export function createMarquee(tools: StayTools, start: Coordinate) {
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

export function createConnectionPreview(tools: StayTools, start: Coordinate) {
  return tools.appendChild<EdgeShape>({
    className: "connection-preview",
    shape: createEdgeShapes(start, start, true),
  }) as EdgeChild
}

function createDiagramGrid(tools: StayTools) {
  const bound = graphBound(tools)
  const lines = new Map<string, Line>()
  for (let x = bound.x; x <= bound.x + bound.width; x += GRID_SIZE) {
    lines.set(`vertical:${x}`, new Line({
      x1: x,
      y1: bound.y,
      x2: x,
      y2: bound.y + bound.height,
      layer: 0,
      zIndex: -100,
      strokeConfig: { color: rgba(78, 89, 104, 0.09), lineWidth: 1 },
    }))
  }
  for (let y = bound.y; y <= bound.y + bound.height; y += GRID_SIZE) {
    lines.set(`horizontal:${y}`, new Line({
      x1: bound.x,
      y1: y,
      x2: bound.x + bound.width,
      y2: y,
      layer: 0,
      zIndex: -100,
      strokeConfig: { color: rgba(78, 89, 104, 0.09), lineWidth: 1 },
    }))
  }
  tools.appendChild<Line>({ id: "diagram-grid", className: "diagram-grid", shape: lines })
}

export function seedDiagram(tools: StayTools, engine: DiagramEngine, text: (en: string, zh: string) => string) {
  createDiagramGrid(tools)
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

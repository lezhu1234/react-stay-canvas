import { useEffect, useMemo, useRef, useState } from "react"
import {
  Circle,
  type Coordinate,
  type Cursor,
  Line,
  type ListenerProps,
  Rectangle,
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
type NodeChild = ReturnType<StayTools["appendChild"]>
type EdgeChild = ReturnType<StayTools["appendChild"]>

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
  }>
}

export type DiagramEngine = {
  selected: Set<string>
  nodeSequence: number
  edgeSequence: number
  changed: () => void
  say: (en: string, zh: string) => void
  save: () => void
  import: () => void
}

type EdgeMeta = DiagramDocument["edges"][number]

const nodes = (tools: StayTools) => tools.getChildrenBySelector<NodeShape>(".node") as NodeChild[]
const edges = (tools: StayTools) => tools.getChildrenBySelector<Line>(".edge") as EdgeChild[]
const bodyOf = (child: NodeChild) => child.shapeMap.get("0") as Rectangle
const labelOf = (child: NodeChild) => child.shapeMap.get("1") as StayText
const portOf = (child: NodeChild, port: Port) => child.shapeMap.get(String(2 + PORT_ORDER.indexOf(port))) as Circle
const handleOf = (child: NodeChild, handle: Handle) => child.shapeMap.get(String(6 + HANDLE_ORDER.indexOf(handle))) as Rectangle
const outlineOf = (child: NodeChild) => child.shapeMap.get("14") as Rectangle
const nodeKind = (child: NodeChild): NodeKind => bodyOf(child).shapeStore.get(NODE_KIND_KEY) as NodeKind

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
  PORT_ORDER.forEach((port) => portOf(child, port).update(ports[port]))
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
  const width = props.width ?? 142
  const height = props.height ?? 76
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
  return { id: child.id, from, fromPort: fromPort as Port, to, toPort: toPort as Port }
}

function storeEdgeMeta(shape: Line, meta: Omit<EdgeMeta, "id">) {
  shape.shapeStore.set(EDGE_FROM_KEY, meta.from)
  shape.shapeStore.set(EDGE_FROM_PORT_KEY, meta.fromPort)
  shape.shapeStore.set(EDGE_TO_KEY, meta.to)
  shape.shapeStore.set(EDGE_TO_PORT_KEY, meta.toPort)
}

function updateEdgeShapes(child: EdgeChild, start: Coordinate, end: Coordinate) {
  const main = child.shapeMap.get("0") as Line
  const wingA = child.shapeMap.get("1") as Line
  const wingB = child.shapeMap.get("2") as Line
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const arrowLength = 12
  const wing = (offset: number) => ({
    x: end.x - Math.cos(angle + offset) * arrowLength,
    y: end.y - Math.sin(angle + offset) * arrowLength,
  })
  const a = wing(Math.PI / 6)
  const b = wing(-Math.PI / 6)
  main.update({ x1: start.x, y1: start.y, x2: end.x, y2: end.y })
  wingA.update({ x1: end.x, y1: end.y, x2: a.x, y2: a.y })
  wingB.update({ x1: end.x, y1: end.y, x2: b.x, y2: b.y })
}

function createEdgeShapes(start: Coordinate, end: Coordinate, preview = false) {
  const strokeConfig = {
    color: preview ? colors.orange : colors.gray,
    lineWidth: preview ? 2 : 3,
    lineCap: "round" as CanvasLineCap,
    dash: preview ? [7, 5] : [],
  }
  return [0, 1, 2].map(() => new Line({
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    layer: preview ? 2 : 0,
    zIndex: preview ? 9 : 1,
    strokeConfig,
  }))
}

function createEdge(
  tools: StayTools,
  engine: DiagramEngine,
  props: Omit<EdgeMeta, "id"> & { id?: string },
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
  storeEdgeMeta(shapes[0], props)
  const child = tools.appendChild<Line>({
    id,
    className: "edge",
    shape: shapes,
  }) as EdgeChild
  updateEdgeShapes(child, start, end)
  rememberDiagramSequence(engine, "edge", id)
  return child
}

function syncEdges(tools: StayTools) {
  edges(tools).forEach((edge) => {
    const meta = edgeMeta(edge)
    const from = meta && tools.getChildById<NodeShape>(meta.from) as NodeChild | undefined
    const to = meta && tools.getChildById<NodeShape>(meta.to) as NodeChild | undefined
    if (!meta || !from || !to) return
    updateEdgeShapes(edge, portOf(from, meta.fromPort).getCenterPoint(), portOf(to, meta.toPort).getCenterPoint())
  })
}

function paintSelection(tools: StayTools, selected: Set<string>) {
  nodes(tools).forEach((child) => {
    const active = selected.has(child.id)
    outlineOf(child).update({ strokeConfig: { color: active ? colors.blue : transparent, lineWidth: 3 } })
    HANDLE_ORDER.forEach((handle) => handleOf(child, handle).update({
      fillConfig: { color: active ? colors.paper : transparent },
      strokeConfig: { color: active ? colors.blue : transparent, lineWidth: 2 },
    }))
  })
}

function selectNode(tools: StayTools, engine: DiagramEngine, child?: NodeChild, additive = false) {
  if (!additive) engine.selected.clear()
  if (child) {
    if (additive && engine.selected.has(child.id)) engine.selected.delete(child.id)
    else engine.selected.add(child.id)
  }
  paintSelection(tools, engine.selected)
  engine.changed()
}

function commit(tools: StayTools, engine: DiagramEngine) {
  paintSelection(tools, new Set())
  tools.log()
  paintSelection(tools, engine.selected)
  engine.changed()
}

function hitNode(tools: StayTools, point: Coordinate) {
  return nodes(tools).filter((child) => bodyOf(child).contains(point)).sort((a, b) => bodyOf(a).area - bodyOf(b).area)[0]
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

function hitPort(tools: StayTools, point: Coordinate) {
  for (const child of nodes(tools)) {
    const port = PORT_ORDER.find((candidate) => portOf(child, candidate).contains(point))
    if (port) return { child, port }
  }
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
    point.x,
    handle.includes("w"),
    handle.includes("e"),
    insetBound.x,
    insetBound.width,
    MIN_NODE_WIDTH,
  )
  const vertical = resizeAxis(
    origin.y,
    origin.height,
    point.y,
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
    return [[id, [...child.shapeMap.values()].map((shape) => shape.copy())]]
  }))
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
  return tools.appendChild<Line>({
    className: "connection-preview",
    shape: createEdgeShapes(start, start, true),
  }) as EdgeChild
}

function restoreGesture(tools: StayTools, engine: DiagramEngine, session: Record<string, any>) {
  if (session.previewId) tools.removeChild(session.previewId)
  if (session.marqueeId) tools.removeChild(session.marqueeId)
  session.origins?.forEach((shapes: NodeShape[], id: string) => tools.getChildById<NodeShape>(id)?.update({ shape: shapes }))
  engine.selected.clear()
  session.selected?.forEach((id: string) => engine.selected.add(id))
  syncEdges(tools)
  paintSelection(tools, engine.selected)
  engine.changed()
}

export function removeDiagramSelection(tools: StayTools, engine: DiagramEngine) {
  if (engine.selected.size === 0) return false
  edges(tools).forEach((edge) => {
    const meta = edgeMeta(edge)
    if (meta && (engine.selected.has(meta.from) || engine.selected.has(meta.to))) tools.removeChild(edge.id)
  })
  engine.selected.forEach((id) => tools.removeChild(id))
  engine.selected.clear()
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
    if (from && to) createEdge(tools, engine, { from: from.id, fromPort: meta.fromPort, to: to.id, toPort: meta.toPort })
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

export function addDiagramNode(tools: StayTools, engine: DiagramEngine, kind: NodeKind = "process") {
  const bound = graphBound(tools)
  const index = nodes(tools).length
  const child = createNode(tools, engine, {
    kind,
    label: `Step ${engine.nodeSequence + 1}`,
    x: bound.x + 80 + (index % 4) * 176,
    y: bound.y + 90 + (Math.floor(index / 4) % 3) * 130,
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
    const relation = `${edge.from}:${edge.fromPort}:${edge.to}:${edge.toPort}`
    if (relations.has(relation)) throw new Error("Diagram edges must not duplicate a connection")
    edgeIds.add(edge.id)
    relations.add(relation)
    return edge
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
  edges(tools).forEach(({ id }) => tools.removeChild(id))
  nodes(tools).forEach(({ id }) => tools.removeChild(id))
  document.nodes.forEach((node) => createNode(tools, engine, { ...node, x: bound.x + node.x, y: bound.y + node.y }))
  document.edges.forEach((edge) => createEdge(tools, engine, edge))
  commit(tools, engine)
  engine.say("Diagram imported", "已导入图表")
  return document
}

export function navigateDiagramHistory(tools: StayTools, engine: DiagramEngine, direction: "undo" | "redo") {
  selectNode(tools, engine)
  tools[direction]()
  syncEdges(tools)
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
) {
  const selected = [...engine.selected]
  const handle = selectedHandle(tools, engine, start)
  if (handle) {
    return {
      kind: "resize",
      id: handle.child.id,
      handle: handle.handle,
      origin: bodyOf(handle.child).copy(),
      origins: snapshotNodes(tools, [handle.child.id]),
      selected,
    }
  }

  const port = hitPort(tools, start)
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
    }
  }

  const marquee = createMarquee(tools, start)
  return { kind: "marquee", start, marqueeId: marquee.id, selected }
}

function updateDiagramGesture(
  tools: StayTools,
  engine: DiagramEngine,
  session: Record<string, any>,
  point: Coordinate,
) {
  if (session.kind === "move") {
    const offsetX = Math.max(
      session.limits.minX,
      Math.min(point.x - session.start.x, session.limits.maxX),
    )
    const offsetY = Math.max(
      session.limits.minY,
      Math.min(point.y - session.start.y, session.limits.maxY),
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
    const preview = tools.getChildById<Line>(session.previewId) as EdgeChild | undefined
    if (preview) updateEdgeShapes(preview, session.start, point)
    return
  }
  if (session.kind === "marquee") {
    tools.getChildById<Rectangle>(session.marqueeId)?.shape.update(rectBetween(session.start, point))
  }
}

function finishConnection(
  tools: StayTools,
  engine: DiagramEngine,
  session: Record<string, any>,
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
  paintSelection(tools, engine.selected)
  engine.changed()
  return false
}

function finishMarquee(
  tools: StayTools,
  engine: DiagramEngine,
  session: Record<string, any>,
  point?: Coordinate,
) {
  tools.removeChild(session.marqueeId)
  if (!point) return
  const area = rectBetween(session.start, point)
  engine.selected.clear()
  nodes(tools).filter((node) => {
    const center = bodyOf(node).getCenterPoint()
    return center.x >= area.x &&
      center.x <= area.x + area.width &&
      center.y >= area.y &&
      center.y <= area.y + area.height
  }).forEach(({ id }) => engine.selected.add(id))
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
            const session = composeStore.kind
              ? composeStore
              : beginDiagramGesture(
                  tools,
                  engine,
                  store.get("dragStartPosition") as Coordinate,
                  e.pressedKeys,
                )
            updateDiagramGesture(tools, engine, session, e.point)
            return session
          },
          dragend: () => {
            if (!composeStore.kind) return { kind: undefined }
            if (e.cancelled) {
              restoreGesture(tools, engine, composeStore)
              engine.say("Change cancelled", "已取消更改")
              return { kind: undefined }
            }
            if (composeStore.kind === "connect") {
              const connected = finishConnection(
                tools,
                engine,
                composeStore,
                hasPointerPosition(e) ? e.point : undefined,
              )
              if (!connected) {
                engine.say("Connection cancelled", "已取消连接")
                return { kind: undefined }
              }
            } else if (composeStore.kind === "marquee") {
              finishMarquee(tools, engine, composeStore, hasPointerPosition(e) ? e.point : undefined)
            }
            commit(tools, engine)
            engine.say(
              composeStore.kind === "connect" ? "Connection updated" : composeStore.kind === "marquee" ? "Area selected" : "Diagram updated",
              composeStore.kind === "connect" ? "已更新连接" : composeStore.kind === "marquee" ? "已框选节点" : "已更新图表",
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
        const target = hitNode(tools, e.point)
        selectNode(tools, engine, target, Boolean(target && (e.pressedKeys.has("Meta") || e.pressedKeys.has("Control"))))
        engine.say(target ? "Selection changed" : "Selection cleared", target ? "已更新选择" : "已取消选择")
      },
    },
    {
      name: "diagram-cursor",
      selector: ".stay-canvas",
      event: ["mousemove", "mouseleave"],
      callback: ({ e, tools }) => {
        if (e.name === "mouseleave" || !hasPointerPosition(e)) {
          tools.changeCursor("default")
          return
        }
        const handle = selectedHandle(tools, engine, e.point)
        if (handle) tools.changeCursor(cursors[handle.handle])
        else if (hitPort(tools, e.point)) tools.changeCursor("crosshair")
        else {
          const target = hitNode(tools, e.point)
          tools.changeCursor(target && engine.selected.has(target.id) ? "move" : target ? "pointer" : "default")
        }
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
  createEdge(tools, engine, { from: start.id, fromPort: "e", to: design.id, toPort: "w" })
  createEdge(tools, engine, { from: design.id, fromPort: "e", to: review.id, toPort: "w" })
  createEdge(tools, engine, { from: review.id, fromPort: "e", to: ship.id, toPort: "w" })
  createEdge(tools, engine, { from: review.id, fromPort: "s", to: revise.id, toPort: "w" })
  createEdge(tools, engine, { from: revise.id, fromPort: "w", to: design.id, toPort: "s" })
  paintSelection(tools, new Set())
  tools.log()
  tools.resetHistory()
  engine.changed()
}

export default function DiagramExample() {
  const { text } = useI18n()
  const toolsRef = useRef<StayTools>()
  const inputRef = useRef<HTMLInputElement>(null)
  const [summary, setSummary] = useState({ nodes: 0, edges: 0, selected: 0 })
  const [entries, setEntries] = useState<string[]>([])
  const [draftLabel, setDraftLabel] = useState("")
  const [draftKind, setDraftKind] = useState<NodeKind>("process")
  const engineRef = useRef<DiagramEngine>({
    selected: new Set(),
    nodeSequence: 0,
    edgeSequence: 0,
    changed: () => {},
    say: () => {},
    save: () => {},
    import: () => {},
  })
  const engine = engineRef.current

  engine.say = (en, zh) => setEntries((current) => [text(en, zh), ...current].slice(0, 8))
  engine.changed = () => {
    const tools = toolsRef.current
    setSummary({ nodes: tools ? nodes(tools).length : 0, edges: tools ? edges(tools).length : 0, selected: engine.selected.size })
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
  const selectedId = selectedNode?.id
  const selectedLabel = selectedNode ? labelOf(selectedNode).text : ""
  const selectedKind = selectedNode ? nodeKind(selectedNode) : "process"

  useEffect(() => {
    if (selectedNode) {
      setDraftLabel(selectedLabel)
      setDraftKind(selectedKind)
    } else {
      setDraftLabel("")
      setDraftKind("process")
    }
  }, [selectedId, selectedKind, selectedLabel])

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

  const runWithTools = (action: (tools: StayTools) => void) => {
    const tools = toolsRef.current
    if (tools) action(tools)
  }

  return (
    <DemoLayout>
      <CanvasCard
        title={text("Workflow diagram editor", "流程图编辑器")}
        description={text(
          "Select, box-select, move, resize, connect ports, edit properties, and transfer the graph as JSON.",
          "支持选择、框选、移动、缩放、端口连线、属性编辑和 JSON 导入导出。",
        )}
        wide
      >
        <StayCanvas
          className="demo-canvas demo-canvas-grid"
          height={SCENE_HEIGHT}
          layers={3}
          listenerList={listeners}
          mounted={mounted}
          width={SCENE_WIDTH}
        />
      </CanvasCard>

      <Toolbar>
        <Button onClick={() => runWithTools((tools) => addDiagramNode(tools, engine))}>{text("Add node", "添加节点")}</Button>
        <Button
          disabled={summary.selected === 0}
          onClick={() => runWithTools((tools) => duplicateDiagramSelection(tools, engine))}
        >{text("Duplicate", "复制")}</Button>
        <Button
          disabled={summary.selected === 0}
          onClick={() => runWithTools((tools) => removeDiagramSelection(tools, engine))}
        >{text("Delete", "删除")}</Button>
        <Button onClick={() => runWithTools((tools) => {
          navigateDiagramHistory(tools, engine, "undo")
          engine.say("Undo", "撤销")
        })}>{text("Undo", "撤销")}</Button>
        <Button onClick={() => runWithTools((tools) => {
          navigateDiagramHistory(tools, engine, "redo")
          engine.say("Redo", "重做")
        })}>{text("Redo", "重做")}</Button>
        <Button onClick={engine.save}>{text("Export JSON", "导出 JSON")}</Button>
        <Button onClick={engine.import}>{text("Import JSON", "导入 JSON")}</Button>
        <ResetButton />
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
      </Toolbar>

      <section className="diagram-inspector" aria-label={text("Node inspector", "节点检查器")}>
        <div className="diagram-inspector-heading">
          <strong>{text("Node inspector", "节点检查器")}</strong>
          <span>{selectedNode ? selectedNode.id : text("Select one node", "请选择一个节点")}</span>
        </div>
        <label>
          <span>{text("Label", "名称")}</span>
          <input disabled={!selectedNode} maxLength={24} onChange={(event) => setDraftLabel(event.target.value)} value={draftLabel} />
        </label>
        <label>
          <span>{text("Type", "类型")}</span>
          <select disabled={!selectedNode} onChange={(event) => setDraftKind(event.target.value as NodeKind)} value={draftKind}>
            <option value="start">{text("Start", "开始")}</option>
            <option value="process">{text("Process", "流程")}</option>
            <option value="decision">{text("Decision", "判断")}</option>
            <option value="end">{text("End", "结束")}</option>
          </select>
        </label>
        <Button disabled={!selectedNode || !draftLabel.trim()} onClick={() => {
          if (selectedNode) runWithTools((tools) => updateDiagramNode(tools, engine, selectedNode.id, draftLabel, draftKind))
        }}>{text("Apply properties", "应用属性")}</Button>
        <p>{text(
          "Drag a blue port to another node to connect. Drag blank space to box-select.",
          "从蓝色端口拖到另一节点即可连线；拖拽空白区域可框选。",
        )}</p>
      </section>

      <StatusGrid items={[
        [text("Nodes", "节点"), summary.nodes],
        [text("Edges", "连线"), summary.edges],
        [text("Selected", "已选择"), summary.selected],
        [text("Shortcuts", "快捷键"), "⌘/Ctrl Z · D · S · I"],
      ]} />
      <EventLog entries={entries} />
    </DemoLayout>
  )
}

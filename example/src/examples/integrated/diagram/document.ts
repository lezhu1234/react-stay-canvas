import type { Coordinate, StayTools } from "react-stay-canvas"

import {
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
  PORT_OFFSET,
  PORT_ORDER,
  PORT_RADIUS,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type DiagramDocument,
  type DiagramEngine,
  type EdgeChild,
  type EdgeMeta,
  type EdgeShape,
  type NodeChild,
  type NodeKind,
  type NodeShape,
  type Port,
} from "./model"
import {
  bodyOf,
  commit,
  createEdge,
  createNode,
  defaultNodeLabel,
  defaultNodeSize,
  edgeLabelOf,
  edgeMeta,
  edges,
  graphBound,
  labelOf,
  nodeKind,
  nodes,
  paintControls,
  selectNode,
  setNodeKind,
  snap,
  syncEdges,
  syncNodeGeometry,
} from "./scene"

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

export function validNodeKind(value: unknown): value is NodeKind {
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

export function runShortcut(tools: StayTools, engine: DiagramEngine, key: string, shift: boolean, modifier: boolean) {
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

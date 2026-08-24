import {
  type Coordinate,
  type EventProps,
  type ListenerProps,
  MOUSE_EVENTS,
  PredefinedEventList,
  Rectangle,
  type StayTools,
} from "react-stay-canvas"

import { hasPointerPosition } from "../../actionEventGuards"
import {
  HANDLE_CURSORS,
  type DiagramEngine,
  type EdgeChild,
  type EdgeMeta,
  type EdgeShape,
  type Handle,
  type NodeChild,
  type NodeShape,
  type NodeSnapshots,
  type Port,
} from "./model"
import {
  bodyOf,
  commit,
  createConnectionPreview,
  createEdge,
  createMarquee,
  edgeHandleOf,
  edgeMeta,
  edgePathOf,
  graphBound,
  hitEdge,
  hitNode,
  hitPort,
  moveLimits,
  nearestPort,
  nodes,
  paintControls,
  portOf,
  rectBetween,
  relationExists,
  resizeNode,
  selectedEdgeHandle,
  selectedHandle,
  selectEdge,
  selectNode,
  snapshotEdge,
  snapshotNodes,
  snap,
  storeEdgeMeta,
  syncEdges,
  updateEdgeShapes,
} from "./scene"
import { addDiagramNode, runShortcut, validNodeKind } from "./document"

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
  | { kind: "reconnect"; edgeId: string; end: "from" | "to"; meta: EdgeMeta; edgeOrigin: Map<string, EdgeShape> }
  | { kind: "marquee"; start: Coordinate; marqueeId: string }
)

const isSpacePressed = (pressedKeys: Set<string>) =>
  pressedKeys.has(" ") || pressedKeys.has("Spacebar")

export const DiagramDoubleClickEvent: EventProps<"dblclick"> = {
  name: "dblclick",
  trigger: MOUSE_EVENTS.DB_CLICK,
  conditionCallback: ({ e, store }) =>
    !isSpacePressed(e.pressedKeys) && !store.get("diagramSpaceActivation"),
}

const diagramSpaceMoveEndEvent: EventProps<string> = {
  name: "moveend",
  trigger: MOUSE_EVENTS.MOUSE_UP,
  conditionCallback: ({ e, store }) => Boolean(
    e.cancelled || store.get("diagramSpacePointer") || store.get("diagramSpaceMoving"),
  ),
  successCallback: ({ store, deleteEvent }) => {
    store.set("diagramSpacePointer", false)
    store.set("diagramSpaceMoving", false)
    deleteEvent("move")
    deleteEvent("moveend")
  },
}

const diagramSpaceMoveEvent: EventProps<string> = {
  name: "move",
  trigger: MOUSE_EVENTS.MOUSE_MOVE,
  conditionCallback: ({ e }) => isSpacePressed(e.pressedKeys) && e.pressedKeys.has("mouse0"),
  successCallback: ({ store }) => {
    store.set("diagramSpaceMoving", true)
    return diagramSpaceMoveEndEvent
  },
}

export const DiagramSpaceStartMoveEvent: EventProps<string> = {
  name: "startmove",
  trigger: MOUSE_EVENTS.MOUSE_DOWN,
  conditionCallback: ({ e }) => isSpacePressed(e.pressedKeys) && e.pressedKeys.has("mouse0"),
  successCallback: ({ store }) => {
    store.set("diagramSpacePointer", true)
    // Native dblclick arrives after mouseup, so retain the mode that owned its pointer sequence.
    store.set("diagramSpaceActivation", true)
    store.set("diagramSpaceMoving", false)
    return [diagramSpaceMoveEvent, diagramSpaceMoveEndEvent]
  },
}

export const DiagramDragStartEvent: typeof PredefinedEventList.DragStartEvent = {
  ...PredefinedEventList.DragStartEvent,
  conditionCallback: ({ e }) =>
    e.pressedKeys.has("mouse0") &&
    !e.pressedKeys.has("Control") &&
    !isSpacePressed(e.pressedKeys),
}

export const DiagramClickEvent: typeof PredefinedEventList.ClickEvent = {
  ...PredefinedEventList.ClickEvent,
  conditionCallback: (props) =>
    !props.store.get("diagramSpacePointer") &&
    Boolean(PredefinedEventList.ClickEvent.conditionCallback?.(props)),
  successCallback: ({ store }) => {
    store.set("diagramSpaceActivation", false)
  },
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
  session.selected.forEach((id) => engine.selected.add(id))
  engine.selectedEdge = session.selectedEdge
  syncEdges(tools)
  paintControls(tools, engine)
  engine.changed()
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
  storeEdgeMeta(edgePathOf(edge), next)
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
        if (isSpacePressed(e.pressedKeys)) {
          engine.hovered = undefined
          paintControls(tools, engine)
          tools.changeCursor("grab")
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
        else if (handle) tools.changeCursor(HANDLE_CURSORS[handle.handle])
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
      callback: ({ e, composeStore, originEvent, tools }) => ({
        startmove: () => {
          const pointer = originEvent as MouseEvent
          const viewport = engine.viewport ?? { scale: 1, x: 0, y: 0 }
          tools.changeCursor("grabbing")
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
          tools.changeCursor(isSpacePressed(e.pressedKeys) ? "grab" : "default")
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
      name: "diagram-space-key",
      event: ["keydown", "keyup"],
      callback: ({ e, originEvent, tools }) => {
        if (e.key !== " " && e.key !== "Spacebar") return
        originEvent.preventDefault()
        tools.changeCursor(e.name === "keydown" ? "grab" : "default")
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

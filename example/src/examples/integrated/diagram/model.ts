import type { Cursor, StayTools, ViewportState } from "react-stay-canvas"
import type { Circle, Line, Path, Rectangle, StayText } from "react-stay-canvas"

export const SCENE_WIDTH = 900
export const SCENE_HEIGHT = 560
export const MIN_NODE_WIDTH = 96
export const MIN_NODE_HEIGHT = 56
export const HANDLE_SIZE = 10
export const PORT_RADIUS = 6
export const PORT_OFFSET = 13
export const EDGE_HANDLE_RADIUS = 7
export const GRID_SIZE = 20
export const NODE_KIND_KEY = "diagram-node-kind"
export const EDGE_FROM_KEY = "diagram-edge-from"
export const EDGE_FROM_PORT_KEY = "diagram-edge-from-port"
export const EDGE_TO_KEY = "diagram-edge-to"
export const EDGE_TO_PORT_KEY = "diagram-edge-to-port"
export const GENERATED_ID_LIMIT = 1_000_000

export type NodeKind = "start" | "process" | "decision" | "end"
export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"
export type Port = "n" | "e" | "s" | "w"
export type NodeShape = Rectangle | StayText | Circle
export type EdgeShape = Path | Line | Circle | StayText
export type NodeChild = ReturnType<StayTools["appendChild"]>
export type EdgeChild = ReturnType<StayTools["appendChild"]>
export type NodeSnapshots = Map<string, Map<string, NodeShape>>

export const HANDLE_ORDER: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]
export const PORT_ORDER: Port[] = ["n", "e", "s", "w"]
export const HANDLE_CURSORS: Record<Handle, Cursor> = {
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
  viewportChanged: (viewport: Readonly<ViewportState>) => void
  say: (en: string, zh: string) => void
  save: () => void
  import: () => void
}

export type EdgeMeta = Omit<DiagramDocument["edges"][number], "label"> & { label: string }

import { useMemo, useRef, useState } from "react"
import {
  Line,
  ListenerProps,
  Rectangle,
  StayCanvas,
  StayText,
  StayTools,
} from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, EventLog, ResetButton, StatusGrid, Toolbar } from "../../components/DemoKit"

type Mode = "select" | "connect"
type Child = ReturnType<StayTools["appendChild"]>
type Edge = { childId: string; from: string; to: string; line: Line }
type SavedGraph = {
  scene: ReturnType<StayTools["exportChildren"]>
  edges: Array<Pick<Edge, "childId" | "from" | "to">>
}

export default function DiagramExample() {
  const toolsRef = useRef<StayTools | null>(null)
  const nodesRef = useRef(new Map<string, Child>())
  const edgesRef = useRef<Edge[]>([])
  const sequenceRef = useRef(0)
  const savedGraphRef = useRef<SavedGraph | null>(null)
  const [mode, setMode] = useState<Mode>("select")
  const [nodeCount, setNodeCount] = useState(0)
  const [edgeCount, setEdgeCount] = useState(0)
  const [selected, setSelected] = useState("None")
  const [entries, setEntries] = useState<string[]>([])

  const push = (message: string) => setEntries((current) => [message, ...current].slice(0, 8))

  const nodeRect = (child: Child) => [...child.shapeMap.values()].find((shape) => shape instanceof Rectangle) as Rectangle

  const updateEdges = () => {
    edgesRef.current.forEach((edge) => {
      const from = nodesRef.current.get(edge.from)
      const to = nodesRef.current.get(edge.to)
      if (!from || !to) return
      const a = nodeRect(from).getCenterPoint()
      const b = nodeRect(to).getCenterPoint()
      edge.line.update({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
    })
  }

  const addNode = (x?: number, y?: number) => {
    const tools = toolsRef.current
    if (!tools) return null
    const index = sequenceRef.current++
    const id = `node-${index + 1}`
    const nodeX = x ?? 92 + (index % 4) * 148
    const nodeY = y ?? 94 + Math.floor(index / 4) * 120
    const child = tools.appendChild({
      id,
      className: "node",
      shape: [
        new Rectangle({
          x: nodeX,
          y: nodeY,
          width: 112,
          height: 62,
          layer: 1,
          zIndex: 2,
          fillConfig: { color: index % 2 ? colors.greenSoft : colors.blueSoft },
          strokeConfig: { color: index % 2 ? colors.green : colors.blue, lineWidth: 2 },
        }),
        new StayText({
          x: nodeX + 56,
          y: nodeY + 21,
          text: `Node ${index + 1}`,
          font: { size: 15, fontWeight: 650 },
          layer: 2,
          zIndex: 3,
          fillConfig: { color: colors.ink },
        }),
      ],
    })
    nodesRef.current.set(id, child)
    setNodeCount(nodesRef.current.size)
    return child
  }

  const addEdge = (from: string, to: string) => {
    const tools = toolsRef.current
    const a = nodesRef.current.get(from)
    const b = nodesRef.current.get(to)
    if (!tools || !a || !b || from === to) return
    const start = nodeRect(a).getCenterPoint()
    const end = nodeRect(b).getCenterPoint()
    const line = new Line({ x1: start.x, y1: start.y, x2: end.x, y2: end.y, layer: 0, zIndex: 1, strokeConfig: { color: colors.gray, lineWidth: 3, lineCap: "round" } })
    const child = tools.appendChild({ className: "edge", shape: line })
    edgesRef.current.push({ childId: child.id, from, to, line })
    setEdgeCount(edgesRef.current.length)
    push(`connected ${from} to ${to}`)
  }

  const listeners = useMemo<ListenerProps[]>(() => [
    {
      name: "drag-node",
      state: "select",
      selector: ".node",
      event: ["dragstart", "drag", "dragend"],
      callback: ({ e, composeStore }) => ({
        dragstart: () => {
          e.target.moveInit()
          setSelected(e.target.id)
          return { start: e.point, child: e.target }
        },
        drag: () => {
          composeStore.child.move(e.x - composeStore.start.x, e.y - composeStore.start.y)
          updateEdges()
        },
        dragend: () => push(`moved ${composeStore.child.id}`),
      }),
    },
    {
      name: "select-node",
      state: "select",
      selector: ".node",
      event: "click",
      callback: ({ e }) => {
        setSelected(e.target.id)
        push(`selected ${e.target.id}`)
      },
    },
    {
      name: "connect-node",
      state: "connect",
      selector: ".node",
      event: "click",
      callback: ({ e, stateStore }) => {
        const from = stateStore.get("from") as string | undefined
        if (!from) {
          stateStore.set("from", e.target.id)
          setSelected(e.target.id)
          push(`connection starts at ${e.target.id}`)
        } else {
          addEdge(from, e.target.id)
          stateStore.delete("from")
          setSelected("None")
        }
      },
    },
  ], [])

  const mounted = (tools: StayTools) => {
    toolsRef.current = tools
    tools.switchState("select")
    const first = addNode(92, 90)
    const second = addNode(306, 90)
    const third = addNode(520, 220)
    if (first && second && third) {
      addEdge(first.id, second.id)
      addEdge(second.id, third.id)
    }
    tools.log()
  }

  const switchMode = (next: Mode) => {
    toolsRef.current?.switchState(next)
    setMode(next)
    setSelected("None")
    push(`mode: ${next}`)
  }

  const save = () => {
    const tools = toolsRef.current
    if (!tools) return
    savedGraphRef.current = {
      scene: tools.exportChildren({ children: tools.getChildrenWithoutRoot(), area: { x: 0, y: 0, width: 720, height: 420 } }),
      edges: edgesRef.current.map(({ childId, from, to }) => ({ childId, from, to })),
    }
    push("scene saved in memory")
  }

  const restoreCopy = () => {
    const saved = savedGraphRef.current
    const tools = toolsRef.current
    if (!saved || !tools) return
    const existingIds = new Set(tools.getChildrenWithoutRoot().map((child) => child.id))
    const importedScene = {
      ...saved.scene,
      children: saved.scene.children.map((child) => child.copy()),
    }
    tools.importChildren(importedScene, { x: 26, y: 26, width: 720, height: 420 })
    const imported = tools.getChildrenWithoutRoot().filter((child) => !existingIds.has(child.id))
    const importedByOriginalId = new Map<string, Child>()
    importedScene.children.forEach((child, index) => {
      const copy = imported[index]
      if (!copy) return
      importedByOriginalId.set(child.id, copy)
      if (copy.className === "node") nodesRef.current.set(copy.id, copy)
    })
    saved.edges.forEach((edge) => {
      const edgeChild = importedByOriginalId.get(edge.childId)
      const from = importedByOriginalId.get(edge.from)
      const to = importedByOriginalId.get(edge.to)
      const line = edgeChild?.shapeMap.values().next().value
      if (!edgeChild || !from || !to || !(line instanceof Line)) return
      edgesRef.current.push({ childId: edgeChild.id, from: from.id, to: to.id, line })
    })
    setNodeCount(nodesRef.current.size)
    setEdgeCount(edgesRef.current.length)
    push("saved scene imported as a copy")
  }

  return (
    <DemoLayout>
      <CanvasCard title="Connected diagram" description="Drag nodes in Select mode. Choose two nodes in Connect mode to create an edge." wide>
        <StayCanvas className="demo-canvas demo-canvas-grid" height={420} layers={3} listenerList={listeners} mounted={mounted} width={720} />
      </CanvasCard>
      <Toolbar>
        <Button active={mode === "select"} onClick={() => switchMode("select")}>Select</Button>
        <Button active={mode === "connect"} onClick={() => switchMode("connect")}>Connect</Button>
        <Button onClick={() => { const node = addNode(); if (node) { toolsRef.current?.log(); push(`added ${node.id}`) } }}>Add node</Button>
        <Button onClick={() => { void toolsRef.current?.zoom(-100, { x: 360, y: 210 }); push("zoom in") }}>Zoom in</Button>
        <Button onClick={() => { void toolsRef.current?.reset(); push("view reset") }}>Reset view</Button>
        <Button onClick={save}>Save scene</Button>
        <Button disabled={!savedGraphRef.current} onClick={restoreCopy}>Import copy</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[["Mode", mode], ["Nodes", nodeCount], ["Edges", edgeCount], ["Selected", selected]]} />
      <EventLog entries={entries} />
    </DemoLayout>
  )
}

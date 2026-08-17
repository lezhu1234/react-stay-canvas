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
import { useI18n } from "../../i18n"

type Mode = "select" | "connect"
type Child = ReturnType<StayTools["appendChild"]>
type Edge = { childId: string; from: string; to: string; line: Line }
type SavedGraph = {
  scene: ReturnType<StayTools["exportChildren"]>
  edges: Array<Pick<Edge, "childId" | "from" | "to">>
}

export default function DiagramExample() {
  const { text } = useI18n()
  const toolsRef = useRef<StayTools | null>(null)
  const nodesRef = useRef(new Map<string, Child>())
  const edgesRef = useRef<Edge[]>([])
  const sequenceRef = useRef(0)
  const savedGraphRef = useRef<SavedGraph | null>(null)
  const [mode, setMode] = useState<Mode>("select")
  const [nodeCount, setNodeCount] = useState(0)
  const [edgeCount, setEdgeCount] = useState(0)
  const [selected, setSelected] = useState(text("None", "无"))
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
          text: text(`Node ${index + 1}`, `节点 ${index + 1}`),
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
    push(text(`connected ${from} to ${to}`, `已连接 ${from} 与 ${to}`))
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
        dragend: () => push(text(`moved ${composeStore.child.id}`, `已移动 ${composeStore.child.id}`)),
      }),
    },
    {
      name: "select-node",
      state: "select",
      selector: ".node",
      event: "click",
      callback: ({ e }) => {
        setSelected(e.target.id)
        push(text(`selected ${e.target.id}`, `已选择 ${e.target.id}`))
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
          push(text(`connection starts at ${e.target.id}`, `连接起点为 ${e.target.id}`))
        } else {
          addEdge(from, e.target.id)
          stateStore.delete("from")
          setSelected(text("None", "无"))
        }
      },
    },
  ], [text])

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
    setSelected(text("None", "无"))
    push(text(`mode: ${next}`, `模式：${next === "select" ? "选择" : "连接"}`))
  }

  const save = () => {
    const tools = toolsRef.current
    if (!tools) return
    savedGraphRef.current = {
      scene: tools.exportChildren({ children: tools.getChildrenWithoutRoot(), area: { x: 0, y: 0, width: 720, height: 420 } }),
      edges: edgesRef.current.map(({ childId, from, to }) => ({ childId, from, to })),
    }
    push(text("scene saved in memory", "场景已保存到内存"))
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
    push(text("saved scene imported as a copy", "已将保存场景作为副本导入"))
  }

  return (
    <DemoLayout>
      <CanvasCard title={text("Connected diagram", "连线图编辑器")} description={text("Drag nodes in Select mode. Choose two nodes in Connect mode to create an edge.", "选择模式下可以拖动节点；连接模式下依次点击两个节点即可连线。")} wide>
        <StayCanvas className="demo-canvas demo-canvas-grid" height={420} layers={3} listenerList={listeners} mounted={mounted} width={720} />
      </CanvasCard>
      <Toolbar>
        <Button active={mode === "select"} onClick={() => switchMode("select")}>{text("Select", "选择")}</Button>
        <Button active={mode === "connect"} onClick={() => switchMode("connect")}>{text("Connect", "连接")}</Button>
        <Button onClick={() => { const node = addNode(); if (node) { toolsRef.current?.log(); push(text(`added ${node.id}`, `已添加 ${node.id}`)) } }}>{text("Add node", "添加节点")}</Button>
        <Button onClick={() => { void toolsRef.current?.zoom(-100, { x: 360, y: 210 }); push(text("zoom in", "放大")) }}>{text("Zoom in", "放大")}</Button>
        <Button onClick={() => { void toolsRef.current?.reset(); push(text("view reset", "视图已重置")) }}>{text("Reset view", "重置视图")}</Button>
        <Button onClick={save}>{text("Save scene", "保存场景")}</Button>
        <Button disabled={!savedGraphRef.current} onClick={restoreCopy}>{text("Import copy", "导入副本")}</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[[text("Mode", "模式"), mode === "select" ? text("select", "选择") : text("connect", "连接")], [text("Nodes", "节点"), nodeCount], [text("Edges", "边"), edgeCount], [text("Selected", "已选择"), selected]]} />
      <EventLog entries={entries} />
    </DemoLayout>
  )
}

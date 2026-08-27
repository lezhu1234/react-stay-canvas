import { useEffect, useMemo, useRef, useState } from "react"
import { type EventProps, StayCanvas, type StayTools } from "react-stay-canvas"

import {
  Button,
  CanvasCard,
  DemoLayout,
  EventLog,
  ResetButton,
  StatusGrid,
  Toolbar,
} from "../../components/DemoKit"
import { useI18n } from "../../i18n"
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type DiagramEngine,
  type EdgeChild,
  type EdgeShape,
  type NodeChild,
  type NodeKind,
  type NodeShape,
} from "./diagram/model"
import {
  bodyOf,
  edgeLabelOf,
  edges,
  fitDiagramViewport,
  labelOf,
  nodeKind,
  nodes,
  seedDiagram,
} from "./diagram/scene"
import {
  addDiagramNode,
  bindDiagramShortcuts,
  duplicateDiagramSelection,
  navigateDiagramHistory,
  removeDiagramSelection,
  replaceDiagramFromDocument,
  toDiagramDocument,
  updateDiagramEdge,
  updateDiagramNode,
} from "./diagram/document"
import {
  DiagramClickEvent,
  DiagramDoubleClickEvent,
  DiagramDragStartEvent,
  DiagramSpaceStartMoveEvent,
  createDiagramListeners,
} from "./diagram/interactions"

export default function DiagramExample() {
  const { text } = useI18n()
  const toolsRef = useRef<StayTools>()
  const inputRef = useRef<HTMLInputElement>(null)
  const stageShellRef = useRef<HTMLDivElement>(null)
  const [summary, setSummary] = useState({ nodes: 0, edges: 0, selected: 0 })
  const [entries, setEntries] = useState<string[]>([])
  const [draftLabel, setDraftLabel] = useState("")
  const [draftKind, setDraftKind] = useState<NodeKind>("process")
  const [viewportScale, setViewportScale] = useState(1)
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
    viewportChanged: () => {},
    say: () => {},
    save: () => {},
    import: () => {},
  })
  const engine = engineRef.current

  engine.viewportChanged = ({ scale }) => setViewportScale(scale)
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
    if (!tools || !shell) return
    const node = tools.getChildById<NodeShape>(id) as NodeChild | undefined
    const edge = tools.getChildById<EdgeShape>(id) as EdgeChild | undefined
    const shellRect = shell.getBoundingClientRect()
    if (node?.className === "node") {
      const body = bodyOf(node)
      const center = tools.coordinates.contentToClient({
        x: body.x + body.width / 2,
        y: body.y + body.height / 2,
      })
      const left = tools.coordinates.contentToClient({ x: body.x, y: body.y })
      const right = tools.coordinates.contentToClient({ x: body.x + body.width, y: body.y })
      setInlineEdit({
        id,
        value: labelOf(node).text,
        left: left.x - shellRect.left,
        top: center.y - shellRect.top - 17,
        width: Math.max(100, right.x - left.x),
      })
    } else if (edge?.className === "edge") {
      const label = edgeLabelOf(edge)
      const anchor = tools.coordinates.contentToClient(label)
      setInlineEdit({
        id,
        value: label.text,
        left: anchor.x - shellRect.left - 70,
        top: anchor.y - shellRect.top - 24,
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

  const changeScale = (direction: -1 | 1) => {
    const tools = toolsRef.current
    if (!tools) return
    engine.viewportChanged(tools.viewport.zoomBy(direction > 0 ? 1.1 : 1 / 1.1))
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
              "Drag shapes in, double-click labels, connect blue ports, and hold Space to pan.",
              "拖入图形，双击编辑文字，拖动蓝色连接点连线，按住空格拖动画布。",
            )}
            resizeToViewport
            wide
          >
            <StayCanvas
              className="demo-canvas diagram-canvas"
              eventList={[
                DiagramClickEvent as EventProps<string>,
                DiagramDoubleClickEvent as EventProps<string>,
                DiagramDragStartEvent as EventProps<string>,
                DiagramSpaceStartMoveEvent,
              ]}
              height={SCENE_HEIGHT}
              layers={3}
              listenerList={listeners}
              mounted={mounted}
              passive={false}
              viewport={{ minScale: 0.6, maxScale: 1.8 }}
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
            <button onClick={() => changeScale(-1)} title={text("Zoom out", "缩小")}>−</button>
            <output>{Math.round(viewportScale * 100)}%</output>
            <button onClick={() => changeScale(1)} title={text("Zoom in", "放大")}>＋</button>
            <button onClick={() => runWithTools((tools) => engine.viewportChanged(fitDiagramViewport(tools)))} title={text("Fit diagram", "适应图表")}>⌂</button>
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
        [text("Zoom", "缩放"), `${Math.round(viewportScale * 100)}%`],
      ]} />
      <EventLog entries={entries} />
    </DemoLayout>
  )
}

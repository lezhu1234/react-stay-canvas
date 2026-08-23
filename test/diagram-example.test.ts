// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { Circle, Line, Rectangle, StayText } from "react-stay-canvas"

import {
  type DiagramDocument,
  type DiagramEngine,
  DiagramDoubleClickEvent,
  addDiagramNode,
  createDiagramListeners,
  navigateDiagramHistory,
  replaceDiagramFromDocument,
  seedDiagram,
  toDiagramDocument,
} from "../example/src/examples/integrated/DiagramExample"
import { createStage, md, mm, mu } from "./helpers/stage"

vi.stubGlobal("OffscreenCanvas", class {
  constructor(public width: number, public height: number) {}
  getContext() {
    return { measureText: () => ({ width: 56, fontBoundingBoxAscent: 10, fontBoundingBoxDescent: 2 }) }
  }
})

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const body = (child: { shapeMap: Map<string, unknown> }) => child.shapeMap.get("0") as Rectangle
const label = (child: { shapeMap: Map<string, unknown> }) => child.shapeMap.get("1") as StayText
const mainLine = (child: { shapeMap: Map<string, unknown> }) => child.shapeMap.get("0") as Line
const edgeGeometry = (child: { shapeMap: Map<string, unknown> }) => ({
  lines: [0, 1, 2, 3, 4].map((index) => {
    const line = child.shapeMap.get(String(index)) as Line
    return { x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 }
  }),
  handles: [5, 6].map((index) => {
    const handle = child.shapeMap.get(String(index)) as Circle
    return { x: handle.x, y: handle.y, radius: handle.radius }
  }),
})

function engine(): DiagramEngine {
  const state: DiagramEngine = {
    selected: new Set(),
    nodeSequence: 0,
    edgeSequence: 0,
    changed: vi.fn(),
    edit: vi.fn(),
    viewport: { scale: 1, x: 0, y: 0 },
    setViewport: vi.fn((viewport) => { state.viewport = viewport }),
    say: vi.fn(),
    save: vi.fn(),
    import: vi.fn(),
  }
  return state
}

async function drag(target: HTMLCanvasElement, from: [number, number], to: [number, number]) {
  target.dispatchEvent(md(...from)); await tick()
  target.dispatchEvent(mm(...to)); await tick()
  target.dispatchEvent(mu(...to)); await tick()
}

async function click(target: HTMLCanvasElement, point: [number, number]) {
  target.dispatchEvent(md(...point)); await tick()
  target.dispatchEvent(mu(...point)); await tick()
}

async function doubleClick(target: HTMLCanvasElement, point: [number, number]) {
  target.dispatchEvent(new MouseEvent("dblclick", { clientX: point[0], clientY: point[1], bubbles: true }))
  await tick()
}

function key(target: HTMLCanvasElement, type: "keydown" | "keyup", value: string) {
  target.dispatchEvent(new KeyboardEvent(type, { key: value, bubbles: true, cancelable: true }))
}

function createDiagram() {
  const { stage, top } = createStage({ width: 900, height: 560, layers: 3 })
  const state = engine()
  seedDiagram(stage.tools, state, (en) => en)
  stage.registerEvent(DiagramDoubleClickEvent)
  createDiagramListeners(state).forEach((listener) => stage.addEventListener(listener))
  return { stage, state, top }
}

describe("integrated diagram example", () => {
  it("drives selection, multi-move, dependent arrows, and history through real input", async () => {
    const { stage, state, top } = createDiagram()
    const nodes = stage.tools.getChildrenBySelector(".node")
    const edges = stage.tools.getChildrenBySelector(".edge")
    expect(nodes).toHaveLength(5)
    expect(edges).toHaveLength(5)
    expect(nodes[0].shapeMap).toHaveLength(15)
    expect(edges[0].shapeMap).toHaveLength(8)
    expect(nodes.map((node) => body(node).state)).toEqual(["start", "process", "decision", "end", "process"])

    await click(top, [300, 250])
    key(top, "keydown", "Control")
    await click(top, [520, 250])
    key(top, "keyup", "Control")
    expect(state.selected).toEqual(new Set(["node-2", "node-3"]))

    const connectingEdge = stage.tools.getChildById("edge-2")!
    const beforeEnd = mainLine(connectingEdge).endPoint.x
    await drag(top, [300, 250], [330, 280])
    expect(body(stage.tools.getChildById("node-2")!).getBound()).toEqual({ x: 278, y: 254, width: 146, height: 92 })
    expect(body(stage.tools.getChildById("node-3")!).getBound()).toEqual({ x: 500, y: 254, width: 146, height: 92 })
    expect(mainLine(connectingEdge).endPoint.x).toBe(beforeEnd + 40)

    navigateDiagramHistory(stage.tools, state, "undo")
    expect(body(stage.tools.getChildById("node-2")!).x).toBe(238)
    expect(body(stage.tools.getChildById("node-3")!).x).toBe(460)
    navigateDiagramHistory(stage.tools, state, "redo")
    expect(body(stage.tools.getChildById("node-2")!).x).toBe(278)
    expect(body(stage.tools.getChildById("node-3")!).x).toBe(500)
    expect(mainLine(stage.tools.getChildById("edge-2")!).endPoint.x).toBe(beforeEnd + 40)
  })

  it("resizes with eight handles, connects from ports, and box-selects", async () => {
    const { stage, state, top } = createDiagram()
    await click(top, [100, 250])
    expect(state.selected).toEqual(new Set(["node-1"]))

    top.dispatchEvent(mm(178, 294)); await tick()
    expect(top.style.cursor).toBe("nwse-resize")
    await drag(top, [178, 294], [208, 324])
    expect(body(stage.tools.getChildById("node-1")!).getBound()).toEqual({ x: 54, y: 226, width: 146, height: 94 })
    expect(stage.tools.getChildById("node-1")?.shapeMap).toHaveLength(15)

    await drag(top, [213, 273], [220, 120])
    expect(stage.tools.getChildrenBySelector(".edge")).toHaveLength(5)
    expect(state.say).toHaveBeenCalledWith("Connection cancelled", "已取消连接")
    await drag(top, [213, 273], [520, 250])
    expect(stage.tools.getChildrenBySelector(".edge")).toHaveLength(6)
    expect(stage.tools.getChildrenBySelector(".edge").at(-1)?.shapeMap).toHaveLength(8)

    await drag(top, [210, 170], [650, 330])
    expect(state.selected).toEqual(new Set(["node-2", "node-3"]))
    expect(stage.tools.getChildrenBySelector(".diagram-marquee")).toHaveLength(0)
  })

  it("uses classic palette, inline edit, edge selection, reconnect, zoom, and pan paths", async () => {
    const { stage, state, top } = createDiagram()
    const node2 = stage.tools.getChildById("node-2")!
    const northPort = node2.shapeMap.get("2") as Circle
    expect(northPort.strokeConfig.color.a).toBe(0)
    top.dispatchEvent(mm(300, 250)); await tick()
    expect(northPort.strokeConfig.color.a).toBe(1)

    await doubleClick(top, [300, 250])
    expect(state.edit).toHaveBeenCalledWith("node-2")

    const labelledEdge = stage.tools.getChildById("edge-3")!
    const edgeLabel = labelledEdge.shapeMap.get("7") as StayText
    const labelBound = edgeLabel.getBound()
    await doubleClick(top, [labelBound.x + labelBound.width / 2, labelBound.y + labelBound.height / 2])
    expect(state.edit).toHaveBeenCalledWith("edge-3")

    const mixedDirectionEdge = stage.tools.getChildById("edge-5")!
    const routedLines = [0, 1, 2].map((index) => mixedDirectionEdge.shapeMap.get(String(index)) as Line)
    expect(routedLines.every((line) => line.x1 === line.x2 || line.y1 === line.y2)).toBe(true)
    expect(routedLines[2].x1).toBe(routedLines[2].x2)

    await click(top, [205, 260])
    expect(state.selectedEdge).toBe("edge-1")
    expect((stage.tools.getChildById("edge-1")!.shapeMap.get("5") as Circle).strokeConfig.color.a).toBe(1)
    await drag(top, [225, 260], [520, 250])
    expect(toDiagramDocument(stage.tools).edges.find(({ id }) => id === "edge-1")?.to).toBe("node-3")

    const transfer = { getData: (type: string) => type === "application/x-diagram-node-kind" ? "decision" : "" }
    const drop = new MouseEvent("drop", { clientX: 650, clientY: 480, bubbles: true, cancelable: true })
    Object.defineProperty(drop, "dataTransfer", { value: transfer })
    top.dispatchEvent(drop); await tick()
    const created = stage.tools.getChildrenBySelector(".node").at(-1)!
    expect(body(created).state).toBe("decision")
    expect(body(created).getBound()).toEqual({ x: 580, y: 440, width: 148, height: 96 })
    const documentBeforeViewportChange = toDiagramDocument(stage.tools)

    top.dispatchEvent(new WheelEvent("wheel", { clientX: 450, clientY: 280, deltaY: -100, bubbles: true, cancelable: true }))
    await tick()
    expect(state.viewport.scale).toBeCloseTo(1.1)
    expect(state.viewport.x).toBeCloseTo(-45)
    expect(state.viewport.y).toBeCloseTo(-28)
    key(top, "keydown", "Control")
    await drag(top, [20, 20], [50, 60])
    key(top, "keyup", "Control")
    expect(state.viewport.scale).toBeCloseTo(1.1)
    expect(state.viewport.x).toBeCloseTo(-15)
    expect(state.viewport.y).toBeCloseTo(12)
    expect(toDiagramDocument(stage.tools)).toEqual(documentBeforeViewportChange)
  })

  it("round-trips graph metadata through import, undo, and redo without damaging invalid input", () => {
    const { stage, state } = createDiagram()
    const document = toDiagramDocument(stage.tools)
    expect(document).toMatchObject({ version: 1 })
    expect(document.nodes).toHaveLength(5)
    expect(document.edges).toHaveLength(5)
    expect(document.nodes[0]).toMatchObject({ id: "node-1", kind: "start", label: "Brief", x: 54, y: 226 })

    const imported: DiagramDocument = structuredClone(document)
    imported.nodes[1].label = "Prototype"
    imported.nodes[1].kind = "decision"
    imported.edges[0].to = "node-3"
    replaceDiagramFromDocument(stage.tools, state, imported)
    expect(label(stage.tools.getChildById("node-2")!).text).toBe("Prototype")
    expect(toDiagramDocument(stage.tools)).toEqual(imported)
    navigateDiagramHistory(stage.tools, state, "undo")
    expect(toDiagramDocument(stage.tools)).toEqual(document)
    navigateDiagramHistory(stage.tools, state, "redo")
    expect(toDiagramDocument(stage.tools)).toEqual(imported)

    const invalid = structuredClone(imported)
    invalid.edges[0].to = "missing-node"
    expect(() => replaceDiagramFromDocument(stage.tools, state, invalid)).toThrow("invalid endpoints")
    expect(toDiagramDocument(stage.tools)).toEqual(imported)

    const collidingId = structuredClone(imported)
    collidingId.edges[0].id = collidingId.nodes[0].id
    expect(() => replaceDiagramFromDocument(stage.tools, state, collidingId)).toThrow("ids must be unique")
    expect(toDiagramDocument(stage.tools)).toEqual(imported)

    const rootCollision = structuredClone(imported)
    rootCollision.nodes[0].id = stage.rootId
    rootCollision.edges.forEach((edge) => {
      if (edge.from === "node-1") edge.from = stage.rootId
      if (edge.to === "node-1") edge.to = stage.rootId
    })
    expect(() => replaceDiagramFromDocument(stage.tools, state, rootCollision)).toThrow("conflicts with the canvas")
    expect(toDiagramDocument(stage.tools)).toEqual(imported)
  })

  it("keeps imported ids safe from temporary marquee and connection children", async () => {
    const { stage, state, top } = createDiagram()
    const document: DiagramDocument = {
      version: 1,
      nodes: [
        { id: "diagram-marquee", kind: "start", label: "Start", x: 100, y: 100, width: 142, height: 76 },
        { id: "diagram-connection-preview", kind: "end", label: "End", x: 400, y: 100, width: 142, height: 76 },
      ],
      edges: [],
    }
    replaceDiagramFromDocument(stage.tools, state, document)

    await drag(top, [20, 20], [40, 40])
    expect(stage.tools.hasChild("diagram-marquee")).toBe(true)
    expect(stage.tools.hasChild("diagram-connection-preview")).toBe(true)

    await drag(top, [255, 138], [450, 138])
    expect(stage.tools.hasChild("diagram-marquee")).toBe(true)
    expect(stage.tools.hasChild("diagram-connection-preview")).toBe(true)
    expect(stage.tools.getChildrenBySelector(".edge")).toHaveLength(1)
  })

  it("skips imported cross-type ids when allocating nodes and edges", async () => {
    const nodeStage = createDiagram()
    replaceDiagramFromDocument(nodeStage.stage.tools, nodeStage.state, {
      version: 1,
      nodes: [
        { id: "alpha", kind: "start", label: "Alpha", x: 100, y: 100, width: 142, height: 76 },
        { id: "beta", kind: "end", label: "Beta", x: 400, y: 100, width: 142, height: 76 },
      ],
      edges: [{ id: "node-6", from: "alpha", fromPort: "e", to: "beta", toPort: "w", label: "" }],
    } satisfies DiagramDocument)
    expect(addDiagramNode(nodeStage.stage.tools, nodeStage.state).id).toBe("node-7")

    const edgeStage = createDiagram()
    replaceDiagramFromDocument(edgeStage.stage.tools, edgeStage.state, {
      version: 1,
      nodes: [
        { id: "edge-6", kind: "start", label: "Alpha", x: 100, y: 100, width: 142, height: 76 },
        { id: "beta", kind: "end", label: "Beta", x: 400, y: 100, width: 142, height: 76 },
      ],
      edges: [],
    } satisfies DiagramDocument)
    await drag(edgeStage.top, [255, 138], [450, 138])
    expect(edgeStage.stage.tools.hasChild("edge-6")).toBe(true)
    expect(edgeStage.stage.tools.hasChild("edge-7")).toBe(true)

    const unsafeStage = createDiagram()
    replaceDiagramFromDocument(unsafeStage.stage.tools, unsafeStage.state, {
      version: 1,
      nodes: [
        { id: "node-9007199254740992", kind: "start", label: "Alpha", x: 100, y: 100, width: 142, height: 76 },
        { id: "beta", kind: "end", label: "Beta", x: 400, y: 100, width: 142, height: 76 },
      ],
      edges: [{
        id: "edge-9007199254740992",
        from: "node-9007199254740992",
        fromPort: "e",
        to: "beta",
        toPort: "w",
        label: "",
      }],
    } satisfies DiagramDocument)
    expect(addDiagramNode(unsafeStage.stage.tools, unsafeStage.state).id).toBe("node-6")
    await drag(unsafeStage.top, [387, 138], [150, 138])
    expect(unsafeStage.stage.tools.hasChild("edge-6")).toBe(true)
  })

  it("restores the original selection when a node move is cancelled", async () => {
    const { stage, state, top } = createDiagram()
    await click(top, [100, 250])
    const original = body(stage.tools.getChildById("node-2")!).getBound()

    top.dispatchEvent(md(300, 250)); await tick()
    top.dispatchEvent(mm(330, 280)); await tick()
    window.dispatchEvent(new Event("blur")); await tick()

    expect(body(stage.tools.getChildById("node-2")!).getBound()).toEqual(original)
    expect(state.selected).toEqual(new Set(["node-1"]))
    expect(state.say).toHaveBeenCalledWith("Change cancelled", "已取消更改")
  })

  it("restores edge geometry, relation, and selection when reconnect fails or is cancelled", async () => {
    const { stage, state, top } = createDiagram()
    await click(top, [205, 260])
    const original = toDiagramDocument(stage.tools)
    const originalGeometry = edgeGeometry(stage.tools.getChildById("edge-1")!)

    await drag(top, [225, 260], [400, 100])
    expect(toDiagramDocument(stage.tools)).toEqual(original)
    expect(edgeGeometry(stage.tools.getChildById("edge-1")!)).toEqual(originalGeometry)
    expect(state.selectedEdge).toBe("edge-1")
    expect(state.say).toHaveBeenCalledWith("Connection unchanged", "连线未更改")

    top.dispatchEvent(md(225, 260)); await tick()
    top.dispatchEvent(mm(520, 250)); await tick()
    window.dispatchEvent(new Event("blur")); await tick()
    expect(toDiagramDocument(stage.tools)).toEqual(original)
    expect(edgeGeometry(stage.tools.getChildById("edge-1")!)).toEqual(originalGeometry)
    expect(state.selectedEdge).toBe("edge-1")
    expect(state.say).toHaveBeenCalledWith("Change cancelled", "已取消更改")
  })

  it("supports delete, duplicate, undo, save, and import shortcuts on the Canvas", async () => {
    const { stage, state, top } = createDiagram()
    await click(top, [300, 250])
    key(top, "keydown", "Control")
    await click(top, [520, 250])
    key(top, "keyup", "Control")

    key(top, "keydown", "Control"); key(top, "keydown", "d")
    key(top, "keyup", "d"); key(top, "keyup", "Control"); await tick()
    expect(stage.tools.getChildrenBySelector(".node")).toHaveLength(7)
    expect(stage.tools.getChildrenBySelector(".edge")).toHaveLength(6)
    expect(state.selected.size).toBe(2)

    key(top, "keydown", "Delete"); key(top, "keyup", "Delete"); await tick()
    expect(stage.tools.getChildrenBySelector(".node")).toHaveLength(5)
    expect(stage.tools.getChildrenBySelector(".edge")).toHaveLength(5)
    key(top, "keydown", "Control"); key(top, "keydown", "z")
    key(top, "keyup", "z"); key(top, "keyup", "Control"); await tick()
    expect(stage.tools.getChildrenBySelector(".node")).toHaveLength(7)
    expect(stage.tools.getChildrenBySelector(".edge")).toHaveLength(6)

    key(top, "keydown", "Control"); key(top, "keydown", "s")
    key(top, "keyup", "s"); key(top, "keyup", "Control")
    key(top, "keydown", "Meta"); key(top, "keydown", "i")
    key(top, "keyup", "i"); key(top, "keyup", "Meta")
    expect(state.save).toHaveBeenCalledOnce()
    expect(state.import).toHaveBeenCalledOnce()
  })
})

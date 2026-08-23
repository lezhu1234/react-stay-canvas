// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { Line, Rectangle, StayText } from "react-stay-canvas"

import {
  type DiagramDocument,
  type DiagramEngine,
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

function engine(): DiagramEngine {
  return {
    selected: new Set(),
    nodeSequence: 0,
    edgeSequence: 0,
    changed: vi.fn(),
    say: vi.fn(),
    save: vi.fn(),
    import: vi.fn(),
  }
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

function key(target: HTMLCanvasElement, type: "keydown" | "keyup", value: string) {
  target.dispatchEvent(new KeyboardEvent(type, { key: value, bubbles: true, cancelable: true }))
}

function createDiagram() {
  const { stage, top } = createStage({ width: 900, height: 560, layers: 3 })
  const state = engine()
  seedDiagram(stage.tools, state, (en) => en)
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
    expect(edges[0].shapeMap).toHaveLength(3)

    await click(top, [300, 250])
    key(top, "keydown", "Control")
    await click(top, [520, 250])
    key(top, "keyup", "Control")
    expect(state.selected).toEqual(new Set(["node-2", "node-3"]))

    const connectingEdge = stage.tools.getChildById("edge-2")!
    const beforeEnd = mainLine(connectingEdge).endPoint.x
    await drag(top, [300, 250], [330, 280])
    expect(body(stage.tools.getChildById("node-2")!).getBound()).toEqual({ x: 268, y: 244, width: 146, height: 92 })
    expect(body(stage.tools.getChildById("node-3")!).getBound()).toEqual({ x: 490, y: 244, width: 146, height: 92 })
    expect(mainLine(connectingEdge).endPoint.x).toBe(beforeEnd + 30)

    navigateDiagramHistory(stage.tools, state, "undo")
    expect(body(stage.tools.getChildById("node-2")!).x).toBe(238)
    expect(body(stage.tools.getChildById("node-3")!).x).toBe(460)
    navigateDiagramHistory(stage.tools, state, "redo")
    expect(body(stage.tools.getChildById("node-2")!).x).toBe(268)
    expect(body(stage.tools.getChildById("node-3")!).x).toBe(490)
    expect(mainLine(stage.tools.getChildById("edge-2")!).endPoint.x).toBe(beforeEnd + 30)
  })

  it("resizes with eight handles, connects from ports, and box-selects", async () => {
    const { stage, state, top } = createDiagram()
    await click(top, [100, 250])
    expect(state.selected).toEqual(new Set(["node-1"]))

    top.dispatchEvent(mm(178, 294)); await tick()
    expect(top.style.cursor).toBe("nwse-resize")
    await drag(top, [178, 294], [208, 324])
    expect(body(stage.tools.getChildById("node-1")!).getBound()).toEqual({ x: 54, y: 226, width: 154, height: 98 })
    expect(stage.tools.getChildById("node-1")?.shapeMap).toHaveLength(15)

    await drag(top, [221, 275], [220, 120])
    expect(stage.tools.getChildrenBySelector(".edge")).toHaveLength(5)
    expect(state.say).toHaveBeenCalledWith("Connection cancelled", "已取消连接")
    await drag(top, [221, 275], [520, 250])
    expect(stage.tools.getChildrenBySelector(".edge")).toHaveLength(6)
    expect(stage.tools.getChildrenBySelector(".edge").at(-1)?.shapeMap).toHaveLength(3)

    await drag(top, [210, 170], [650, 330])
    expect(state.selected).toEqual(new Set(["node-2", "node-3"]))
    expect(stage.tools.getChildrenBySelector(".diagram-marquee")).toHaveLength(0)
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
      edges: [{ id: "node-6", from: "alpha", fromPort: "e", to: "beta", toPort: "w" }],
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

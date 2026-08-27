// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { Circle, Path, Polygon, Rectangle, StayText } from "react-stay-canvas"

import {
  type DiagramDocument,
  type DiagramEngine,
} from "../example/src/examples/integrated/diagram/model"
import {
  addDiagramNode,
  navigateDiagramHistory,
  replaceDiagramFromDocument,
  toDiagramDocument,
} from "../example/src/examples/integrated/diagram/document"
import {
  DiagramClickEvent,
  DiagramDragStartEvent,
  DiagramDoubleClickEvent,
  DiagramSpaceStartMoveEvent,
  createDiagramListeners,
} from "../example/src/examples/integrated/diagram/interactions"
import { seedDiagram } from "../example/src/examples/integrated/diagram/scene"
import { createStage, md, mm, mu } from "./helpers/stage"
import { createTextMeasureContext } from "./helpers/textMetrics"

vi.stubGlobal("OffscreenCanvas", class {
  constructor(public width: number, public height: number) {}
  getContext() {
    return createTextMeasureContext(56)
  }
})

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const body = (child: { shapeMap: Map<string, unknown> }) => child.shapeMap.get("body") as Rectangle
const label = (child: { shapeMap: Map<string, unknown> }) => child.shapeMap.get("label") as StayText
const mainPath = (child: { shapeMap: Map<string, unknown> }) => child.shapeMap.get("path") as Path
const edgeGeometry = (child: { shapeMap: Map<string, unknown> }) => ({
  paths: ["path", "hit-area"].map((key) => {
    const path = child.shapeMap.get(key) as Path
    return path.points.map(({ x, y }) => ({ x, y }))
  }),
  arrow: (child.shapeMap.get("arrow") as Polygon).points.map(({ x, y }) => ({ x, y })),
  handles: ["handle:from", "handle:to"].map((key) => {
    const handle = child.shapeMap.get(key) as Circle
    return { x: handle.x, y: handle.y, radius: handle.radius }
  }),
})

function engine(): DiagramEngine {
  return {
    selected: new Set(),
    nodeSequence: 0,
    edgeSequence: 0,
    changed: vi.fn(),
    edit: vi.fn(),
    viewportChanged: vi.fn(),
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

async function doubleClick(target: HTMLCanvasElement, point: [number, number]) {
  target.dispatchEvent(new MouseEvent("dblclick", { clientX: point[0], clientY: point[1], bubbles: true }))
  await tick()
}

function key(target: HTMLCanvasElement, type: "keydown" | "keyup", value: string) {
  const event = new KeyboardEvent(type, { key: value, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

function createDiagram() {
  const { stage, top } = createStage({ width: 900, height: 560, layers: 3 })
  const state = engine()
  seedDiagram(stage.tools, state, (en) => en)
  stage.registerEvent(DiagramClickEvent)
  stage.registerEvent(DiagramDoubleClickEvent)
  stage.registerEvent(DiagramDragStartEvent)
  stage.registerEvent(DiagramSpaceStartMoveEvent)
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
    expect(edges[0].shapeMap).toHaveLength(6)
    expect([...nodes[0].shapeMap.keys()]).toEqual([
      "body", "label", "port:n", "port:e", "port:s", "port:w",
      "handle:nw", "handle:n", "handle:ne", "handle:e",
      "handle:se", "handle:s", "handle:sw", "handle:w", "outline",
    ])
    expect([...edges[0].shapeMap.keys()]).toEqual([
      "path", "arrow", "hit-area",
      "handle:from", "handle:to", "label",
    ])
    expect(edges[0].shapeMap.get("path")).toBeInstanceOf(Path)
    expect(edges[0].shapeMap.get("arrow")).toBeInstanceOf(Polygon)
    expect(edges[0].shapeMap.get("hit-area")).toBeInstanceOf(Path)
    expect((edges[0].shapeMap.get("hit-area") as Path).strokeConfig.lineWidth).toBe(14)
    expect(nodes.map((node) => body(node).state)).toEqual(["start", "process", "decision", "end", "process"])
    nodes.forEach((node) => expect(label(node).getCenterPoint()).toEqual(body(node).getCenterPoint()))

    await click(top, [300, 250])
    key(top, "keydown", "Control")
    await click(top, [520, 250])
    key(top, "keyup", "Control")
    expect(state.selected).toEqual(new Set(["node-2", "node-3"]))

    const connectingEdge = stage.tools.getChildById("edge-2")!
    const beforeEnd = mainPath(connectingEdge).points.at(-1)!.x
    await drag(top, [300, 250], [330, 280])
    expect(body(stage.tools.getChildById("node-2")!).getBound()).toEqual({ x: 278, y: 254, width: 146, height: 92 })
    expect(body(stage.tools.getChildById("node-3")!).getBound()).toEqual({ x: 500, y: 254, width: 146, height: 92 })
    expect(mainPath(connectingEdge).points.at(-1)!.x).toBe(beforeEnd + 40)

    navigateDiagramHistory(stage.tools, state, "undo")
    expect(body(stage.tools.getChildById("node-2")!).x).toBe(238)
    expect(body(stage.tools.getChildById("node-3")!).x).toBe(460)
    navigateDiagramHistory(stage.tools, state, "redo")
    expect(body(stage.tools.getChildById("node-2")!).x).toBe(278)
    expect(body(stage.tools.getChildById("node-3")!).x).toBe(500)
    expect(mainPath(stage.tools.getChildById("edge-2")!).points.at(-1)!.x).toBe(beforeEnd + 40)
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

    top.dispatchEvent(md(213, 273)); await tick()
    top.dispatchEvent(mm(220, 120)); await tick()
    const preview = stage.tools.getChildBySelector(".connection-preview")!
    expect([...preview.shapeMap.keys()]).toEqual(["path", "arrow"])
    expect(preview.shapeMap.get("path")).toBeInstanceOf(Path)
    expect((preview.shapeMap.get("path") as Path).strokeConfig.dash).toEqual([7, 5])
    expect(mainPath(preview).points.at(-1)?.getCenterPoint()).toEqual({ x: 220, y: 120 })
    top.dispatchEvent(mu(220, 120)); await tick()
    expect(stage.tools.getChildrenBySelector(".edge")).toHaveLength(5)
    expect(state.say).toHaveBeenCalledWith("Connection cancelled", "已取消连接")
    await drag(top, [213, 273], [520, 250])
    expect(stage.tools.getChildrenBySelector(".edge")).toHaveLength(6)
    expect(stage.tools.getChildrenBySelector(".edge").at(-1)?.shapeMap).toHaveLength(6)

    await drag(top, [210, 170], [650, 330])
    expect(state.selected).toEqual(new Set(["node-2", "node-3"]))
    expect(stage.tools.getChildrenBySelector(".diagram-marquee")).toHaveLength(0)
  })

  it("uses classic palette, inline edit, edge selection, reconnect, zoom, and pan paths", async () => {
    const { stage, state, top } = createDiagram()
    const node2 = stage.tools.getChildById("node-2")!
    const northPort = node2.shapeMap.get("port:n") as Circle
    expect(northPort.strokeConfig.color.a).toBe(0)
    top.dispatchEvent(mm(300, 250)); await tick()
    expect(northPort.strokeConfig.color.a).toBe(1)

    await doubleClick(top, [300, 250])
    expect(state.edit).toHaveBeenCalledWith("node-2")

    const selectionBeforeSpaceDoubleClick = new Set(state.selected)
    const edgeBeforeSpaceDoubleClick = state.selectedEdge
    key(top, "keydown", " ")
    await click(top, [300, 250])
    top.dispatchEvent(md(300, 250)); await tick()
    key(top, "keyup", " ")
    top.dispatchEvent(mu(300, 250)); await tick()
    await doubleClick(top, [300, 250])
    expect(state.edit).toHaveBeenCalledTimes(1)
    expect(state.selected).toEqual(selectionBeforeSpaceDoubleClick)
    expect(state.selectedEdge).toBe(edgeBeforeSpaceDoubleClick)

    await click(top, [300, 250])
    await click(top, [300, 250])
    await doubleClick(top, [300, 250])
    expect(state.edit).toHaveBeenCalledTimes(2)

    const labelledEdge = stage.tools.getChildById("edge-3")!
    const edgeLabel = labelledEdge.shapeMap.get("label") as StayText
    const labelBound = edgeLabel.getBound()
    await doubleClick(top, [labelBound.x + labelBound.width / 2, labelBound.y + labelBound.height / 2])
    expect(state.edit).toHaveBeenCalledWith("edge-3")

    const mixedDirectionEdge = stage.tools.getChildById("edge-5")!
    const routedPoints = mainPath(mixedDirectionEdge).points
    expect(routedPoints.slice(1).every((point, index) =>
      point.x === routedPoints[index].x || point.y === routedPoints[index].y,
    )).toBe(true)
    expect(routedPoints[2].x).toBe(routedPoints[3].x)

    const firstEdge = stage.tools.getChildById("edge-1")!
    expect(mainPath(firstEdge).contains({ x: 205, y: 266 })).toBe(false)
    expect((firstEdge.shapeMap.get("hit-area") as Path).contains({ x: 205, y: 266 })).toBe(true)
    await click(top, [205, 266])
    expect(state.selectedEdge).toBe("edge-1")
    expect((stage.tools.getChildById("edge-1")!.shapeMap.get("handle:from") as Circle).strokeConfig.color.a).toBe(1)
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
    expect(stage.tools.viewport.get().scale).toBeCloseTo(1.1)
    expect(stage.tools.viewport.get().x).toBeCloseTo(-45)
    expect(stage.tools.viewport.get().y).toBeCloseTo(-28)
    const viewportBeforeControlDrag = stage.tools.viewport.get()
    key(top, "keydown", "Control")
    await drag(top, [20, 20], [50, 60])
    key(top, "keyup", "Control")
    expect(stage.tools.viewport.get()).toEqual(viewportBeforeControlDrag)

    const selectedBeforeSpaceClick = state.selectedEdge
    key(top, "keydown", " ")
    await click(top, [20, 20])
    key(top, "keyup", " ")
    expect(state.selectedEdge).toBe(selectedBeforeSpaceClick)
    expect(stage.tools.viewport.get()).toEqual(viewportBeforeControlDrag)

    const spaceDown = key(top, "keydown", " ")
    expect(spaceDown.defaultPrevented).toBe(true)
    expect(top.style.cursor).toBe("grab")
    await drag(top, [300, 250], [330, 290])
    key(top, "keyup", " ")
    expect(top.style.cursor).toBe("default")
    expect(stage.tools.viewport.get().scale).toBeCloseTo(1.1)
    expect(stage.tools.viewport.get().x).toBeCloseTo(-15)
    expect(stage.tools.viewport.get().y).toBeCloseTo(12)
    expect(toDiagramDocument(stage.tools)).toEqual(documentBeforeViewportChange)

    const observedViewportClick = vi.fn()
    stage.addEventListener({
      name: "zoomed-diagram-click-probe",
      event: "click",
      selector: ".stay-canvas",
      callback: ({ e }) => observedViewportClick(e.point),
    })
    const zoomedNodePoint = stage.tools.viewport.toClientPoint({ x: 300, y: 250 })
    await click(top, [zoomedNodePoint.x, zoomedNodePoint.y])
    expect(observedViewportClick.mock.calls[0][0].x).toBeCloseTo(300)
    expect(observedViewportClick.mock.calls[0][0].y).toBeCloseTo(250)
    expect(state.selected).toEqual(new Set(["node-2"]))

    const settledViewport = stage.tools.viewport.get()
    key(top, "keydown", " ")
    top.dispatchEvent(md(300, 250)); await tick()
    top.dispatchEvent(mm(350, 300)); await tick()
    expect(stage.tools.viewport.get()).not.toEqual(settledViewport)
    window.dispatchEvent(new Event("blur")); await tick()
    expect(stage.tools.viewport.get()).toEqual(settledViewport)
    expect(toDiagramDocument(stage.tools)).toEqual(documentBeforeViewportChange)
  })

  it("round-trips graph metadata through import, undo, and redo without damaging invalid input", () => {
    const { stage, state } = createDiagram()
    const document = toDiagramDocument(stage.tools)
    expect(document).toMatchObject({ version: 1 })
    expect(document.nodes).toHaveLength(5)
    expect(document.edges).toHaveLength(5)
    expect(document.nodes[0]).toMatchObject({ id: "node-1", kind: "start", label: "Brief", x: 54, y: 226 })

    const legacyDocument = structuredClone(document)
    delete legacyDocument.edges[0].label
    replaceDiagramFromDocument(stage.tools, state, legacyDocument)
    expect(toDiagramDocument(stage.tools)).toEqual(document)

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

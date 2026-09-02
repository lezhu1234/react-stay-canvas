import Canvas from "../canvas"
import { Root } from "../shapes/root"
import { InstantShape } from "../shapes/instantShape"
// import { Point } from "../shapes/point"
// import { Root } from "../shapes/root"
import type { CanvasLayerConfig } from "../types/canvas"
import type { SelectorFunc } from "../types/children"
import type { EventProps, ListenerNamePayloadPair, ListenerProps } from "../types/events"
import type { HistoryAdapter } from "../types/history"
import type { DrawReturn, StayDrawProps, StayTools, ViewportOptions } from "../types/tools"
import {
  DEFAULTSTATE,
  FRAME_EVENT_NAME,
  MOUSE_EVENTS,
  ROOTNAME,
  SUPPORT_OPRATOR,
} from "../userConstants"
import { uuid4 } from "../utils/identifiers"
import { parseLayer } from "../utils/stage"

import { ChildrenStore } from "./children/childrenStore"
import {
  isStayInstantChild,
  isStayWebGLChild,
  type StayChild,
  stayChildLayers,
} from "./children/stayChild"
import { StayInstantChild } from "./children/stayInstantChild"
import { CoordinateSystem } from "./coordinates/coordinateSystem"
import { EventDispatcher } from "./events/input/eventDispatcher"
import { ActionRouter } from "./events/routing/actionRouter"
import { createCanvas2DPointerTargetPicker } from "./events/routing/pointerTargetPicker"
import { EventRuntime } from "./events/runtime/eventRuntime"
import { History } from "./history"
import {
  captureHistoryChildren,
  type StayHistoryChildSnapshot,
} from "./historySnapshot"
import { Renderer } from "./renderer"
import { stayTools } from "./stayTools"
import type { SetShapeChildCurrentTime } from "./types"
import type { StayWebGLChild } from "./webgl2/stayWebGLChild"

class StayRootChild extends StayInstantChild<Root> {
  override resolveChildShapeLayer(layer: number | undefined) {
    return parseLayer(this.canvas.layers, layer)
  }
}

class Stay<EventName extends string, HistorySnapshot = unknown> {
  readonly children = new ChildrenStore<StayChild>()
  readonly coordinates: CoordinateSystem
  actionRouter: ActionRouter<EventName>
  eventRuntime: EventRuntime<EventName>
  renderer: Renderer
  eventDispatcher: EventDispatcher
  history: History<HistorySnapshot>
  height: number
  root: Canvas
  state: string
  stateSet: Set<string>
  stateStore: Map<string, any>
  store: Map<string, any>

  width: number
  x: number
  y: number
  rootChild: StayInstantChild<Root>
  passive: boolean
  rootId: string
  tools: StayTools

  constructor(
    root: Canvas,
    passive: boolean,
    viewportOptions?: ViewportOptions,
    historyAdapter?: HistoryAdapter<HistorySnapshot>
  ) {
    this.root = root
    this.coordinates = new CoordinateSystem(viewportOptions)
    this.passive = passive
    this.x = 0
    this.y = 0
    this.width = this.root.width
    this.height = this.root.height
    this.rootId = `${ROOTNAME}-${uuid4()}`
    this.rootChild = new StayRootChild({
      id: this.rootId,
      shape: new Root({
        x: this.x,
        y: this.y,
        width: this.width,
        height: this.height,
      }),
      canvas: this.root,
      className: ROOTNAME,
      onShapeChange: (childId) => this.markHistoryChildChanged(childId),
    })
    this.children.add(this.rootChild)
    this.store = new Map<string, any>()
    this.stateStore = new Map<string, any>()
    this.state = DEFAULTSTATE
    this.stateSet = new Set([DEFAULTSTATE])

    this.history = new History(
      () => this.captureHistoryChildren(),
      historyAdapter
    )

    this.actionRouter = new ActionRouter<EventName>({
      canvas: this.root,
      store: this.store,
      stateStore: this.stateStore,
      getTools: () => this.tools,
      isStateAvailable: (selector) =>
        this.tools.getAvailiableStates(selector).includes(this.state),
      targetResolver: {
        rootChild: this.rootChild,
        sceneChildren: () => this.getShapeChildren(),
        store: this.store,
        stateStore: this.stateStore,
        pointerTargets: createCanvas2DPointerTargetPicker(this.rootChild),
        select: (selector, sortBy) => this.tools.getChildrenBySelector(selector, sortBy),
      },
    })
    this.tools = stayTools.call(this)
    this.renderer = new Renderer(
      this.root,
      () => this.children.values().filter((child) => child.id !== this.rootId),
      this.coordinates
    )
    this.root.setLayerInvalidationListener((layerIndex) => {
      this.renderer.forceUpdateLayer(layerIndex)
      this.renderer.start()
    })
    this.eventRuntime = new EventRuntime({
      canvas: this.root,
      coordinates: this.coordinates,
      store: this.store,
      stateStore: this.stateStore,
      getState: () => this.state,
      actionRouter: this.actionRouter,
    })
    this.eventDispatcher = new EventDispatcher(
      this.root,
      this.passive,
      this.eventRuntime
    )

    try {
      this.eventDispatcher.initEvents()

      // The RAF render loop runs for every stage; it is dirty-gated (idle frames
      // paint nothing), and progress() drives timeline children as an explicit
      // seek. There is no longer any per-mode branching.
      this.startRender()
    } catch (error) {
      this.destroy()
      throw error
    }
  }

  addEventListener(props: ListenerProps<ListenerNamePayloadPair, EventName>) {
    this.actionRouter.addListener(props)
  }
  checkName(name: string, preserveNames: string[]) {
    if (name.length === 0) {
      throw new Error("name cannot be empty")
    }
    const allOprators = Object.values(SUPPORT_OPRATOR).join("") + ".#"
    const regStr = `[${allOprators}]|${preserveNames.map((name) => `^${name}$`).join("|")}`
    const forbiden = new RegExp(regStr)
    if (forbiden.test(name)) {
      throw new Error(
        `name connot contain ${allOprators} and cannot be one of: ${preserveNames}, your name: ${name}`
      )
    }
  }

  // History state lives in `this.history`; these keep the old flat field API
  // that stayTools' undo/redo/log still read and write.
  get stack() {
    return this.history.stack
  }
  get stackIndex() {
    return this.history.stackIndex
  }
  set stackIndex(value: number) {
    this.history.stackIndex = value
  }
  get historyChildren() {
    return this.history.historyChildren
  }
  get unLogedChildrenIds() {
    return this.history.unLogedChildrenIds
  }

  markHistoryChildChanged(childId: string) {
    this.unLogedChildrenIds.add(childId)
  }

  clearEventListeners() {
    this.actionRouter.clearListeners()
  }

  clearEvents() {
    this.eventRuntime.clearEvents()
  }

  destroy() {
    this.eventDispatcher.destroy()
    this.renderer.stop()
    this.children.values().filter(isStayWebGLChild).forEach((child) => child.destroy())
    this.root.destroy()
    this.eventRuntime.clearEvents()
    this.actionRouter.clearListeners()
  }

  captureHistoryChildren(): Map<string, StayHistoryChildSnapshot> {
    return captureHistoryChildren(this.children.values())
  }

  updateChildrenTime(props: SetShapeChildCurrentTime) {
    // Polymorphic: static children no-op setCurrentTime, timeline children advance.
    this.getShapeChildren().forEach((child) => child.setCurrentTime(props))
  }
  draw(props: StayDrawProps): DrawReturn {
    return this.renderer.draw(props)
  }

  filterChildren(filterCallback: (child: StayInstantChild) => boolean) {
    return this.getShapeChildren().filter(filterCallback)
  }

  findByClassName(className: string): StayInstantChild[] {
    return this.children
      .findByClassName(className, this.getShapeChildren())
      .filter(isStayInstantChild)
  }

  findBySimpleSelector(selector: string): StayInstantChild[] {
    return this.children
      .findBySimpleSelector(selector, this.getShapeChildren())
      .filter(isStayInstantChild)
  }

  findChildById(id: string): StayInstantChild | undefined {
    const child = this.children.get(id)
    return child && isStayInstantChild(child) ? child : undefined
  }

  getTools() {
    return this.tools
  }
  forceUpdateLayer(layerIndex: number) {
    this.renderer.forceUpdateLayer(layerIndex)
  }

  forceUpdateAllLayers() {
    this.renderer.forceUpdateAllLayers()
  }
  getChildById(id: string) {
    return this.findChildById(id)
  }

  getChildren() {
    return new Map(this.getShapeChildren().map((child) => [child.id, child]))
  }

  getShapeChildren() {
    return this.children.values().filter(isStayInstantChild)
  }

  getWebGLChildren() {
    return this.children.values().filter(isStayWebGLChild)
  }
  nextTick(fn: () => void) {
    this.renderer.nextTick(fn)
  }

  getChildrenBySelector(selector?: string | SelectorFunc) {
    const candidates = this.getShapeChildren()
    if (typeof selector === "function") return candidates.filter(selector)
    return this.children.bySelector(selector, candidates) as StayInstantChild[]
  }

  pushToChildren<T extends InstantShape>(child: StayInstantChild<T>) {
    this.#assertUniqueChildId(child.id)
    stayChildLayers.occupiedLayers(child).forEach((layer) => {
      if (this.root.getLayerBackend(layer) !== "canvas2d") {
        throw new Error(`Canvas2D Child ${child.id} cannot target layer ${layer}`)
      }
    })
    this.children.add(child)
  }

  pushWebGLChild(child: StayWebGLChild) {
    this.#assertUniqueChildId(child.id)
    this.assertWebGL2Layer(child.layer)
    this.children.add(child)
  }

  assertWebGL2Layer(layer: number) {
    if (layer >= this.root.layers.length || this.root.getLayerBackend(layer) !== "webgl2") {
      throw new Error(`WebGL Child cannot target layer ${layer}`)
    }
  }

  registerEvent(props: EventProps<EventName>) {
    this.eventRuntime.registerEvent(props)
  }

  removeChildById(id: string) {
    const child = this.children.delete(id)
    if (child) {
      stayChildLayers.occupiedLayers(child).forEach((layer) => {
        this.forceUpdateLayer(layer)
      })
      if (isStayWebGLChild(child)) child.destroy()
    }
    return child
  }

  resize(width: number, height: number) {
    try {
      // A pointer session cannot span two View coordinate frames. Dispatch its
      // terminal event while the old surface metrics are still authoritative.
      this.eventDispatcher.cancelPointerSession("resize")
    } finally {
      this.root.resize(width, height)
      this.width = width
      this.height = height
      this.forceUpdateAllLayers()
    }
  }

  startRender() {
    this.renderer.start()
  }

  #assertUniqueChildId(id: string) {
    if (this.children.has(id)) throw new Error(`Child id ${id} already exists`)
  }
}

// Single construction point for "a Stay wrapping a Canvas built from layers +
// dimensions" — used by both StayCanvas and the test harness so they can't drift.
export function createStay<HistorySnapshot = unknown>(
  canvasLayers: HTMLCanvasElement[],
  layerConfigs: CanvasLayerConfig[],
  width: number,
  height: number,
  passive: boolean,
  viewportOptions?: ViewportOptions,
  historyAdapter?: HistoryAdapter<HistorySnapshot>
): Stay<string, HistorySnapshot> {
  return new Stay(
    new Canvas(canvasLayers, layerConfigs, width, height),
    passive,
    viewportOptions,
    historyAdapter
  )
}

export default Stay

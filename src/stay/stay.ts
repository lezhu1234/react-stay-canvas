import Canvas from "../canvas"
import { Root } from "../shapes"
import { InstantShape } from "../shapes/instantShape"
// import { Point } from "../shapes/point"
// import { Root } from "../shapes/root"
import { EventProps, StayEventMap, StayEventProps } from "../types"
import {
  DEFAULTSTATE,
  FRAME_EVENT_NAME,
  MOUSE_EVENTS,
  ROOTNAME,
  SUPPORT_OPRATOR,
} from "../userConstants"
import {
  ActionEvent,
  DrawReturn,
  ListenerNamePayloadPair,
  ListenerProps,
  PredefinedWheelEventName,
  SelectorFunc,
  StayDrawProps,
  StayMode,
  StayTools,
  TriggerEvents,
} from "../userTypes"
import { uuid4 } from "../utils"

import { ChildrenStore } from "./childrenStore"
import { EventDispatcher } from "./eventDispatcher"
import { History } from "./history"
import { StayInstantChild } from "./child/stayInstantChild"
import { Renderer } from "./renderer"
import { stayTools } from "./stayTools"
import { SetShapeChildCurrentTime, StackItem } from "./types"

class Stay<EventName extends string, Mode extends StayMode> {
  readonly children = new ChildrenStore()
  composeStore: Record<string, any>
  renderer: Renderer
  eventDispatcher: EventDispatcher<EventName>
  history: History
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
  mode: Mode
  rootId: string
  tools: StayTools<Mode>

  constructor(root: Canvas, passive: boolean, mode: Mode) {
    this.root = root
    this.passive = passive
    this.x = 0
    this.y = 0
    this.width = this.root.width
    this.height = this.root.height
    this.rootId = `${ROOTNAME}-${uuid4()}`
    this.rootChild = new StayInstantChild({
      id: this.rootId,
      shape: new Root({
        x: this.x,
        y: this.y,
        width: this.width,
        height: this.height,
      }),
      canvas: this.root,
      className: ROOTNAME,
    })
    this.children.add(this.rootChild)
    this.store = new Map<string, any>()
    this.stateStore = new Map<string, any>()
    this.composeStore = {}
    this.state = DEFAULTSTATE
    this.stateSet = new Set([DEFAULTSTATE])

    this.history = new History(() => this.cloneChildren())

    this.tools = stayTools.call(this, mode)
    this.renderer = new Renderer(this.root, () =>
      this.children.values().filter((child) => child.id !== this.rootId)
    )
    this.eventDispatcher = new EventDispatcher(
      this.root,
      this.passive,
      this.store,
      this.stateStore,
      () => this.state,
      (originEvent, triggerEvents, payload) =>
        this.tools.triggerAction(originEvent, triggerEvents, payload)
    )

    this.eventDispatcher.initEvents()

    this.mode = mode
    // Unified render lifecycle: the RAF loop runs in EVERY mode, not just
    // instant. It is dirty-gated (idle frames paint nothing), so "animated" no
    // longer has to stay loop-less — progress() stays the explicit time driver
    // (seek / scrubbing / bound sub-range), it just no longer has to be the ONLY
    // thing that repaints. This removes the last mode-gated runtime branch, a
    // prerequisite for dropping the `mode` distinction entirely. (No auto-advance
    // clock is introduced here — that would change animated semantics and is out
    // of scope for this backward-compatible merge.)
    this.startRender()
  }

  addEventListener(props: ListenerProps<ListenerNamePayloadPair, EventName>) {
    this.eventDispatcher.addEventListener(props)
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

  get listeners() {
    return this.eventDispatcher.listeners
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

  clearEventListeners() {
    this.eventDispatcher.clearEventListeners()
  }

  clearEvents() {
    this.eventDispatcher.clearEvents()
  }

  // Delegator kept for StayStage.deleteEvent (public API). The EventDispatcher
  // cut moved the implementation into eventDispatcher; this line was missed then.
  deleteEvent(name: EventName) {
    this.eventDispatcher.deleteEvent(name)
  }

  cloneChildren(): Map<string, StayInstantChild> {
    return this.children.clone()
  }

  updateChildrenTime(props: SetShapeChildCurrentTime) {
    // Polymorphic: static children no-op setCurrentTime, timeline children advance.
    this.getChildren().forEach((child) => child.setCurrentTime(props))
  }
  draw(props: StayDrawProps): DrawReturn {
    return this.renderer.draw(props)
  }

  filterChildren(filterCallback: (child: StayInstantChild) => boolean) {
    return this.children.filter(filterCallback)
  }

  findByClassName(className: string): StayInstantChild[] {
    return this.children.findByClassName(className)
  }

  findBySimpleSelector(selector: string): StayInstantChild[] {
    return this.children.findBySimpleSelector(selector)
  }

  findChildById(id: string): StayInstantChild | undefined {
    return this.children.get(id)
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
    return this.children.get(id)
  }

  getChildren() {
    return this.children.map
  }
  nextTick(fn: () => void) {
    this.renderer.nextTick(fn)
  }

  getChildrenBySelector(selector?: string | SelectorFunc) {
    return this.children.bySelector(selector)
  }

  pushToChildren<T extends InstantShape>(child: StayInstantChild<T>) {
    this.children.add(child)
  }

  pushToStack(steps: StackItem) {
    this.history.pushToStack(steps)
  }

  registerEvent(props: EventProps<EventName>) {
    this.eventDispatcher.registerEvent(props)
  }

  removeChildById(id: string) {
    const child = this.children.delete(id)
    if (child) {
      child.getLayers().forEach((layer) => {
        this.forceUpdateLayer(layer)
      })
    }
  }

  snapshotChildren() {
    this.history.snapshot()
  }

  startRender() {
    this.renderer.start()
  }
}

export default Stay

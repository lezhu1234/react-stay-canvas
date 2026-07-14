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
import { isStayAnimatedChild, uuid4 } from "../utils"

import { ChildrenStore } from "./childrenStore"
import { EventDispatcher } from "./eventDispatcher"
import { StayInstantChild } from "./child/stayInstantChild"
import { Renderer } from "./renderer"
import { stayTools } from "./stayTools"
import { SetShapeChildCurrentTime, StackItem } from "./types"

class Stay<EventName extends string, Mode extends StayMode> {
  readonly children = new ChildrenStore()
  composeStore: Record<string, any>
  renderer: Renderer
  eventDispatcher: EventDispatcher<EventName>
  height: number
  historyChildren: Map<string, StayInstantChild>
  root: Canvas
  stack: StackItem[]
  stackIndex: number
  state: string
  stateSet: Set<string>
  stateStore: Map<string, any>
  store: Map<string, any>

  unLogedChildrenIds: Set<string>
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

    this.historyChildren = this.cloneChildren()
    this.unLogedChildrenIds = new Set()
    this.stack = []
    this.stackIndex = 0

    this.tools = stayTools.bind(this)(mode) as any as StayTools<Mode>
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
    if (mode === "instant") {
      this.startRender()
    }
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

  clearEventListeners() {
    this.eventDispatcher.clearEventListeners()
  }

  clearEvents() {
    this.eventDispatcher.clearEvents()
  }

  cloneChildren(): Map<string, StayInstantChild> {
    return this.children.clone()
  }

  updateChildrenTime(props: SetShapeChildCurrentTime) {
    this.getChildren().forEach((child) => {
      if (isStayAnimatedChild(child)) {
        child.setCurrentTime(props)
      }
    })
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
    while (this.stack.length > this.stackIndex) this.stack.pop()
    this.stack.push(steps)
    this.stackIndex++
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
    this.historyChildren = this.cloneChildren()
    this.unLogedChildrenIds.clear()
  }

  startRender() {
    this.renderer.start()
  }
}

export default Stay

import Canvas from "../canvas"
import {
  click,
  contextmenu,
  dblclick,
  dragend,
  dragover,
  dragstart,
  drop,
  keydown,
  keyup,
  mousedown,
  mouseenter,
  mouseleave,
  mousemove,
  mouseover,
  mouseup,
  wheel,
} from "../rawEvents"
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
import { StayInstantChild } from "./child/stayInstantChild"
import { Renderer } from "./renderer"
import { stayTools } from "./stayTools"
import { SetShapeChildCurrentTime, StackItem } from "./types"

class Stay<EventName extends string, Mode extends StayMode> {
  readonly children = new ChildrenStore()
  composeStore: Record<string, any>
  currentPressedKeys: {
    [key: string]: boolean
  }
  renderer: Renderer
  events: StayEventMap<EventName>
  height: number
  historyChildren: Map<string, StayInstantChild>
  listeners: Map<string, Required<ListenerProps<ListenerNamePayloadPair, EventName>>>
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
    this.events = {} as StayEventMap<EventName>
    this.store = new Map<string, any>()
    this.stateStore = new Map<string, any>()
    this.composeStore = {}
    this.currentPressedKeys = {}
    this.listeners = new Map()
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

    this.initEvents()

    this.mode = mode
    if (mode === "instant") {
      this.startRender()
    }
  }

  addEventListener({
    name,
    event,
    callback,
    state = DEFAULTSTATE,
    selector = `.${ROOTNAME}`,
    sortBy = (child) => {
      const { width, height } = child.getBound()
      return width * height
    },
  }: ListenerProps<ListenerNamePayloadPair, EventName>) {
    let eventList = event
    if (!Array.isArray(event)) {
      eventList = [event]
    }

    this.listeners.set(name, {
      name,
      state,
      selector,
      event: eventList,
      sortBy,
      callback,
    })
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

  clearEventListeners() {
    this.listeners.clear()
  }

  clearEvents() {
    this.events = {} as StayEventMap<EventName>
  }

  cloneChildren(): Map<string, StayInstantChild> {
    return this.children.clone()
  }

  deleteEvent(name: EventName) {
    delete this.events[name]
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
  fireEvent(e: KeyboardEvent | MouseEvent | WheelEvent | DragEvent | Event, trigger: string) {
    const isMouseEvent = e instanceof MouseEvent
    const triggerEvents: TriggerEvents<EventName> = {}
    Object.keys(this.events).forEach((_eventName) => {
      const eventName = _eventName as EventName
      // may be deleted by other event
      if (!this.events[eventName]) {
        return
      }
      const event = this.events[eventName] as StayEventProps<EventName>
      if (event.trigger !== trigger) return false

      const actionEvent = {
        state: this.state,
        name: eventName,
        pressedKeys: new Set(
          Object.keys(this.currentPressedKeys).filter((key) => this.currentPressedKeys[key])
        ),
        isMouseEvent: isMouseEvent,
      } as ActionEvent<EventName>

      // actionEvent.isMouseEvent = isMouseEvent

      if (actionEvent.isMouseEvent) {
        const mouseE = e as MouseEvent
        actionEvent.x = mouseE.clientX - this.root.x
        actionEvent.y = mouseE.clientY - this.root.y
        actionEvent.point = { x: actionEvent.x, y: actionEvent.y }
        if (event.trigger === MOUSE_EVENTS.WHEEL) {
          const wheelE = e as WheelEvent
          const _actionEvent = actionEvent as ActionEvent<PredefinedWheelEventName>
          _actionEvent.deltaX = wheelE.deltaX
          _actionEvent.deltaY = wheelE.deltaY
          _actionEvent.deltaZ = wheelE.deltaZ
        }
      } else {
        const keyboardE = e as KeyboardEvent
        actionEvent.key = keyboardE.key
      }

      if (
        event.conditionCallback({
          e: actionEvent,
          store: this.store,
          stateStore: this.stateStore,
        })
      ) {
        triggerEvents[eventName] = {
          info: actionEvent,
          event,
        }
        let linkEvent = event.successCallback({
          e: actionEvent,
          store: this.store,
          stateStore: this.stateStore,
          deleteEvent: this.deleteEvent.bind(this),
        })
        if (linkEvent) {
          if (!(linkEvent instanceof Array)) {
            linkEvent = [linkEvent]
          }
          linkEvent.forEach((le) => {
            this.registerEvent(le)
          })
        }
      }
    })

    this.tools.triggerAction(e, triggerEvents, {})
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

  initEvents() {
    const topLayer = this.root.layers[this.root.layers.length - 1]
    topLayer.onkeyup = (e: KeyboardEvent) =>
      keyup(this.fireEvent.bind(this), this.releaseKey.bind(this), e)
    topLayer.onkeydown = (e: KeyboardEvent) =>
      keydown(this.fireEvent.bind(this), this.pressKey.bind(this), e)
    topLayer.onmouseup = (e: MouseEvent) =>
      mouseup(this.fireEvent.bind(this), this.releaseKey.bind(this), e)
    topLayer.onmousedown = (e: MouseEvent) =>
      mousedown(this.fireEvent.bind(this), this.pressKey.bind(this), e)
    topLayer.onmousemove = (e: MouseEvent) => mousemove(this.fireEvent.bind(this), e)
    topLayer.onmouseover = (e: MouseEvent) => mouseover(this.fireEvent.bind(this), e)
    topLayer.onclick = (e: MouseEvent) => click(this.fireEvent.bind(this), e)
    topLayer.ondblclick = (e: MouseEvent) => dblclick(this.fireEvent.bind(this), e)
    topLayer.oncontextmenu = (e: MouseEvent) => contextmenu(this.fireEvent.bind(this), e)
    topLayer.ondragover = (e) => dragover(this.fireEvent.bind(this), e)
    // topLayer.ondragstart = (e: DragEvent) => dragstart(this.fireEvent.bind(this), e)
    topLayer.addEventListener(
      "dragstart",
      (e: DragEvent) => dragstart(this.fireEvent.bind(this), e),
      false
    )
    topLayer.ondragend = (e: DragEvent) => dragend(this.fireEvent.bind(this), e)
    topLayer.ondrop = (e: DragEvent) => drop(this.fireEvent.bind(this), e)
    topLayer.addEventListener("wheel", (e: WheelEvent) => wheel(this.fireEvent.bind(this), e), {
      passive: this.passive,
    })
    topLayer.onmouseenter = (e: MouseEvent) => mouseenter(this.fireEvent.bind(this), e)
    topLayer.onmouseleave = (e: MouseEvent) => mouseleave(this.fireEvent.bind(this), e)

    // const frameEvent = new Event(FRAME_EVENT_NAME)
    // const triggerFrameEvent = () => {
    //   this.fireEvent(frameEvent, FRAME_EVENT_NAME)
    //   window.requestAnimationFrame(triggerFrameEvent)
    // }

    // window.requestAnimationFrame(triggerFrameEvent)
  }

  getChildrenBySelector(selector?: string | SelectorFunc) {
    return this.children.bySelector(selector)
  }

  pressKey(key: string) {
    this.currentPressedKeys[key] = true
  }

  pushToChildren<T extends InstantShape>(child: StayInstantChild<T>) {
    this.children.add(child)
  }

  pushToStack(steps: StackItem) {
    while (this.stack.length > this.stackIndex) this.stack.pop()
    this.stack.push(steps)
    this.stackIndex++
  }

  registerEvent({
    name,
    trigger,
    conditionCallback,
    successCallback,
    withTargetConditionCallback,
  }: EventProps<EventName>) {
    const defaultConditionCallback = () => true
    const defaultSuccessCallback = () => void 0
    this.events[name] = {
      name,
      trigger,
      conditionCallback: conditionCallback || defaultConditionCallback,
      successCallback: successCallback || defaultSuccessCallback,
      withTargetConditionCallback,
    }
  }

  releaseKey(key: string) {
    this.currentPressedKeys[key] = false
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

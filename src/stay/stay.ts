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
import { infixExpressionParser, isStayAnimatedChild, uuid4 } from "../utils"

import { StayInstantChild } from "./child/stayInstantChild"
import { stayTools } from "./stayTools"
import { SetShapeChildCurrentTime, StackItem } from "./types"

interface drawLayer {
  forceUpdate: boolean
}

class Stay<EventName extends string, Mode extends StayMode> {
  #children: Map<string, StayInstantChild<InstantShape>>
  composeStore: Record<string, any>
  currentPressedKeys: {
    [key: string]: boolean
  }
  drawLayers: drawLayer[]
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
  nextTickFunctions: (() => void)[]
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
    this.#children = new Map<string, StayInstantChild>()
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
    this.#children.set(this.rootChild.id, this.rootChild)
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
    this.drawLayers = this.root.layers.map(() => ({
      forceUpdate: false,
    }))
    this.nextTickFunctions = []

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
    const newChildren = new Map<string, StayInstantChild>()
    this.getChildren().forEach((child, id) => {
      newChildren.set(id, child.copy())
    })
    return newChildren
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
  draw({
    forceDraw = false,
    now = Date.now(),
    beforeDrawCallback,
    afterDrawCallback,
  }: StayDrawProps): DrawReturn {
    interface ChildLayer {
      updateCurrentLayer: boolean
    }

    const childrenInlayer: ChildLayer[] = this.drawLayers.map((layer) => {
      const childInLayer = {
        updateCurrentLayer: layer.forceUpdate,
      }
      layer.forceUpdate = false
      return childInLayer
    })

    const children = this.tools.getChildrenWithoutRoot()

    children.forEach((child) => {
      child.getUpdatedLayers().forEach((layer) => {
        childrenInlayer[layer].updateCurrentLayer = true
      })
    })

    const updatedLayers: number[] = []
    const updatedChilds: {
      child: StayInstantChild
      shapes: InstantShape[]
    }[] = []

    if (beforeDrawCallback) {
      beforeDrawCallback()
    }

    for (let layerIndex = 0; layerIndex < childrenInlayer.length; layerIndex++) {
      const { updateCurrentLayer } = childrenInlayer[layerIndex]

      if (!updateCurrentLayer) {
        continue
      }

      updatedLayers.push(layerIndex)

      const canvas = this.root.layers[layerIndex]
      const context = this.root.contexts[layerIndex]

      if (updateCurrentLayer) {
        this.root.clear(context)
      }

      let layerDrawShapes: InstantShape[] = []

      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        const shapes = child.getShapes(layerIndex)
        layerDrawShapes.push(...shapes)
        child.layerDraw(layerIndex)
        if (shapes.length > 0) {
          updatedChilds.push({
            child,
            shapes,
          })
        }
      }

      layerDrawShapes = layerDrawShapes.sort((s1, s2) => s1.zIndex - s2.zIndex)

      layerDrawShapes.forEach((shape) => {
        shape.draw({
          context,
          now,
          width: this.width,
          height: this.height,
        })
      })
    }

    if (afterDrawCallback) {
      afterDrawCallback(this.root)
    }

    // run next tick function
    try {
      requestIdleCallback(
        (idle) => {
          while (
            this.nextTickFunctions.length > 0 &&
            (idle.timeRemaining() > 0 || idle.didTimeout)
          ) {
            const fn = this.nextTickFunctions.shift()
            if (fn) fn()
          }
        },
        { timeout: 1000 }
      )
    } catch (e) {
      while (this.nextTickFunctions.length > 0) {
        const fn = this.nextTickFunctions.shift()
        if (fn) fn()
      }
    }

    return { updatedLayers, updatedChilds }
  }

  filterChildren(filterCallback: (...args: any) => boolean) {
    return [...this.#children.values()].filter(filterCallback)
  }

  findByClassName(className: string): StayInstantChild[] {
    return this.filterChildren(
      (child) => child.className.split(":")[0] === className || child.className === className
    )
  }

  findBySimpleSelector(selector: string): StayInstantChild[] {
    if (selector.startsWith(".")) {
      return this.findByClassName(selector.slice(1))
    } else if (selector.startsWith("#")) {
      const child = this.findChildById(selector.slice(1))
      return child ? [child] : []
    }
    throw new Error("selector must start with . or #")
  }

  findChildById(id: string): StayInstantChild | undefined {
    return this.getChildById(id)
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
    this.drawLayers[layerIndex].forceUpdate = true
  }
  getChildById(id: string) {
    return this.#children.get(id)
  }

  getChildren() {
    return this.#children
  }
  nextTick(fn: () => void) {
    this.nextTickFunctions.push(fn)
  }

  render() {
    window.requestAnimationFrame(() => {
      this.render()
    })
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
    const fullSet = [...this.getChildren().values()]
    if (!selector) {
      return fullSet
    }
    const children =
      typeof selector === "function"
        ? fullSet.filter((child) => selector(child))
        : infixExpressionParser<StayInstantChild>({
            selector,
            fullSet,
            elemntEqualFunc: (a: StayInstantChild, b: StayInstantChild) => a.id === b.id,
            selectorConvertFunc: (s: string) => this.findBySimpleSelector(s),
          })
    return children
  }

  pressKey(key: string) {
    this.currentPressedKeys[key] = true
  }

  pushToChildren<T extends InstantShape>(child: StayInstantChild<T>) {
    this.#children.set(child.id, child)
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
    const child = this.getChildById(id)
    if (child) {
      this.#children.delete(id)
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
    this.draw({
      forceDraw: true,
      now: Date.now(),
    })
    window.requestAnimationFrame(this.startRender.bind(this))
  }
}

export default Stay

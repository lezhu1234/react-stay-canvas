import Canvas from "../canvas"
import {
  click,
  contextmenu,
  dblclick,
  keydown,
  keyup,
  mousedown,
  mousemove,
  mouseup,
  wheel,
} from "../rawEvents"
import { Point } from "../shapes/point"
import { Root } from "../shapes/root"
import { EventProps, StayAction, StayEventMap, StayEventProps } from "../types"
import {
  DEFAULTSTATE,
  DRAW_ACTIONS,
  MOUSE_EVENTS,
  ROOTNAME,
  SORT_CHILDREN_METHODS,
  SUPPORT_OPRATOR,
} from "../userConstants"
import { ActionEvent, ListenerProps, StayTools } from "../userTypes"
import { uuid4 } from "../utils"
import { StayChild } from "./stayChild"
import { StackItem } from "./types"

interface drawLayer {
  forceUpdate: boolean
}

class Stay {
  #children: Map<string, StayChild>
  composeStore: Record<string, any>
  currentPressedKeys: {
    [key: string]: boolean
  }
  drawLayers: drawLayer[]
  events: StayEventMap
  getTools!: () => StayTools
  height: number
  historyChildren: Map<string, StayChild>
  listeners: Map<string, StayAction>
  root: Canvas
  stack: StackItem[]
  stackIndex: number
  state: string
  stateSet: Set<string>
  stateStore: Map<string, any>
  store: Map<string, any>
  tools: StayTools
  unLogedChildrenIds: Set<string>
  width: number
  x: number
  y: number
  zIndexUpdated: boolean

  constructor(root: Canvas) {
    this.root = root
    this.x = 0
    this.y = 0
    this.width = this.root.width
    this.height = this.root.height
    this.#children = new Map<string, StayChild>()
    const rootChild = new StayChild({
      id: `${ROOTNAME}-${uuid4()}`,
      zIndex: -1,
      shape: new Root({
        x: this.x,
        y: this.y,
        width: this.width,
        height: this.height,
      }),

      className: ROOTNAME,
      layer: 0,
    })
    this.#children.set(rootChild.id, rootChild)
    this.events = {}
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
    this.zIndexUpdated = false

    this.tools = this.getTools.bind(this)()

    this.drawLayers = this.root.layers.map((layer) => ({
      forceUpdate: false,
    }))

    this.initEvents()
  }

  addEventListener({
    name,
    event,
    callback,
    state = DEFAULTSTATE,
    selector = `.${ROOTNAME}`,
    sortBy = SORT_CHILDREN_METHODS.AREA_ASC,
  }: ListenerProps) {
    let eventList = event
    if (!Array.isArray(event)) {
      eventList = [event]
    }

    this.listeners.set(name, {
      name,
      state,
      selector,
      event: eventList as string[],
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
    this.events = {}
  }

  cloneChildren(): Map<string, StayChild> {
    const newChildren = new Map<string, StayChild>()
    this.getChildren().forEach((child, id) => {
      newChildren.set(id, child.copy())
    })
    return newChildren
  }

  deleteEvent(name: string) {
    delete this.events[name]
  }

  draw(forceUpdate = false) {
    interface ChildLayer {
      update: boolean
      members: StayChild[]
    }

    const childrenInlayer: ChildLayer[] = this.drawLayers.map((layer) => ({
      update: layer.forceUpdate || forceUpdate,
      members: [],
    }))

    this.getChildren().forEach((child) => {
      childrenInlayer[child.layer].members.push(child)
      if (child.beforeLayer && child.beforeLayer !== child.layer) {
        childrenInlayer[child.beforeLayer].update = true
      } else {
        childrenInlayer[child.layer].update ||= child.drawAction === DRAW_ACTIONS.UPDATE
      }
    })

    for (const layerIndex in childrenInlayer) {
      const particalChildren = childrenInlayer[layerIndex]

      const canvas = this.root.layers[layerIndex]
      const context = this.root.contexts[layerIndex]

      if (particalChildren.update) {
        this.root.clear(context)
      }

      if (this.zIndexUpdated) {
        particalChildren.members.sort((a, b) => {
          return a.zIndex - b.zIndex
        })
      }

      particalChildren.members.forEach((child: StayChild) => {
        if (!particalChildren.update && !child.drawAction) {
          return
        }
        child.shape._draw(context, canvas)
        child.drawAction = null
      })
    }
    this.zIndexUpdated = false
  }

  filterChildren(filterCallback: (...args: any) => boolean) {
    return [...this.#children.values()].filter(filterCallback)
  }

  findByClassName(className: string): StayChild[] {
    return this.filterChildren(
      (child) => child.className.split(":")[0] === className || child.className === className
    )
  }

  findBySimpleSelector(selector: string): StayChild[] {
    if (selector.startsWith(".")) {
      return this.findByClassName(selector.slice(1))
    } else if (selector.startsWith("#")) {
      const child = this.findChildById(selector.slice(1))
      return child ? [child] : []
    }
    throw new Error("selector must start with . or #")
  }
  findChildById(id: string): StayChild | undefined {
    return this.getChildById(id)
  }
  fireEvent(e: KeyboardEvent | MouseEvent | WheelEvent, trigger: string) {
    const isMouseEvent = e instanceof MouseEvent
    const triggerEvents: { [key: string]: ActionEvent } = {}
    Object.keys(this.events).forEach((eventName) => {
      const event = this.events[eventName] as StayEventProps
      if (event.trigger !== trigger) return false

      const actionEvent = {
        state: this.state,
        name: eventName,
        pressedKeys: new Set(
          Object.keys(this.currentPressedKeys).filter((key) => this.currentPressedKeys[key])
        ),
      } as ActionEvent

      actionEvent.isMouseEvent = isMouseEvent

      if (actionEvent.isMouseEvent) {
        const mouseE = e as MouseEvent
        actionEvent.x = mouseE.clientX - this.root.x
        actionEvent.y = mouseE.clientY - this.root.y
        actionEvent.point = new Point(actionEvent.x, actionEvent.y)
        if (event.trigger === MOUSE_EVENTS.WHEEL) {
          const wheelE = e as WheelEvent
          actionEvent.deltaX = wheelE.deltaX
          actionEvent.deltaY = wheelE.deltaY
          actionEvent.deltaZ = wheelE.deltaZ
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
        triggerEvents[eventName] = actionEvent
        const linkEvent = event.successCallback({
          e: actionEvent,
          store: this.store,
          stateStore: this.stateStore,
          deleteEvent: this.deleteEvent.bind(this),
        })
        if (linkEvent) {
          this.registerEvent(linkEvent)
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
    topLayer.onwheel = (e: WheelEvent) => wheel(this.fireEvent.bind(this), e)
    topLayer.onclick = (e: MouseEvent) => click(this.fireEvent.bind(this), e)
    topLayer.ondblclick = (e: MouseEvent) => dblclick(this.fireEvent.bind(this), e)
    topLayer.oncontextmenu = (e: MouseEvent) => contextmenu(this.fireEvent.bind(this), e)
  }

  pressKey(key: string) {
    this.currentPressedKeys[key] = true
  }

  pushToChildren(child: StayChild) {
    this.#children.set(child.id, child)
  }

  pushToStack(steps: StackItem) {
    while (this.stack.length > this.stackIndex) this.stack.pop()
    this.stack.push(steps)
    this.stackIndex++
  }

  registerEvent({ name, trigger, conditionCallback, successCallback }: EventProps) {
    const defaultConditionCallback = () => true
    const defaultSuccessCallback = () => void 0
    this.events[name] = {
      name,
      trigger,
      conditionCallback: conditionCallback || defaultConditionCallback,
      successCallback: successCallback || defaultSuccessCallback,
    }
  }

  releaseKey(key: string) {
    this.currentPressedKeys[key] = false
  }

  removeChildById(id: string) {
    this.#children.delete(id)
  }

  snapshotChildren() {
    this.historyChildren = this.cloneChildren()
    this.unLogedChildrenIds.clear()
  }
}

export default Stay

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
import { Point, Root, Shape } from "../shapes"
// import { Point } from "../shapes/point"
// import { Root } from "../shapes/root"
import { EventProps, StayAction, StayEventMap, StayEventProps } from "../types"
import {
  ALLSTATE,
  DEFAULTSTATE,
  DRAW_ACTIONS,
  MOUSE_EVENTS,
  ROOTNAME,
  SORT_CHILDREN_METHODS,
  SUPPORT_OPRATOR,
} from "../userConstants"
import {
  ActionCallbackProps,
  ActionEvent,
  createChildProps,
  Dict,
  getContainPointChildrenProps,
  ListenerProps,
  SimplePoint,
  SortChildrenMethodsValues,
  StayTools,
  updateChildProps,
} from "../userTypes"
import { assert, infixExpressionParser, parseLayer, uuid4 } from "../utils"
import { StayChild } from "./stayChild"
import { StackItem, StepProps } from "./types"

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
  tools!: StayTools
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
    this.tools = this.getTools()
    this.drawLayers = this.root.layers.map(() => ({
      forceUpdate: false,
    }))

    this.initEvents()
    this.startRender()
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

  draw(forceUpdate = false, now = Date.now()) {
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
        child.shape._draw({
          context,
          canvas,
          now,
        })
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
  getTools(): StayTools {
    return {
      forceUpdateCanvas: () => {
        // this.draw(true)
      },
      hasChild: (id: string) => {
        return this.getChildren().has(id)
      },
      createChild: <T extends Shape>({
        id,
        shape,
        zIndex,
        className,
        layer = -1,
      }: createChildProps<T>) => {
        // if (layer === -1) {
        //   layer = this.root.layers.length - 1
        // }
        layer = parseLayer(this.root.layers, layer)
        this.checkName(className, [ROOTNAME])
        const child = new StayChild({
          id,
          zIndex: zIndex === undefined ? 1 : zIndex,
          className,
          layer,
          shape,
          drawAction: DRAW_ACTIONS.APPEND,
        })
        return child
      },
      appendChild: <T extends Shape>({
        shape,
        className,
        zIndex,
        id = undefined,
        layer = -1,
      }: createChildProps<T>) => {
        layer = parseLayer(this.root.layers, layer)
        const child = this.tools.createChild({
          id,
          shape,
          zIndex,
          className,
          layer,
        })
        this.zIndexUpdated = true
        this.pushToChildren(child)
        this.unLogedChildrenIds.add(child.id)
        return child
      },
      updateChild: ({ child, zIndex, shape, className, layer }: updateChildProps) => {
        if (className === "") {
          throw new Error("className cannot be empty")
        }

        if (zIndex === undefined) {
          zIndex = child.zIndex
        }
        if (zIndex !== child.zIndex) {
          this.zIndexUpdated = true
        }
        layer = parseLayer(this.root.layers, layer)
        child.update({
          shape,
          zIndex: zIndex,
          layer,
          className,
        })
        this.unLogedChildrenIds.add(child.id)
        return child
      },
      removeChild: (childId: string) => {
        const child = this.getChildById(childId)
        if (!child) return false
        this.drawLayers[child.layer].forceUpdate = true
        this.removeChildById(child.id)
        this.unLogedChildrenIds.add(child.id)
      },
      getChildrenBySelector: (
        selector: string,
        sortBy = SORT_CHILDREN_METHODS.AREA_ASC
      ): StayChild[] => {
        const children = infixExpressionParser<StayChild>({
          selector,
          fullSet: [...this.getChildren().values()],
          elemntEqualFunc: (a: StayChild, b: StayChild) => a.id === b.id,
          selectorConvertFunc: (s: string) => this.findBySimpleSelector(s),
        })

        const sortMap = new Map<SortChildrenMethodsValues, [string, 1 | -1]>([
          [SORT_CHILDREN_METHODS.AREA_ASC, ["area", 1]],
          [SORT_CHILDREN_METHODS.AREA_DESC, ["area", -1]],
          [SORT_CHILDREN_METHODS.X_ASC, ["x", 1]],
          [SORT_CHILDREN_METHODS.X_DESC, ["x", -1]],
          [SORT_CHILDREN_METHODS.Y_ASC, ["y", 1]],
          [SORT_CHILDREN_METHODS.Y_DESC, ["y", -1]],
          [SORT_CHILDREN_METHODS.WIDTH_ASC, ["width", 1]],
          [SORT_CHILDREN_METHODS.WIDTH_DESC, ["width", -1]],
          [SORT_CHILDREN_METHODS.HEIGHT_ASC, ["height", 1]],
          [SORT_CHILDREN_METHODS.HEIGHT_DESC, ["height", -1]],
        ])

        if (sortBy) {
          if (typeof sortBy === "function") {
            children.sort(sortBy)
          } else {
            const [sortKey, sortOrder] = sortMap.get(sortBy) || []
            if (sortKey && sortOrder) {
              children.sort((a, b) => {
                const sortValue1 = (a.shape as any)[sortKey]
                const sortValue2 = (b.shape as any)[sortKey]
                return (sortValue1 - sortValue2) * sortOrder
              })
            }
          }
        }

        return children
      },
      getAvailiableStates: (selector: string): string[] => {
        const stateSelectors = selector
          .split(new RegExp(`([${Object.values(SUPPORT_OPRATOR).join("")}])`))
          .map((s) => (s === ALLSTATE ? `(${[...this.stateSet].join(SUPPORT_OPRATOR.OR)})` : s))
          .join("")
        try {
          return infixExpressionParser<string>({
            selector: stateSelectors,
            fullSet: [...this.stateSet],
            elemntEqualFunc: (a: string, b: string) => a === b,
            selectorConvertFunc: (s: string) => [s],
          })
        } catch (e) {
          throw new Error(
            "please check your selector, support oprators: " +
              Object.values(SUPPORT_OPRATOR).join(",") +
              "here is your selector: " +
              selector
          )
        }
      },
      getContainPointChildren: ({
        point,
        selector,
        sortBy,
        returnFirst = false,
      }: getContainPointChildrenProps): StayChild[] => {
        let _selector = selector

        if (selector && Array.isArray(selector)) {
          _selector = selector.join("|")
        }

        assert(_selector, "no className or id")
        const selectorChildren = this.tools.getChildrenBySelector(_selector as string, sortBy)

        const hitChildren: StayChild[] = selectorChildren.filter((c) =>
          c.shape.contains(point, this.root.contexts[c.layer])
        )

        return returnFirst && hitChildren.length > 0 ? [hitChildren[0]] : hitChildren
      },
      changeCursor: (cursor: string) => {
        this.root.layers[this.root.layers.length - 1].style.cursor = cursor
      },
      fix: () => {
        this.getChildren().forEach((child) => {
          if (child.layer !== 0) {
            child.beforeLayer = child.layer
            child.layer = 0
            child.drawAction = DRAW_ACTIONS.UPDATE
          }
        })
      },
      switchState: (state: string) => {
        this.checkName(state, [ALLSTATE])
        if (!this.stateSet.has(state)) {
          this.stateSet.add(state)
        }
        this.state = state
        this.stateStore.clear()
      },
      log: () => {
        const steps = [...this.unLogedChildrenIds]
          .map((id) => StayChild.diff(this.historyChildren.get(id), this.getChildById(id)))
          .filter((o) => o) as StepProps[]
        this.pushToStack({
          state: this.state,
          steps,
        })
        this.snapshotChildren()
      },
      moveStart: () => {
        this.getChildren().forEach((child) => {
          child.shape.moveInit()
        })
      },

      move: (offsetX: number, offsetY: number) => {
        this.getChildren().forEach((child) => {
          child.shape.move(...child.shape._move(offsetX, offsetY))
        })
        this.root.layers.forEach((_, i) => {
          this.forceUpdateLayer(i)
        })
      },
      zoom: (deltaY: number, center: SimplePoint) => {
        this.getChildren().forEach((child) => {
          child.shape.zoom(child.shape._zoom(deltaY, center))
        })
        this.root.layers.forEach((_, i) => {
          this.forceUpdateLayer(i)
        })
      },
      forward: () => {
        console.log("forward")
        if (this.stackIndex >= this.stack.length) {
          console.log("no more operations")
          return
        }
        const stepItem = this.stack[this.stackIndex]
        this.root.layers.forEach((_, i) => {
          this.forceUpdateLayer(i)
        })

        stepItem.steps.forEach((step) => {
          const stepChild = step.child
          if (step.action === "append") {
            this.tools.appendChild({
              id: stepChild.id,
              shape: stepChild.shape.copy(),
              className: stepChild.className,
            })
          } else if (step.action === "remove") {
            this.tools.removeChild(stepChild.id)
          } else if (step.action === "update") {
            assert(stepChild.beforeShape)
            const child = this.findChildById(stepChild.id)!
            this.tools.updateChild({
              child,
              shape: stepChild.shape.copy(),
            })
          }
        })

        this.tools.switchState(stepItem.state)
        this.snapshotChildren()
        this.stackIndex++
      },

      backward: () => {
        console.log("backward")
        if (this.stackIndex <= 0) {
          console.log("no more operations")
          return
        }
        this.stackIndex--
        this.root.layers.forEach((_, i) => {
          this.forceUpdateLayer(i)
        })
        const stepItem = this.stack[this.stackIndex]

        stepItem.steps.forEach((step) => {
          const stepChild = step.child

          if (step.action === "append") {
            this.tools.removeChild(stepChild.id)
          } else if (step.action === "remove") {
            this.tools.appendChild({
              id: stepChild.id,
              shape: stepChild.shape.copy(),
              className: stepChild.className,
            })
          } else if (step.action === "update") {
            assert(stepChild.beforeShape)

            this.tools.updateChild({
              child: this.getChildById(stepChild.id)!,
              className: stepChild.beforeName || stepChild.className,
              shape: stepChild.beforeShape!.copy(),
            })
          }
        })
        this.tools.switchState(stepItem.state)
        this.snapshotChildren()
      },
      triggerAction: (
        originEvent: Event,
        triggerEvents: { [key: string]: ActionEvent },
        payload: Dict
      ) => {
        const isMouseEvent = originEvent instanceof MouseEvent
        interface CallBackType {
          callback: (p: ActionCallbackProps) => any
          e: ActionEvent
          name: string
        }
        let needUpdate = false
        const callbackList: CallBackType[] = []
        this.listeners.forEach(({ name, event, state, selector, sortBy, callback }) => {
          if (!(name in this.composeStore)) {
            this.composeStore[name] = {}
          }
          event.forEach((actionEventName) => {
            const avaliableSet = this.tools.getAvailiableStates(state || DEFAULTSTATE)
            if (!avaliableSet.includes(this.state) || !(actionEventName in triggerEvents)) {
              return false
            }

            const actionEvent = triggerEvents[actionEventName]

            if (isMouseEvent) {
              const child = this.tools.getContainPointChildren({
                point: actionEvent.point,
                selector: selector,
                sortBy: sortBy,
              })

              if (child.length === 0) return false
              actionEvent.target = child[0] as StayChild
            }

            needUpdate = true
            callbackList.push({
              callback,
              e: actionEvent,
              name,
            })
            if (callback) {
              const linkArgs = callback({
                originEvent,
                e: actionEvent,
                store: this.store,
                stateStore: this.stateStore,
                composeStore: this.composeStore[name],
                tools: this.getTools(),
                canvas: this.root,
                payload,
              })
              this.composeStore[name] = {
                ...this.composeStore[name],
                ...(linkArgs || {}),
              }
            }
          })
        })

        // if (needUpdate) {
        //   this.draw()
        // }
      },
      deleteListener: (name: string) => {
        if (this.listeners.has(name)) {
          this.listeners.delete(name)
        }
      },
    }
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
    child.shape.startTime = Date.now()
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

  startRender() {
    this.draw(true, Date.now())
    window.requestAnimationFrame(this.startRender.bind(this))
  }
}

export default Stay

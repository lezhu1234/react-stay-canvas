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
  mouseup,
  wheel,
} from "../rawEvents"
import { Point, Rectangle, Root } from "../shapes"
import { InstantShape } from "../shapes/instantShape"
// import { Point } from "../shapes/point"
// import { Root } from "../shapes/root"
import { EventProps, StayEventMap, StayEventProps } from "../types"
import { ALLSTATE, DEFAULTSTATE, MOUSE_EVENTS, ROOTNAME, SUPPORT_OPRATOR } from "../userConstants"
import {
  ActionCallbackProps,
  ActionEvent,
  Area,
  Dict,
  getContainPointChildrenProps,
  ListenerNamePayloadPair,
  ListenerProps,
  PointType,
  PredefinedMouseEventName,
  PredefinedWheelEventName,
  SelectorFunc,
  StayDrawProps,
  StayMode,
  StayTools,
  updateChildProps,
} from "../userTypes"
import { assert, infixExpressionParser, numberAlmostEqual, parseLayer, uuid4 } from "../utils"

import { StayInstantChild } from "./child/stayInstantChild"
import { SetShapeChildCurrentTime, StackItem, StepProps } from "./types"

interface drawLayer {
  forceUpdate: boolean
}

class Stay<EventName extends string> {
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
  tools!: StayTools
  unLogedChildrenIds: Set<string>
  width: number
  x: number
  y: number
  zIndexUpdated: boolean
  rootChild: StayInstantChild<Root>
  passive: boolean
  nextTickFunctions: (() => void)[]
  mode: StayMode
  rootId: string

  constructor(root: Canvas, passive: boolean, mode: StayMode = "instant") {
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
    this.zIndexUpdated = false
    this.tools = this.getTools()
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
      // child.setCurrentTime(props)
    })
  }
  draw({
    forceDraw = false,
    now = Date.now(),
    beforeDrawCallback,
    afterDrawCallback,
  }: StayDrawProps) {
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

    if (beforeDrawCallback) {
      beforeDrawCallback()
    }

    for (let layerIndex = 0; layerIndex < childrenInlayer.length; layerIndex++) {
      const { updateCurrentLayer } = childrenInlayer[layerIndex]

      const canvas = this.root.layers[layerIndex]
      const context = this.root.contexts[layerIndex]

      if (updateCurrentLayer) {
        this.root.clear(context)
      }

      let layerDrawShapes: InstantShape[] = []

      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        layerDrawShapes.push(...child.getShapes(layerIndex))
        child.layerDraw(layerIndex)
      }

      layerDrawShapes = layerDrawShapes.sort((shape) => shape.zIndex)

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

    this.zIndexUpdated = false

    // run next tick function
    requestIdleCallback(
      (idle) => {
        while (this.nextTickFunctions.length > 0 && (idle.timeRemaining() > 0 || idle.didTimeout)) {
          const fn = this.nextTickFunctions.shift()
          if (fn) fn()
        }
      },
      { timeout: 1000 }
    )
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

  fireEvent(e: KeyboardEvent | MouseEvent | WheelEvent | DragEvent, trigger: string) {
    const isMouseEvent = e instanceof MouseEvent
    const triggerEvents: { [key: string]: ActionEvent<EventName> } = {}
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
        triggerEvents[eventName] = actionEvent
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
  getTools(): StayTools {
    return {
      // timelineChild: ({ timeline, shape, layer, id = undefined, zIndex, className }) => {
      //   layer = parseLayer(this.root.layers, layer)
      //   this.checkName(className, [ROOTNAME])
      //   const child = StayChild.timeline({
      //     shape,
      //     timeline,
      //     id,
      //     zIndex: zIndex === undefined ? 1 : zIndex,
      //     className,
      //     drawAction: DRAW_ACTIONS.APPEND,
      //     afterRefresh: (fn) => this.nextTick(fn),
      //   })
      //   this.zIndexUpdated = true
      //   this.pushToChildren(child)
      //   this.unLogedChildrenIds.add(child.id)
      //   return child
      // },

      // start: () => {
      //   if (this.autoRender) {
      //     throw new Error("autoRender is true, you can't call start")
      //   }

      //   this.rendering = true

      //   this.render()
      // },
      progress: ({ time, bound, beforeDrawCallback, afterDrawCallback }) => {
        if (this.mode === "instant") {
          throw new Error(
            "Instant Mode: you can't call progress, you need to switch to animated mode"
          )
        }
        this.updateChildrenTime({ time, bound })
        this.draw({
          forceDraw: true,
          now: Date.now(),
          beforeDrawCallback,
          afterDrawCallback,
        })
      },
      refresh: () => {
        this.draw({
          forceDraw: true,
          now: Date.now(),
        })
      },
      hasChild: (id: string) => {
        return this.getChildren().has(id)
      },
      createChild: ({ id, shape, className }) => {
        this.checkName(className, [ROOTNAME])
        const child = new StayInstantChild({
          id,
          className,
          shape,
          canvas: this.root,
        })
        return child
      },
      appendChild: ({ shape, className, id = undefined }) => {
        const child = this.tools.createChild({
          id,
          shape,
          className,
        })
        this.zIndexUpdated = true
        this.pushToChildren(child)
        this.unLogedChildrenIds.add(child.id)
        return child
      },
      updateChild: ({ child, shape, className }: updateChildProps) => {
        if (className === "") {
          throw new Error("className cannot be empty")
        }
        child.update({
          shape,
          className,
        })
        this.unLogedChildrenIds.add(child.id)
        return child
      },
      removeChild: (childId: string): Promise<void> | void => {
        if (childId === this.rootChild.id) {
          throw new Error("root cannot be removed")
        }
        const child = this.getChildById(childId)
        if (!child) return
        this.removeChildById(child.id)
        this.unLogedChildrenIds.add(child.id)
        return new Promise<void>((resolve) => {
          this.nextTick(resolve)
        })
      },

      getChildrenWithoutRoot: () => {
        return [...this.getChildren().values()].filter((child) => child.id !== this.rootChild.id)
      },
      getChildById: <T extends InstantShape>(id: string): StayInstantChild<T> | undefined => {
        const child = this.getChildById(id)
        return child as StayInstantChild<T>
      },
      getChildBySelector: <T extends InstantShape>(
        selector: string | SelectorFunc
      ): StayInstantChild<T> | void => {
        const children = this.tools.getChildrenBySelector(selector)
        if (children.length !== 0) {
          return children[0] as StayInstantChild<T>
        }
      },
      getChildrenByArea: (area: Area, selector?: string | SelectorFunc) => {
        const children = this.getChildrenBySelector(selector)
        const selectedChildren: StayInstantChild[] = []
        children.forEach((child) => {
          if (child.inArea(area)) {
            selectedChildren.push(child)
          }
        })
        return selectedChildren
      },
      getChildrenBySelector: (selector: string | SelectorFunc, sortBy): StayInstantChild[] => {
        const children = this.getChildrenBySelector(selector)

        if (sortBy) {
          children.sort(sortBy)
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
        withRoot = true,
      }: getContainPointChildrenProps): StayInstantChild[] => {
        let _selector = selector

        if (selector && Array.isArray(selector)) {
          _selector = selector.join("|")
        }

        assert(_selector, "no className or id")
        const selectorChildren = this.tools.getChildrenBySelector(_selector as string, sortBy)

        let hitChildren: StayInstantChild[] = selectorChildren.filter((c) =>
          c.containsPointer(point)
        )

        if (!withRoot) {
          hitChildren = hitChildren.filter((c) => c.id !== this.rootId)
        }

        return returnFirst && hitChildren.length > 0 ? [hitChildren[0]] : hitChildren
      },
      changeCursor: (cursor: string) => {
        this.root.layers[this.root.layers.length - 1].style.cursor = cursor
      },
      fix: () => {
        //deprecated
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
          .map((id) => StayInstantChild.diff(this.historyChildren.get(id), this.getChildById(id)))
          .filter((o) => o) as StepProps[]
        this.pushToStack({
          state: this.state,
          steps,
        })
        this.snapshotChildren()
      },
      moveStart: () => {
        this.getChildren().forEach((child) => {
          child.moveInit()
        })
      },

      move: (
        offsetX: number,
        offsetY: number,
        filter: (child: StayInstantChild) => boolean = () => true
      ): Promise<void> => {
        this.getChildren().forEach((child) => {
          if (child.id !== this.rootId && !filter(child)) {
            return
          }
          child.move(offsetX, offsetY)
        })
        this.root.layers.forEach((_, i) => {
          this.forceUpdateLayer(i)
        })
        return new Promise<void>((resolve) => {
          this.nextTick(resolve)
        })
      },
      zoom: (
        deltaY: number,
        center: PointType,
        filter: (child: StayInstantChild) => boolean = () => true
      ): Promise<void> => {
        this.getChildren().forEach((child) => {
          if (child.id !== this.rootId && !filter(child)) {
            return
          }
          child.zoom(deltaY, center)
        })
        this.root.layers.forEach((_, i) => {
          this.forceUpdateLayer(i)
        })
        return new Promise<void>((resolve) => {
          this.nextTick(resolve)
        })
      },
      reset: (): Promise<void> => {
        const rootChildShape = this.rootChild.getShape() as Rectangle
        const [offsetX, offsetY] = [-rootChildShape.leftTop.x, -rootChildShape.leftTop.y]

        const scale = this.width / rootChildShape.width
        this.getChildren().forEach((child) => {
          child.move(offsetX, offsetY)
          child.zoom((scale - 1) * -1000, { x: 0, y: 0 })
        })
        this.root.layers.forEach((_, i) => {
          this.forceUpdateLayer(i)
        })
        return new Promise<void>((resolve) => {
          this.nextTick(resolve)
        })
      },
      exportChildren: ({ children, area }) => {
        const rootChildShape = this.rootChild.getShape() as Rectangle
        area = area ?? { x: 0, y: 0, width: rootChildShape.width, height: rootChildShape.height }
        children = children.map((child) => child.copy())

        return { children, area }
      },
      importChildren: ({ children, area }, targetArea) => {
        const rootChildShape = this.rootChild.getShape() as Rectangle
        targetArea = targetArea ?? {
          x: 0,
          y: 0,
          width: rootChildShape.width,
          height: rootChildShape.height,
        }

        assert(
          numberAlmostEqual(targetArea.width / area.width, targetArea.height / area.height),
          "area not match"
        )

        const [offsetX, offsetY] = [targetArea.x - area.x, targetArea.y - area.y]
        const scale = targetArea.width / area.width

        children.forEach((child) => {
          child.move(offsetX, offsetY)
          child.zoom((scale - 1) * -1000, { x: targetArea.x, y: targetArea.y })
          this.tools.appendChild({
            shape: child.copyShapeMap(),
            className: child.className,
          })
        })
      },
      regionToTargetCanvas: ({ area, targetArea, children, progress }) => {
        targetArea = targetArea ?? {
          x: 0,
          y: 0,
          width: area.width,
          height: area.height,
        }
        const [offsetX, offsetY] = [targetArea.x - area.x, targetArea.y - area.y]
        const scale = targetArea.width / area.width

        const tempCanvas = document.createElement("canvas")
        tempCanvas.width = targetArea.width
        tempCanvas.height = targetArea.height
        const tempCtx = tempCanvas.getContext("2d")
        if (!tempCtx) {
          throw new Error("Unable to get 2D context")
        }

        const childrenReady = Promise.all(
          children.map(async (c) => {
            // if (progress) {
            //   c.setCurrentTime({ time: progress })
            // }
            // await c.draw({
            //   props: {
            //     context: tempCtx,
            //     now: Date.now(),
            //     width: this.width,
            //     height: this.height,
            //   },
            //   extraTransform: {
            //     offsetX,
            //     offsetY,
            //     zoom: (scale - 1) * -1000,
            //     zoomCenter: { x: targetArea.x, y: targetArea.y },
            //   },
            // })
          })
        )

        return new Promise((resolve) => {
          childrenReady.then(() => {
            resolve(tempCanvas)
          })
        })
      },
      redo: () => {
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
              shape: stepChild.shape,
              className: stepChild.className,
            })
          } else if (step.action === "remove") {
            this.tools.removeChild(stepChild.id)
          } else if (step.action === "update") {
            assert(stepChild.beforeShape)
            const child = this.findChildById(stepChild.id)!
            this.tools.updateChild({
              child,
              shape: stepChild.shape,
            })
          }
        })

        this.tools.switchState(stepItem.state)
        this.snapshotChildren()
        this.stackIndex++
      },

      undo: () => {
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
              shape: stepChild.shape,
              className: stepChild.className,
            })
          } else if (step.action === "update") {
            assert(stepChild.beforeShape)

            this.tools.updateChild({
              child: this.getChildById(stepChild.id)!,
              className: stepChild.beforeName || stepChild.className,
              shape: stepChild.beforeShape!,
            })
          }
        })
        this.tools.switchState(stepItem.state)
        this.snapshotChildren()
      },
      triggerAction: (
        originEvent: Event,
        triggerEvents: { [key: string]: ActionEvent<EventName> },
        payload: Dict
      ) => {
        const isMouseEvent = originEvent instanceof MouseEvent
        interface CallBackType {
          callback:
            | ((p: ActionCallbackProps<Dict<any>, EventName>) => any)
            | Promise<(p: ActionCallbackProps<Dict<any>, EventName>) => any>
          e: ActionEvent<EventName>
          name: string
        }
        // let needUpdate = false
        const callbackList: CallBackType[] = []
        this.listeners.forEach(({ name, event, state, selector, sortBy, callback }) => {
          if (!(name in this.composeStore)) {
            this.composeStore[name] = {}
          }

          if (!Array.isArray(event)) {
            event = [event]
          }

          event.forEach(async (actionEventName) => {
            const avaliableSet = this.tools.getAvailiableStates(state || DEFAULTSTATE)
            if (!avaliableSet.includes(this.state) || !(actionEventName in triggerEvents)) {
              return false
            }

            const actionEvent = triggerEvents[actionEventName]

            if (isMouseEvent) {
              const _actionEvent = actionEvent as ActionEvent<PredefinedMouseEventName>

              const children = this.tools.getContainPointChildren({
                point: _actionEvent.point,
                selector: selector,
                sortBy: sortBy,
              })

              // 特殊处理 mouseleave 事件
              if (actionEventName === "mouseleave") {
                _actionEvent.target = this.rootChild
              } else {
                if (children.length === 0) {
                  return false
                }
                _actionEvent.target = children[0] as StayInstantChild
              }
            }

            // needUpdate = true
            callbackList.push({
              callback,
              e: actionEvent,
              name,
            })

            if (callback) {
              const eventFuncMap = await callback({
                originEvent,
                e: actionEvent,
                store: this.store,
                stateStore: this.stateStore,
                composeStore: this.composeStore[name],
                tools: this.getTools(),
                canvas: this.root,
                payload,
              })

              if (eventFuncMap !== undefined && actionEvent.name in eventFuncMap) {
                // TODO: type
                const particalComposeStore = (eventFuncMap as any)[actionEvent.name]()
                this.composeStore[name] = {
                  ...this.composeStore[name],
                  ...particalComposeStore,
                }
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

  registerEvent({ name, trigger, conditionCallback, successCallback }: EventProps<EventName>) {
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

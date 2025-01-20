import { AnimatedShape } from "../shapes/animatedShape"
import { InstantShape } from "../shapes/instantShape"
import { Rectangle } from "../shapes/rectangle"
import { UserCallback } from "../types"
import { ALLSTATE, DEFAULTSTATE, SUPPORT_OPRATOR } from "../userConstants"
import {
  ActionCallbackProps,
  ActionEvent,
  AnimatedTools,
  Area,
  ChildSortFunction,
  Dict,
  ExportChildrenProps,
  getContainPointChildrenProps,
  ImportChildrenProps,
  InstantMode,
  InstantTools,
  PointType,
  PredefinedMouseEventName,
  ProgressProps,
  RegionToTargetCanvasProps,
  SelectorFunc,
  StayMode,
  BasicTools,
  StayTools,
  AnimatedMode,
  AppendChildProps,
  CreateChildProps,
  Cursor,
  TriggerEvents,
} from "../userTypes"
import { assert, infixExpressionParser, isStayAnimatedChild, numberAlmostEqual } from "../utils"
import { StayAnimatedChild } from "./child/stayAnimatedChild"
import { StayInstantChild } from "./child/stayInstantChild"
import Stay from "./stay"
import { StepProps } from "./types"

export function isInstantMode(mode: StayMode): mode is InstantMode {
  return mode === "instant"
}

export function stayTools(
  this: Stay<any, InstantMode>,
  mode: InstantMode
): InstantTools & BasicTools
export function stayTools(
  this: Stay<any, AnimatedMode>,
  mode: AnimatedMode
): AnimatedTools & BasicTools
export function stayTools(this: Stay<any, StayMode>, mode: StayMode): StayTools<StayMode>

export function stayTools<Mode extends StayMode>(
  this: Stay<any, Mode>,
  mode: Mode
): StayTools<StayMode> {
  const animatedTools = {
    progress: ({ timeMs: time, bound, beforeDrawCallback, afterDrawCallback }: ProgressProps) => {
      if (this.mode === "instant") {
        throw new Error(
          "Instant Mode: you can't call progress, you need to switch to animated mode"
        )
      }
      this.updateChildrenTime({ time, bound })
      return this.draw({
        forceDraw: true,
        now: Date.now(),
        beforeDrawCallback,
        afterDrawCallback,
      })
    },
    createChild: ({ id, className }: CreateChildProps) => {
      let child = new StayAnimatedChild({
        id,
        className,
        canvas: this.root,
      })
      const childProxy = new Proxy(child, {
        set: (target, prop, value) => {
          if (prop === "update") {
            target.update(value)
            this.unLogedChildrenIds.add(child.id)
          }
          return Reflect.set(target, prop, value)
        },
      })

      this.pushToChildren(childProxy)
      this.unLogedChildrenIds.add(childProxy.id)

      return childProxy
    },
  }

  const instantTools = {
    // appendChild: ({ id, className, shape }: AppendChildProps<InstantShape>) => {
    //   let child = new StayInstantChild({
    //     id,
    //     className,
    //     shape,
    //     canvas: this.root,
    //   })
    //   const childProxy = new Proxy(child, {
    //     set: (target, prop, value) => {
    //       if (prop === "update") {
    //         target.update(value)
    //         this.unLogedChildrenIds.add(child.id)
    //       }
    //       return Reflect.set(target, prop, value)
    //     },
    //   })

    //   this.pushToChildren(childProxy)
    //   this.unLogedChildrenIds.add(childProxy.id)

    //   return childProxy
    // },
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
          ;(this.tools as StayTools<"instant">).appendChild({
            id: stepChild.id,
            shape: stepChild.shape,
            className: stepChild.className,
          })
        } else if (step.action === "remove") {
          this.tools.removeChild(stepChild.id)
        } else if (step.action === "update") {
          assert(stepChild.beforeShape)
          const child = this.findChildById(stepChild.id)!

          child.update({ shape: stepChild.shape })
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
          ;(this.tools as StayTools<"instant">).appendChild({
            id: stepChild.id,
            shape: stepChild.shape,
            className: stepChild.className,
          })
        } else if (step.action === "update") {
          assert(stepChild.beforeShape)

          this.getChildById(stepChild.id)!.update({
            className: stepChild.beforeName || stepChild.className,
            shape: stepChild.beforeShape!,
          })
          // this.tools.updateChild({
          //   child: this.getChildById(stepChild.id)!,
          //   className: stepChild.beforeName || stepChild.className,
          //   shape: stepChild.beforeShape!,
          // })
        }
      })
      this.tools.switchState(stepItem.state)
      this.snapshotChildren()
    },
  }

  const stayTools = {
    refresh: () => {
      this.draw({
        forceDraw: true,
        now: Date.now(),
      })
    },
    appendChild: ({ id, className, shape }: AppendChildProps<InstantShape>) => {
      let child = new StayInstantChild({
        id,
        className,
        shape,
        canvas: this.root,
      })
      const childProxy = new Proxy(child, {
        set: (target, prop, value) => {
          if (prop === "update") {
            target.update(value)
            this.unLogedChildrenIds.add(child.id)
          }
          return Reflect.set(target, prop, value)
        },
      })

      this.pushToChildren(childProxy)
      this.unLogedChildrenIds.add(childProxy.id)

      return childProxy
    },
    hasChild: (id: string) => {
      return this.getChildren().has(id)
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
    getChildrenBySelector: (
      selector: string | SelectorFunc,
      sortBy?: ChildSortFunction
    ): StayInstantChild[] => {
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
      const selectorChildren = this.tools.getChildrenBySelector(
        _selector as string | SelectorFunc,
        sortBy
      )

      let hitChildren: StayInstantChild[] = selectorChildren.filter((c: StayInstantChild) =>
        c.containsPointer(point)
      )

      if (!withRoot) {
        hitChildren = hitChildren.filter((c) => c.id !== this.rootId)
      }

      return returnFirst && hitChildren.length > 0 ? [hitChildren[0]] : hitChildren
    },
    changeCursor: (cursor: Cursor) => {
      this.root.layers[this.root.layers.length - 1].style.cursor = cursor
    },
    switchState: (state: string) => {
      this.checkName(state, [ALLSTATE])
      if (!this.stateSet.has(state)) {
        this.stateSet.add(state)
      }
      this.state = state
      this.stateStore.clear()
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
    exportChildren: ({ children, area }: ImportChildrenProps) => {
      const rootChildShape = this.rootChild.getShape() as Rectangle
      area = area ?? { x: 0, y: 0, width: rootChildShape.width, height: rootChildShape.height }
      children = children.map((child) => child.copy())

      return { children, area }
    },
    importChildren: ({ children, area }: ExportChildrenProps, targetArea?: Area) => {
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
        ;(this.tools as StayTools<"instant">).appendChild({
          shape: child.copyShapeMap(),
          className: child.className,
        })
      })
    },
    regionToTargetCanvas: ({
      area,
      targetSize,
      children,
      progress,
    }: RegionToTargetCanvasProps): Promise<HTMLCanvasElement> => {
      targetSize = targetSize ?? {
        width: area.width,
        height: area.height,
      }
      const [offsetX, offsetY] = [-area.x, -area.y]
      const scale = targetSize.width / area.width

      this.tools.move(offsetX, offsetY)
      this.tools.zoom((scale - 1) * -1000, {
        x: 0,
        y: 0,
      })

      const tempCanvas = document.createElement("canvas")
      tempCanvas.width = targetSize.width
      tempCanvas.height = targetSize.height
      const tempCtx = tempCanvas.getContext("2d")
      if (!tempCtx) {
        throw new Error("Unable to get 2D context")
      }

      //   props: {
      let shapes: InstantShape[] = []
      const layerNumber = this.root.layers.length

      const childrenReady = Promise.all(
        children.map(async (c) => {
          if (progress && isStayAnimatedChild(c)) {
            c.setCurrentTime({ time: progress })
          }
          for (let layerIndex = 0; layerIndex < layerNumber; layerIndex++) {
            shapes.push(...c.getShapes(layerIndex))
          }

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
          shapes.sort((s1, s2) => s1.zIndex - s2.zIndex)
          shapes.sort((s1, s2) => s1.layer - s2.layer)
          shapes.forEach((shape) => {
            shape.draw({
              context: tempCtx,
              now: Date.now(),
              width: tempCanvas.width,
              height: tempCanvas.height,
              forchDraw: true,
            })
          })

          this.tools.zoom((1 / scale - 1) * -1000, {
            x: 0,
            y: 0,
          })
          this.tools.move(-offsetX, -offsetY)

          resolve(tempCanvas)
        })
      })
    },
    triggerAction: <T extends string>(
      originEvent: Event,
      triggerEvents: TriggerEvents<T>,
      payload: Dict
    ): void => {
      const isMouseEvent = originEvent instanceof MouseEvent
      interface CallBackType {
        callback: UserCallback<any, any, Mode>
        e: ActionEvent<T>
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

        event.forEach(async (actionEventName: string) => {
          const avaliableSet = this.tools.getAvailiableStates(state || DEFAULTSTATE)

          if (!avaliableSet.includes(this.state) || !(actionEventName in triggerEvents)) {
            return false
          }

          const { info: actionEvent, event: preEvent } = triggerEvents[actionEventName]

          if (isMouseEvent) {
            const _actionEvent = actionEvent as ActionEvent<PredefinedMouseEventName>
            if (preEvent.withTargetConditionCallback) {
              const children = this.tools.getChildrenBySelector(selector)
              let flag = false
              for (let index = 0; index < children.length; index++) {
                const child = children[index]

                if (
                  preEvent.withTargetConditionCallback({
                    e: _actionEvent as any,
                    store: this.store,
                    stateStore: this.stateStore,
                    target: child,
                  })
                ) {
                  _actionEvent.target = child
                  flag = true
                  break
                }
              }

              if (!flag) {
                return false
              }
            } else {
              const children = this.tools.getContainPointChildren({
                point: _actionEvent.point,
                selector: selector,
                sortBy: sortBy,
              })

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
              //@ts-ignore cannot understand
              e: actionEvent,
              store: this.store,
              stateStore: this.stateStore,
              composeStore: this.composeStore[name],
              tools: this.getTools() as any,
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

  return {
    ...stayTools,
    ...(isInstantMode(mode) ? instantTools : animatedTools),
  } as any
}

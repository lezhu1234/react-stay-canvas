import { AnimatedShape } from "../shapes/animatedShape"
import { InstantShape } from "../shapes/instantShape"
import { Rectangle } from "../shapes/rectangle"
import { ALLSTATE, SUPPORT_OPRATOR } from "../userConstants"
import type { ProgressProps } from "../types/animation"
import type {
  AppendChildProps,
  ChildSortFunction,
  CreateChildProps,
  CaptureSceneProps,
  getContainPointChildrenProps,
  SceneFragment,
  RegionToTargetCanvasProps,
  SelectorFunc,
} from "../types/children"
import type { Dict } from "../types/common"
import type { ManualTriggerEvents } from "../types/manualActions"
import type { Area, PointType } from "../types/geometry"
import type { Cursor, StayTools } from "../types/tools"
import { assert } from "../utils/assertions"
import { numberAlmostEqual } from "../utils/geometry"
import { infixExpressionParser } from "../utils/selectors"
import { StayAnimatedChild } from "./children/stayAnimatedChild"
import { StayInstantChild } from "./children/stayInstantChild"
import {
  captureHistoryChild,
  diffHistoryChild,
  materializeHistoryShapes,
} from "./historySnapshot"
import { captureScene, materializeSceneChild } from "./sceneTransfer"
import { normalizeManualActions } from "./events/input/manualActionAdapter"
import Stay from "./stay"
import { StepProps } from "./types"

// One factory, one unified tool surface. Every stage gets all tools.
export function stayTools(this: Stay<any>): StayTools {
  const animatedTools = {
    progress: ({ timeMs: time, bound, beforeDrawCallback, afterDrawCallback }: ProgressProps) => {
      this.updateChildrenTime({ time, bound })
      this.forceUpdateAllLayers()
      return this.draw({
        now: Date.now(),
        beforeDrawCallback,
        afterDrawCallback,
      })
    },
    createChild: ({ id, className }: CreateChildProps) => {
      const child = new StayAnimatedChild({
        id,
        className,
        canvas: this.root,
      })
      this.pushToChildren(child)
      // A timeline is not a static undo/redo state. History captures only
      // children whose participatesInHistory contract opts in.
      return child
    },
  }

  const instantTools = {
    // appendChild: ({ id, className, shape }: AppendChildProps<InstantShape>) => {
    //   const child = new StayInstantChild({
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
        // A removed child is absent from the store, so it remains eligible here;
        // its prior snapshot determines the remove step.
        .filter((id) => this.getChildById(id)?.participatesInHistory ?? true)
        .map((id) => {
          const child = this.getChildById(id)
          return diffHistoryChild(
            this.historyChildren.get(id),
            child?.participatesInHistory ? captureHistoryChild(child) : undefined
          )
        })
        .filter((o) => o) as StepProps[]
      if (steps.length === 0) {
        this.snapshotChildren()
        return
      }
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
          this.tools.appendChild({
            id: stepChild.id,
            shape: materializeHistoryShapes(stepChild.shape),
            className: stepChild.className,
          })
        } else if (step.action === "remove") {
          this.tools.removeChild(stepChild.id)
        } else if (step.action === "update") {
          assert(stepChild.beforeShape)
          const child = this.findChildById(stepChild.id)!

          child.update({ shape: materializeHistoryShapes(stepChild.shape) })
        }
      })

      this.tools.switchState(stepItem.state)
      this.snapshotChildren()
      this.stackIndex++
    },

    resetHistory: () => {
      this.history.reset()
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
            shape: materializeHistoryShapes(stepChild.shape),
            className: stepChild.className,
          })
        } else if (step.action === "update") {
          if (!stepChild.beforeShape) {
            throw new Error("update history step requires beforeShape")
          }

          this.getChildById(stepChild.id)!.update({
            className: stepChild.beforeName || stepChild.className,
            shape: materializeHistoryShapes(stepChild.beforeShape),
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
      this.forceUpdateAllLayers()
      this.draw({ now: Date.now() })
    },
    appendChild: <T extends InstantShape>({ id, className, shape }: AppendChildProps<T>) => {
      const child = new StayInstantChild<T>({
        id,
        className,
        shape,
        canvas: this.root,
        onShapeChange: (childId) => this.markHistoryChildChanged(childId),
      })
      this.pushToChildren(child)
      this.unLogedChildrenIds.add(child.id)

      return child
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
      // Only history-participating children are tracked for undo/redo. `child` is
      // still the live instance here, so the check is reliable even though after
      // removal getChildById()/the degraded snapshot clone no longer could be.
      if (child.participatesInHistory) {
        this.unLogedChildrenIds.add(child.id)
      }
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
    getChildrenBySelector: <T extends InstantShape = InstantShape>(
      selector: string | SelectorFunc,
      sortBy?: ChildSortFunction
    ): StayInstantChild<T>[] => {
      const children = this.getChildrenBySelector(selector)

      if (sortBy) {
        children.sort(sortBy)
      }

      return children as StayInstantChild<T>[]
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
    getContainPointChildren: <T extends InstantShape = InstantShape>({
      point,
      selector,
      sortBy,
      returnFirst = false,
      withRoot = true,
    }: getContainPointChildrenProps): StayInstantChild<T>[] => {
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

      return (
        returnFirst && hitChildren.length > 0 ? [hitChildren[0]] : hitChildren
      ) as StayInstantChild<T>[]
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
    exportChildren: ({ children, area }: CaptureSceneProps) => {
      const rootChildShape = this.rootChild.getShape() as Rectangle
      area = area ?? { x: 0, y: 0, width: rootChildShape.width, height: rootChildShape.height }
      return captureScene(children, area)
    },
    importChildren: ({ children, area }: SceneFragment, targetArea?: Area) => {
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

      children.forEach((fragment) => {
        const importedChild = materializeSceneChild(fragment, this.root)
        importedChild.moveInit()
        importedChild.move(offsetX, offsetY)
        importedChild.zoom((scale - 1) * -1000, { x: targetArea.x, y: targetArea.y })
        this.tools.appendChild({
          id: importedChild.id,
          shape: importedChild.shapeMap,
          className: importedChild.className,
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

      const tempCanvas = document.createElement("canvas")
      tempCanvas.width = targetSize.width
      tempCanvas.height = targetSize.height
      const tempCtx = tempCanvas.getContext("2d")
      if (!tempCtx) {
        throw new Error("Unable to get 2D context")
      }

      let shapes: InstantShape[] = []
      const layerNumber = this.root.layers.length

      const childrenReady = Promise.all(
        children.map(async (c) => {
          if (progress !== undefined) {
            // no-op on static children (polymorphic), advances timeline children
            c.setCurrentTime({ time: progress })
          }
          for (let layerIndex = 0; layerIndex < layerNumber; layerIndex++) {
            shapes.push(...c.getShapes(layerIndex))
          }
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

          resolve(tempCanvas)
        })
      })
    },
    triggerAction: <T extends string>(
      originEvent: Event,
      triggerEvents: ManualTriggerEvents<T>,
      payload: Dict
    ): void =>
      this.actionRouter.dispatchManual(
        originEvent,
        normalizeManualActions(triggerEvents, this.state),
        payload
      ),
    deleteListener: (name: string) => this.actionRouter.deleteListener(name),
  }

  // Unified surface: every mode gets all tools (see StayTools). The three groups
  // have no overlapping keys, so the merge is unambiguous — no branch, no cast.
  return {
    ...stayTools,
    ...instantTools,
    ...animatedTools,
  }
}

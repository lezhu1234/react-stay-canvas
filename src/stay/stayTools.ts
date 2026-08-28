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
import type {
  ClientPoint,
  ContentRect,
  ContentPoint,
  ContentVector,
  ViewPoint,
  ViewVector,
} from "../types/coordinates"
import type { ManualTriggerEvents } from "../types/manualActions"
import type { Area, PointType } from "../types/geometry"
import type { Cursor, StayCoordinates, StayTools } from "../types/tools"
import { assert } from "../utils/assertions"
import { fitRect, numberAlmostEqual } from "../utils/geometry"
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
import { executeCanvas2DRenderPlan } from "./rendering/canvas2DExecutor"
import { resolveCanvas2DProjectiveQuality } from "./rendering/canvas2DProjectiveQuality"
import { createLayerRenderPlan } from "./rendering/renderPlan"
import {
  areaPlacementMatrix,
  invertMatrix2D,
} from "./transforms/affine2D"
import {
  copyChildPlacementInput,
  placeChildPlacement,
} from "./placements/childPlacement"
import Stay from "./stay"
import { StepProps } from "./types"

function placeImportedGeometry(
  child: StayInstantChild,
  offset: PointType,
  scale: number,
  center: PointType
) {
  child.shapeMap.forEach((shape) => {
    shape.moveInit()
    shape.move(...shape.applyMove(offset.x, offset.y))
    shape.zoom(shape._zoom((scale - 1) * -1000, center))
  })
}

function withChildrenAtTime<R>(
  children: StayInstantChild[],
  progress: number | undefined,
  callback: () => R
): R {
  if (progress === undefined) return callback()

  const restoreProjections: Array<() => void> = []
  try {
    children.forEach((child) => {
      restoreProjections.push(child.beginCurrentTimeProjection({ time: progress }))
    })
    return callback()
  } finally {
    restoreProjections.reverse().forEach((restore) => restore())
  }
}

function prepareRegionContext(
  context: CanvasRenderingContext2D,
  area: Area,
  targetSize: { width: number; height: number }
) {
  const { rect, scale } = fitRect(area, {
    x: 0,
    y: 0,
    ...targetSize,
  })

  context.beginPath()
  context.rect(rect.x, rect.y, rect.width, rect.height)
  context.clip()
  context.translate(rect.x, rect.y)
  context.scale(scale, scale)
  context.translate(-area.x, -area.y)
}

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
    createChild: ({ id, className, placement }: CreateChildProps) => {
      const child = new StayAnimatedChild({
        id,
        className,
        placement,
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
            placement: copyChildPlacementInput(stepChild.placement),
          })
        } else if (step.action === "remove") {
          this.tools.removeChild(stepChild.id)
        } else if (step.action === "update") {
          assert(stepChild.beforeShape)
          const child = this.findChildById(stepChild.id)!

          child.update({
            shape: materializeHistoryShapes(stepChild.shape),
            placement: stepChild.placement,
          })
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
            placement: copyChildPlacementInput(stepChild.placement),
          })
        } else if (step.action === "update") {
          if (!stepChild.beforeShape || !stepChild.beforePlacement) {
            throw new Error("update history step requires before state")
          }

          this.getChildById(stepChild.id)!.update({
            className: stepChild.beforeName || stepChild.className,
            shape: materializeHistoryShapes(stepChild.beforeShape),
            placement: stepChild.beforePlacement,
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

  const currentCoordinateFrame = () => {
    const metrics = this.root.getSurfaceMetrics()
    return { metrics, frame: this.coordinates.getFrame(metrics) }
  }

  const coordinateTools: StayCoordinates = {
    clientToView: (point: ClientPoint) =>
      this.coordinates.clientToView(point, this.root.getSurfaceMetrics()),
    viewToClient: (point: ViewPoint) =>
      this.coordinates.viewToClient(point, this.root.getSurfaceMetrics()),
    viewToContent: (point: ViewPoint) => {
      const { frame } = currentCoordinateFrame()
      return this.coordinates.viewToContent(point, frame)
    },
    contentToView: (point: ContentPoint) => {
      const { frame } = currentCoordinateFrame()
      return this.coordinates.contentToView(point, frame)
    },
    clientToContent: (point: ClientPoint) => {
      const { metrics, frame } = currentCoordinateFrame()
      return this.coordinates.clientToContent(point, metrics, frame)
    },
    contentToClient: (point: ContentPoint) => {
      const { metrics, frame } = currentCoordinateFrame()
      return this.coordinates.contentToClient(point, metrics, frame)
    },
    viewVectorToContent: (vector: ViewVector) => {
      const { frame } = currentCoordinateFrame()
      return this.coordinates.viewVectorToContent(vector, frame)
    },
    contentVectorToView: (vector: ContentVector) => {
      const { frame } = currentCoordinateFrame()
      return this.coordinates.contentVectorToView(vector, frame)
    },
  }

  const stayTools = {
    coordinates: coordinateTools,
    viewport: {
      get: () => this.coordinates.getViewport(),
      panBy: (viewMovement: ViewVector) => this.coordinates.panBy(viewMovement),
      zoomBy: (factor: number, contentAnchor?: ContentPoint) => {
        const metrics = this.root.getSurfaceMetrics()
        const frame = this.coordinates.getFrame(metrics)
        const resolvedAnchor = contentAnchor ??
          this.coordinates.viewCenterToContent(metrics, frame)
        return this.coordinates.zoomBy(factor, resolvedAnchor)
      },
      fit: (contentBounds: ContentRect, { padding = 0 } = {}) =>
        this.coordinates.fit(contentBounds, this.root.getSurfaceMetrics(), padding),
      reset: () => this.coordinates.reset(),
      restore: (state: { x: number; y: number; scale: number }) =>
        this.coordinates.restore(state),
      toClientPoint: (contentPoint: ContentPoint) =>
        coordinateTools.contentToClient(contentPoint),
    },
    refresh: () => {
      this.forceUpdateAllLayers()
      this.draw({ now: Date.now() })
    },
    appendChild: <T extends InstantShape>({
      id,
      className,
      shape,
      placement,
    }: AppendChildProps<T>) => {
      const child = new StayInstantChild<T>({
        id,
        className,
        shape,
        placement,
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
      const placement = areaPlacementMatrix(area, targetArea)
      const inversePlacement = invertMatrix2D(placement)

      children.forEach((fragment) => {
        const importedChild = materializeSceneChild(fragment, this.root)
        placeImportedGeometry(
          importedChild,
          { x: offsetX, y: offsetY },
          scale,
          { x: targetArea.x, y: targetArea.y }
        )
        const importedPlacement = placeChildPlacement(
          fragment.placement,
          placement,
          inversePlacement
        )
        importedChild.setPlacement(copyChildPlacementInput(importedPlacement))
        this.tools.appendChild({
          id: importedChild.id,
          shape: importedChild.shapeMap,
          className: importedChild.className,
          placement: copyChildPlacementInput(importedChild.placement),
        })
      })
    },
    regionToTargetCanvas: async ({
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

      const layerNumber = this.root.layers.length
      return withChildrenAtTime(children, progress, () => {
        const items = Array.from(
          { length: layerNumber },
          (_, layerIndex) => createLayerRenderPlan(children, layerIndex).items
        ).flat()

        tempCtx.save()
        try {
          prepareRegionContext(tempCtx, area, targetSize)
          executeCanvas2DRenderPlan({
            context: tempCtx,
            items,
            getNow: Date.now,
            width: this.width,
            height: this.height,
            forceDraw: true,
            getProjectiveQuality: ({ projection }) => {
              if (!projection) {
                throw new Error("projective quality requires a projective RenderItem")
              }
              return resolveCanvas2DProjectiveQuality({
                mapping: projection.mapping,
                outputWidth: tempCanvas.width,
                outputHeight: tempCanvas.height,
                contentScaleX: targetSize.width / area.width,
                contentScaleY: targetSize.height / area.height,
              })
            },
          })
        } finally {
          tempCtx.restore()
        }

        return tempCanvas
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

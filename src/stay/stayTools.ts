import {
  ALLSTATE,
  DEFAULTSTATE,
  DRAW_ACTIONS,
  DRAW_PARENTS,
  ROOTNAME,
  SORT_CHILDREN_METHODS,
  SUPPORT_OPRATOR,
} from "../userConstants"
import {
  ActionCallbackProps,
  ActionEvent,
  CreateChildProps,
  Dict,
  GetContainPointChildrenProps,
  SimplePoint,
  SortChildrenMethodsValues,
  StayTools,
  UpdateChildProps,
} from "../userTypes"
import { infixExpressionParser } from "../utils"
import Stay from "./stay"
import { StayChild } from "./stayChild"
import { StepProps } from "./types"

Stay.prototype.getTools = function (): StayTools {
  return {
    forceUpdateCanvas: () => {
      this.draw(true)
    },
    hasChild: (id: string) => {
      return this.getChildren().has(id)
    },
    createChild: ({
      id,
      shape,
      zIndex,
      className,
      individual = false,
    }: CreateChildProps) => {
      this.checkName(className, [ROOTNAME])
      const child = new StayChild({
        id,
        zIndex: zIndex === undefined ? 1 : zIndex,
        className,
        parent: individual ? DRAW_PARENTS.DRAW : DRAW_PARENTS.MAIN,
        shape,
        drawAction: DRAW_ACTIONS.APPEND,
      })
      return child
    },
    appendChild: ({
      shape,
      className,
      zIndex,
      id = undefined,
      individual = false,
    }: CreateChildProps) => {
      const child = this.tools.createChild({
        id,
        shape,
        zIndex,
        className,
        individual,
      })
      this.zIndexUpdated = true
      this.pushToChildren(child)
      this.unLogedChildrenIds.add(child.id)
      return child
    },
    updateChild: ({
      child,
      zIndex,
      shape,
      className,
      individual = true,
    }: UpdateChildProps) => {
      if (className === "") {
        throw new Error("className cannot be empty")
      }
      if (zIndex === undefined) {
        zIndex = child.zIndex
      }
      if (zIndex !== child.zIndex) {
        this.zIndexUpdated = true
      }
      child.update({
        shape,
        zIndex: zIndex,
        parent: individual ? DRAW_PARENTS.DRAW : DRAW_PARENTS.MAIN,
        className,
      })
      this.unLogedChildrenIds.add(child.id)
      return child
    },
    removeChild: (childId: string, log = false) => {
      const child = this.getChildById(childId)
      if (!child) return false
      this.drawParents[child.parent].forceUpdate = true
      this.removeChildById(child.id)
      this.unLogedChildrenIds.add(child.id)
    },
    getChildrenBySelector: (
      selector: string,
      sortBy: SortChildrenMethodsValues = SORT_CHILDREN_METHODS.AREA_ASC
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
        const [sortKey, sortOrder] = sortMap.get(sortBy) || []
        if (sortKey && sortOrder) {
          children.sort((a, b) => {
            const sortValue1 = (a.shape as any)[sortKey]
            const sortValue2 = (b.shape as any)[sortKey]
            return (sortValue1 - sortValue2) * sortOrder
          })
        }
      }

      return children
    },
    getAvailiableStates: (selector: string): string[] => {
      const stateSelectors = selector
        .split(new RegExp(`([${Object.values(SUPPORT_OPRATOR).join("")}])`))
        .map((s) =>
          s === ALLSTATE
            ? `(${[...this.stateSet].join(SUPPORT_OPRATOR.OR)})`
            : s
        )
        .join("")
      try {
        return infixExpressionParser<string>({
          selector: stateSelectors,
          fullSet: [...this.stateSet],
          elemntEqualFunc: (a: string, b: string) => a === b,
          selectorConvertFunc: (s: string) => [s],
        })
      } catch (e) {
        console.log(stateSelectors)
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
    }: GetContainPointChildrenProps): StayChild[] => {
      let _selector = selector

      if (selector && Array.isArray(selector)) {
        _selector = selector.join("|")
      }

      if (!_selector) {
        throw new Error("no className or id")
      }
      const selectorChildren = this.tools.getChildrenBySelector(
        _selector as string,
        sortBy
      )

      const hitChildren: StayChild[] = selectorChildren.filter((c) =>
        c.shape.contains(point)
      )

      return returnFirst && hitChildren.length > 0
        ? [hitChildren[0]]
        : hitChildren
    },
    changeCursor: (cursor: string) => {
      this.root.drawCanvas.style.cursor = cursor
    },
    fix: () => {
      this.getChildren().forEach((child) => {
        if (child.parent === DRAW_PARENTS.DRAW) {
          child.beforeParent = DRAW_PARENTS.DRAW
          child.parent = DRAW_PARENTS.MAIN
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
        .map((id) =>
          StayChild.diff(this.historyChildren.get(id), this.getChildById(id))
        )
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
      this.forceUpdateCanvas("DRAW")
      this.forceUpdateCanvas("MAIN")
    },
    zoom: (deltaY: number, center: SimplePoint) => {
      this.getChildren().forEach((child) => {
        child.shape.zoom(child.shape._zoom(deltaY, center))
      })
      this.forceUpdateCanvas("DRAW")
      this.forceUpdateCanvas("MAIN")
    },
    forward: () => {
      console.log("forward")
      if (this.stackIndex >= this.stack.length) {
        console.log("no more operations")
        return
      }
      const stepItem = this.stack[this.stackIndex]
      this.forceUpdateCanvas("DRAW")
      this.forceUpdateCanvas("MAIN")

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
          if (!stepChild.beforeShape) {
            throw new Error("beforeShape is not defined")
          }
          const child = this.findChildById(stepChild.id)!
          this.tools.updateChild({
            child,
            shape: stepChild.shape.copy(),
            individual: false,
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
      this.forceUpdateCanvas("DRAW")
      this.forceUpdateCanvas("MAIN")
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
          if (!stepChild.beforeShape) {
            throw new Error("beforeShape is not defined")
          }

          this.tools.updateChild({
            child: this.getChildById(stepChild.id)!,
            className: stepChild.beforeName || stepChild.className,
            shape: stepChild.beforeShape.copy(),
            individual: false,
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
        log: boolean
        name: string
      }
      let needUpdate = false
      const callbackList: CallBackType[] = []
      this.actions.forEach(
        ({ name, event, state, selector, sortBy, log, callback }) => {
          if (!(name in this.composeStore)) {
            this.composeStore[name] = {}
          }
          event.forEach((actionEventName) => {
            const avaliableSet = this.tools.getAvailiableStates(
              state || DEFAULTSTATE
            )
            if (
              !avaliableSet.includes(this.state) ||
              !(actionEventName in triggerEvents)
            ) {
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
              log,
            })
            if (callback) {
              const linkArgs = callback({
                originEvent,
                e: actionEvent,
                store: this.store,
                stateStore: this.stateStore,
                composeStore: this.composeStore[name],
                tools: this.getTools(),
                payload,
              })
              this.composeStore[name] = {
                ...this.composeStore[name],
                ...(linkArgs || {}),
              }
            }
            if (log) {
              this.tools.log()
            }
          })
        }
      )

      if (needUpdate) {
        this.draw()
      }
    },
    deleteListener: (name: string) => {
      if (this.actions.has(name)) {
        this.actions.delete(name)
      }
    },
  }
}
export default Stay

import { Shape } from "../shapes/shape"
import { DRAW_ACTIONS } from "../userConstants"
import { DrawActionsValuesType, StayChildProps, UpdateStayChildProps } from "../userTypes"
import { uuid4 } from "../utils"
import { StepProps } from "./types"

export class StayChild<T extends Shape = Shape> {
  beforeLayer: number | null
  className: string
  drawAction: DrawActionsValuesType | null
  id: string
  layer: number
  shape: T
  zIndex: number
  then: (fn: () => void) => void
  constructor({
    id,
    zIndex,
    className,
    layer,
    beforeLayer,
    shape,
    drawAction,
    then = (fn: () => void) => void 0,
  }: StayChildProps<T>) {
    this.id = id || uuid4()
    this.zIndex = zIndex === undefined ? 1 : zIndex
    this.className = className
    this.layer = layer
    this.beforeLayer = beforeLayer || null
    this.shape = shape
    this.drawAction = drawAction || null
    this.then = then
  }

  static diff<T extends Shape>(
    history: StayChild<T> | undefined,
    now: StayChild<T> | undefined
  ): StepProps | undefined {
    if (now && !history) {
      return {
        action: "append",
        child: {
          id: now.id,
          className: now.className,
          shape: now.shape.copy(),
        },
      }
    }
    if (history && !now) {
      return {
        action: "remove",
        child: {
          id: history.id,
          className: history.className,
          shape: history.shape.copy(),
        },
      }
    }
    if (history && now) {
      if (history.id !== now.id) {
        throw new Error("history id and now id must be the same")
      }
      return {
        action: "update",
        child: {
          id: now.id,
          className: now.className,
          shape: now.shape.copy(),
          beforeName: history.className,
          beforeShape: history.shape.copy(),
        },
      }
    }
  }

  copy(): StayChild<T> {
    return new StayChild({ ...this, shape: this.shape.copy() })
  }

  _update({ className, layer, shape, zIndex }: UpdateStayChildProps<T>) {
    this.className = className || this.className
    this.beforeLayer = this.layer
    this.zIndex = zIndex === undefined ? this.zIndex : zIndex
    this.layer = layer === undefined ? this.layer : layer
    this.shape = shape || (this.shape.copy() as T)
    this.drawAction = DRAW_ACTIONS.UPDATE
  }
}

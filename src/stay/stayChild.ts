import { v4 as uuid4 } from "uuid"

import { Shape } from "../shapes/shape"
import { DRAW_ACTIONS } from "../userConstants"
import {
  DrawParentsValuesType,
  StayChildProps,
  UpdateStayChildProps,
} from "../userTypes"
import { StepProps } from "./types"

export class StayChild<T extends Shape = Shape> {
  beforeParent: string | null
  className: string
  drawAction: DrawParentsValuesType | null
  id: string
  parent: string
  shape: T
  zIndex: number
  constructor({
    id,
    zIndex,
    className,
    parent,
    beforeParent,
    shape,
    drawAction,
  }: StayChildProps<T>) {
    this.id = id || uuid4()
    this.zIndex = zIndex === undefined ? 1 : zIndex
    this.className = className
    this.parent = parent
    this.beforeParent = beforeParent || null
    this.shape = shape
    this.drawAction = drawAction || null
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

  update({ className, parent, shape, zIndex }: UpdateStayChildProps<T>) {
    this.className = className || this.className
    this.beforeParent = this.parent
    this.zIndex = zIndex === undefined ? this.zIndex : zIndex
    this.parent = parent || this.parent
    this.shape = shape || (this.shape.copy() as T)
    this.drawAction = DRAW_ACTIONS.UPDATE
  }
}

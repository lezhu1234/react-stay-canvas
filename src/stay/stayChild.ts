import { v4 as uuid4 } from "uuid"

import { Shape } from "../shapes/shape"
import { DRAW_ACTIONS } from "../userConstants"
import {
  DrawActionsValuesType,
  DrawParentsValuesType,
  UpdateStayChildProps,
} from "../userTypes"
import { StepProps } from "./types"

export interface StayChildProps<T extends Shape = Shape> {
  id?: string
  zIndex?: number
  className: string
  parent: DrawParentsValuesType
  beforeParent?: DrawParentsValuesType | null
  shape: T
  drawAction?: DrawActionsValuesType | null
}

export class StayChild {
  beforeParent: string | null
  className: string
  drawAction: DrawParentsValuesType | null
  id: string
  parent: string
  shape: Shape
  zIndex: number
  constructor({
    id,
    zIndex,
    className,
    parent,
    beforeParent,
    shape,
    drawAction,
  }: StayChildProps) {
    this.id = id || uuid4()
    this.zIndex = zIndex === undefined ? 1 : zIndex
    this.className = className
    this.parent = parent
    this.beforeParent = beforeParent || null
    this.shape = shape
    this.drawAction = drawAction || null
  }

  static diff(
    history: StayChild | undefined,
    now: StayChild | undefined
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

  copy(): StayChild {
    return new StayChild({ ...this, shape: this.shape.copy() })
  }

  update({ className, parent, shape, zIndex }: UpdateStayChildProps) {
    this.className = className || this.className
    this.beforeParent = this.parent
    this.zIndex = zIndex === undefined ? this.zIndex : zIndex
    this.parent = parent || this.parent
    this.shape = shape || this.shape.copy()
    this.drawAction = DRAW_ACTIONS.UPDATE
  }
}

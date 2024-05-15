import { Dispatch, SetStateAction } from "react"

import { Point } from "../../shapes/point"
import { Rectangle, RectangleAttr } from "../../shapes/rectangle"
import { StayChild } from "../../stay/stayChild"
import { ALLSTATE, DEFAULTSTATE } from "../../userConstants"
import {
  ActionEvent,
  Dict,
  StayChildProps,
  UserStayAction,
} from "../../userTypes"
import { RectLike } from "./utils"

type UserStayActionFunc = (
  payload: Dict,
  setStateFunc: Dispatch<SetStateAction<RectLike | undefined>>
) => UserStayAction
export const DragListener: UserStayAction = {
  name: "dragListener",
  event: ["dragstart", "drag", "dragend"],
  state: ALLSTATE,
  callback: ({
    e,
    composeStore,
    tools: { createChild, appendChild, updateChild, fix, log },
  }) => {
    const eventMap = {
      dragstart: () => ({
        childAppend: false,
        dragStartPosition: new Point(e.x, e.y),
        dragChild: createChild({
          shape: new Rectangle({
            x: e.x,
            y: e.y,
            width: 0,
            height: 0,
            props: { color: "white" },
          }),
          className: "annotation",
        }),
      }),
      drag: () => {
        const { childAppend, dragStartPosition, dragChild } = composeStore
        if (e.state !== DEFAULTSTATE) {
          return
        }
        const x = Math.min(dragStartPosition.x, e.x)
        const y = Math.min(dragStartPosition.y, e.y)
        const width = Math.abs(dragStartPosition.x - e.x)
        const height = Math.abs(dragStartPosition.y - e.y)

        const returnCompose: Record<string, any> = {}
        if (!childAppend) {
          returnCompose.dragChild = appendChild({
            shape: dragChild.shape,
            className: dragChild.className,
          })
          returnCompose.childAppend = true
        } else {
          updateChild({
            child: dragChild,
            shape: (dragChild.shape as Rectangle).update({
              x,
              y,
              width,
              height,
            }),
          })
        }
        return returnCompose
      },
      dragend: () => {
        if (e.state !== DEFAULTSTATE) {
          return
        }
        composeStore = {}
        fix()
        log()
      },
    }
    return eventMap[e.name as keyof typeof eventMap]() || {}
  },
}

export const SelectListener: UserStayActionFunc = (
  payload,
  setCurrentSelectLabel
) => ({
  name: "selectListener",
  event: "click",
  state: `${DEFAULTSTATE}|annotationSelected`,
  callback: ({
    stateStore,
    e,
    tools: { updateChild, getChildrenBySelector, switchState, appendChild },
  }) => {
    const annotations = getChildrenBySelector(".annotation") as StayChild[]
    let selectedAnnotation: StayChild | undefined = undefined

    annotations.forEach((annotation) => {
      let className = "annotation"
      let color = "white"
      let individual = false
      if (
        !selectedAnnotation &&
        annotation.shape.contains(new Point(e.x, e.y))
      ) {
        selectedAnnotation = annotation
        className = "annotation:selected"
        color = "red"
        individual = true
      }
      updateChild({
        child: annotation,
        shape: (annotation.shape as Rectangle).update({ props: { color } }),
        className,
        individual,
      })
    })

    if (selectedAnnotation) {
      const rect = (selectedAnnotation as StayChild).shape as Rectangle
      setCurrentSelectLabel(
        rect.screenToWorld(payload.offsetX, payload.offsetY, payload.scaleRatio)
      )
      switchState("annotationSelected")
      stateStore.set("selectedAnnotation", selectedAnnotation)
    } else {
      setCurrentSelectLabel(undefined)
      switchState(DEFAULTSTATE)
    }
  },
})

export const DetectListener: UserStayAction = {
  name: "detectListener",
  event: "mousemove",
  state: "annotationSelected",
  callback: ({ e, stateStore, tools: { changeCursor } }) => {
    const selectedAnnotation: StayChildProps<Rectangle> =
      stateStore.get("selectedAnnotation")

    if (!selectedAnnotation) {
      return
    }
    const nearOffset = 5
    const rect = selectedAnnotation.shape
    interface updateRectangleConditionProp {
      cursor: string
      name: string
      condition: () => boolean
      updateOffset: (props: {
        offset: Point
        rect: Rectangle
        e: ActionEvent
      }) => Partial<RectangleAttr>
    }
    const updateRectangleInfos: updateRectangleConditionProp[] = [
      {
        cursor: "nwse-resize",
        name: "leftTop",
        condition: () => e.point.near(rect.leftTop, nearOffset),
        updateOffset: ({ e, rect }) => ({
          x: Math.min(e.x, rect.rightTop.x),
          y: Math.min(e.y, rect.rightBottom.y),
          width: Math.max(rect.rightTop.x - e.x, 0),
          height: Math.max(rect.rightBottom.y - e.y, 0),
        }),
      },
      {
        cursor: "nwse-resize",
        name: "rightTop",
        condition: () => e.point.near(rect.rightBottom, nearOffset),
        updateOffset: ({ e, rect }) => ({
          width: Math.max(e.x - rect.x, 0),
          height: Math.max(e.y - rect.y, 0),
        }),
      },
      {
        cursor: "nesw-resize",
        name: "leftBottom",
        condition: () => e.point.near(rect.leftBottom, nearOffset),
        updateOffset: ({ e, rect }) => ({
          x: Math.min(e.x, rect.rightTop.x),
          width: Math.max(rect.rightBottom.x - e.x, 0),
          height: Math.max(e.y - rect.y, 0),
        }),
      },
      {
        cursor: "nesw-resize",
        name: "rightBottom",
        condition: () => e.point.near(rect.rightTop, nearOffset),
        updateOffset: ({ e, rect }) => ({
          y: Math.min(e.y, rect.rightBottom.y),
          width: Math.max(e.x - rect.x, 0),
          height: Math.max(rect.rightBottom.y - e.y, 0),
        }),
      },
      {
        cursor: "ew-resize",
        name: "leftBorder",
        condition: () => e.point.nearLine(rect.leftBorder, nearOffset),
        updateOffset: ({ e, rect }) => ({
          x: Math.min(e.x, rect.rightBorder.x1),
          width: Math.max(rect.rightBorder.x1 - e.x, 0),
        }),
      },
      {
        cursor: "ew-resize",
        name: "rightBorder",
        condition: () => e.point.nearLine(rect.rightBorder, nearOffset),
        updateOffset: ({ e, rect }) => ({
          width: Math.max(e.x - rect.x, 0),
        }),
      },
      {
        cursor: "ns-resize",
        name: "topBorder",
        condition: () => e.point.nearLine(rect.topBorder, nearOffset),
        updateOffset: ({ e, rect }) => ({
          y: Math.min(e.y, rect.bottomBorder.y1),
          height: Math.max(rect.bottomBorder.y1 - e.y, 0),
        }),
      },
      {
        cursor: "ns-resize",
        name: "bottomBorder",
        condition: () => e.point.nearLine(rect.bottomBorder, nearOffset),
        updateOffset: ({ e, rect }) => ({
          height: Math.max(e.y - rect.y, 0),
        }),
      },
      {
        cursor: "move",
        name: "move",
        condition: () => rect.contains(e.point),
        updateOffset: ({ e, offset, rect }) => ({
          x: rect.x + offset.x,
          y: rect.y + offset.y,
        }),
      },
      {
        cursor: "default",
        name: "default",
        condition: () => !rect.contains(e.point),
        updateOffset: () => ({}),
      },
    ]

    stateStore.set("updateRectangleInfos", updateRectangleInfos)

    for (let cursor in updateRectangleInfos) {
      const info = updateRectangleInfos[cursor]
      const coditionSatisfied = info.condition()
      if (coditionSatisfied) {
        return changeCursor(info.cursor)
      }
    }
  },
}

export const ResizeListener: UserStayActionFunc = (
  payload,
  setCurrentSelectLabel
) => ({
  name: "resizeListener",
  event: ["dragstart", "drag", "dragend"],
  state: "annotationSelected",
  callback: ({
    e,
    stateStore,
    composeStore,
    tools: { updateChild, log, switchState },
  }) => {
    const eventMap = {
      dragstart: () => {
        console.log("dragstart")
        const updateRectangleInfos = stateStore.get("updateRectangleInfos")
        let updateFunc = null
        let updateName = ""
        for (let cursor in updateRectangleInfos) {
          const info = updateRectangleInfos[cursor]
          const coditionSatisfied = info.condition()
          if (coditionSatisfied) {
            updateFunc = info.updateOffset
            updateName = info.name
            break
          }
        }
        if (updateName === "" || updateName === "default") {
          return switchState(DEFAULTSTATE)
        }

        return {
          selectedAnnotationShape: stateStore
            .get("selectedAnnotation")
            .shape.copy(),
          dragStartPosition: new Point(e.x, e.y),
          updateFunc,
        }
      },
      drag: () => {
        const { selectedAnnotationShape, dragStartPosition, updateFunc } =
          composeStore
        console.log("drag")
        if (!selectedAnnotationShape || !dragStartPosition || !updateFunc)
          return
        console.log("dragupdate")
        const offsetX = e.x - dragStartPosition.x
        const offsetY = e.y - dragStartPosition.y
        const annotation = stateStore.get("selectedAnnotation")
        const rect = annotation.shape as Rectangle

        const updatedRect = rect.update({
          ...updateFunc({
            e,
            offset: new Point(offsetX, offsetY),
            rect: selectedAnnotationShape,
          }),
        })
        const child = updateChild({
          child: annotation,
          shape: updatedRect,
        })
        const _rect = child.shape as Rectangle
        setCurrentSelectLabel(
          _rect.screenToWorld(
            payload.offsetX,
            payload.offsetY,
            payload.scaleRatio
          )
        )
      },
      dragend: () => {
        composeStore = {}
        log()
      },
    }
    return eventMap[e.name as keyof typeof eventMap]() || {}
  },
})

export const saveListener: UserStayAction = {
  name: "save",
  event: "save",
  state: ALLSTATE,
  callback: ({ tools: { getChildrenBySelector }, payload }) => {
    const annotations = getChildrenBySelector(".annotation")
    annotations.forEach((annotation) => {
      const { id, shape } = annotation
      const rect = shape as Rectangle

      const worldRectangle = rect.screenToWorld(
        payload.offsetX,
        payload.offsetY,
        payload.scaleRatio
      )

      console.log(id, worldRectangle)
    })
  },
}

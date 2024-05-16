// import {
//   Rectangle,
//   StayChild,
//   StayImage,
//   ListenerProps,
// } from "react-stay-canvas"

import { StayImage } from "../../shapes/image"
import { Rectangle } from "../../shapes/rectangle"
import { StayChild } from "../../stay/stayChild"
import { ListenerProps } from "../../userTypes"

export const DragListener = (
  leftImage: StayChild<StayImage>,
  rightImage: StayChild<StayImage>,
  scaleRatio: number,
  offsetX: number,
  offsetY: number
): ListenerProps => {
  return {
    name: "drag",
    event: "drag",
    callback: ({ e, tools: { getChildrenBySelector, updateChild } }) => {
      const result = getChildrenBySelector(".splitBar")
      if (result.length === 0) {
        return
      }
      const splitBar = result[0]
      const splitBarShape = splitBar.shape as Rectangle

      const nearCondition =
        splitBarShape.leftBorder.nearPoint(e.point) ||
        splitBarShape.rightBorder.nearPoint(e.point)

      //   const nearCondition = true
      if (nearCondition) {
        updateChild({
          child: splitBar,

          shape: splitBarShape.update({
            x: e.x,
          }),
        })

        const eventPoint2imageRelativePoint =
          leftImage.shape.screenToWorldPoint(
            e.point,
            offsetX,
            offsetY,
            scaleRatio
          )

        updateChild({
          child: leftImage,
          shape: leftImage.shape.update({
            swidth: eventPoint2imageRelativePoint.x,
            width: e.x - leftImage.shape.x,
          }),
        })

        updateChild({
          child: rightImage,
          shape: rightImage.shape.update({
            x: e.x,
            sx: eventPoint2imageRelativePoint.x,
            swidth:
              rightImage.shape.naturalWidth! - eventPoint2imageRelativePoint.x,
            width: rightImage.shape.x + rightImage.shape.width - e.x,
          }),
        })
      }
    },
  }
}

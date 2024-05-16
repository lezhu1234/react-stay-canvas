import React, { useState } from "react"
// import {
//   Rectangle,
//   StayCanvas,
//   StayImage,
//   StayTools,
//   UserStayAction,
// } from "react-stay-canvas"

import { StayImage } from "../../shapes/image"
import { Rectangle } from "../../shapes/rectangle"
import StayCanvas from "../../stayCanvas"
import { StayTools, UserStayAction } from "../../userTypes"
import { DragListener } from "./listeners"
export function ImageDiffer() {
  const width = 600
  const height = 600
  const container = new Rectangle({
    x: 0,
    y: 0,
    width,
    height,
  })

  const [listeners, setListeners] = useState<UserStayAction[]>()

  const imagewidth = 200
  const imageheight = 300
  const splitbarWidth = 10
  const splitbarHeight = height
  const leftImageSrc = `https://picsum.photos/${imagewidth}/${imageheight}?id=1`
  const rightImageSrc = `https://picsum.photos/${imagewidth}/${imageheight}?id=2`

  function init({ appendChild, forceUpdateCanvas }: StayTools) {
    const {
      rectangle: imageRectangle,
      scaleRatio,
      offsetX,
      offsetY,
    } = container.computeFitInfo(imagewidth, imageheight)
    const { rectangle: splitBarRectangle } = container.computeFitInfo(
      splitbarWidth,
      splitbarHeight
    )
    const leftImage = appendChild({
      className: "leftImage",
      shape: new StayImage({
        src: leftImageSrc,
        x: imageRectangle.x,
        y: imageRectangle.y,
        width: imageRectangle.width,
        height: imageRectangle.height,
        imageLoaded: () => {
          forceUpdateCanvas()
        },
      }),
    })
    const rightImage = appendChild({
      className: "rightImage",
      shape: new StayImage({
        src: rightImageSrc,
        x: imageRectangle.x + imageRectangle.width / 2,
        y: imageRectangle.y,
        width: imageRectangle.width / 2,
        height: imageRectangle.height,
        sx: imagewidth / 2,
        swidth: imagewidth / 2,
        imageLoaded: () => {
          forceUpdateCanvas()
        },
      }),
    })
    const splitBar = appendChild({
      className: "splitBar",
      shape: splitBarRectangle.update({
        props: { color: "black", type: "fill" },
      }),
    })
    setListeners([
      DragListener(leftImage, rightImage, scaleRatio, offsetX, offsetY),
    ])
  }

  return (
    <>
      <div>
        <StayCanvas
          mounted={init}
          width={width}
          height={height}
          listenerList={listeners}
          layers={4}
          className="border border-solid border-red-50"
        />
      </div>
    </>
  )
}

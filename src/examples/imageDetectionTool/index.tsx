import React, { useState } from "react"

import * as PredefinedListenerList from "../../predefinedListeners"
import { StayImage } from "../../shapes/image"
import { Rectangle } from "../../shapes/rectangle"
import { Text } from "../../shapes/text"
import StayCanvas, { trigger } from "../../stayCanvas"
import { Dict, StayTools } from "../../userTypes"
import * as DetectionToolListeners from "./listeners"
import { parseCoco, RectLike } from "./utils"

export function ImageDetectionTool() {
  const width = 600
  const height = 600
  const [currentSelectLabel, setCurrentSelectLabel] = useState<RectLike>()
  let listenerList = [...Object.values(PredefinedListenerList)]

  const containerRect = new Rectangle({ x: 0, y: 0, width, height })
  let payload: Dict = {}
  let initRectangle: Rectangle
  let imageUrl: string
  let annotations: Dict[]

  const [annotationMap, imageMap] = parseCoco()
  annotationMap.forEach((_annotations, imageId) => {
    const { url, width, height } = imageMap.get(imageId)!
    const { rectangle, scaleRatio, offsetX, offsetY } =
      containerRect.computeFitInfo(width, height)

    payload = { offsetX, offsetY, scaleRatio }
    initRectangle = rectangle
    imageUrl = url
    annotations = _annotations

    return // 在本demo中, 我们只需要一张图片
  })

  const initFunc = ({ appendChild, forceUpdateCanvas }: StayTools) => {
    appendChild({
      className: "image",
      zIndex: 0,
      shape: new StayImage({
        src: imageUrl,
        x: initRectangle.x,
        y: initRectangle.y,
        width: initRectangle.width,
        height: initRectangle.height,
        imageLoaded: forceUpdateCanvas,
      }),
    })

    annotations.forEach((annotation) => {
      const [x, y, width, height] = annotation.bbox

      const child = appendChild({
        className: "annotation",
        shape: new Rectangle({ x, y, width, height }).worldToScreen(
          payload.offsetX,
          payload.offsetY,
          payload.scaleRatio
        ),
      })
      console.log(child.id, x, y, width, height)
      const label = new Text({
        x:
          x * payload.scaleRatio +
          payload.offsetX +
          width * payload.scaleRatio * 0.5,
        y: y * payload.scaleRatio + payload.offsetY,
        text: annotation.categoeyName,
        font: "12px serif",
        props: { color: "blue" },
      })
      label.update({
        y: label.y - label.height / 2,
      })
      appendChild({
        className: "annotationText",
        shape: label,
      })
    })
  }

  Object.values(DetectionToolListeners).forEach((listener) => {
    if (typeof listener === "function") {
      listenerList.push(listener(payload, setCurrentSelectLabel))
    } else {
      listenerList.push(listener)
    }
  })

  listenerList = [...listenerList]
  return (
    <div className="flex ">
      <StayCanvas
        width={width}
        height={height}
        mounted={initFunc}
        listenerList={listenerList}
      />
      <div>
        {currentSelectLabel && (
          <div>
            <div>x: {currentSelectLabel.x}</div>
            <div>y: {currentSelectLabel.y}</div>
            <div>width: {currentSelectLabel.width}</div>
            <div>height: {currentSelectLabel.height}</div>
          </div>
        )}
      </div>
      <button onClick={() => trigger("save", payload)}>save</button>
    </div>
  )
}

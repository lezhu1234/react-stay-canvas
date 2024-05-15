import React, { useCallback, useRef } from "react"

import * as PredefinedEventList from "./predefinedEvents"
import StayStage from "./stay/stayStage"

import { StayCanvasProps } from "./types"
import { Dict } from "./userTypes"

let userTrigger: (name: string, payload: Dict) => void | undefined

export const trigger = (name: string, payload?: Dict) => {
  if (userTrigger) {
    userTrigger(name, payload || {})
  }
}

export default function StayCanvas({
  width = 500,
  height = 500,
  eventList = [],
  listenerList = [],
  mounted,
}: StayCanvasProps) {
  const drawCanvas = useRef<HTMLCanvasElement | null>(null)
  const mainCanvas = useRef<HTMLCanvasElement | null>(null)

  const customTrigger = (stay: StayStage, name: string, payload: Dict) => {
    const customEvent = new Event(name)
    stay.triggerAction(customEvent, { [name]: customEvent }, payload)
  }

  const container = useCallback((node: HTMLDivElement) => {
    if (drawCanvas.current === null || mainCanvas.current === null) return
    const stay = new StayStage(drawCanvas.current, mainCanvas.current, 600, 600)

    ;[...eventList, ...Object.values(PredefinedEventList)].forEach((event) => {
      stay.registerEvent(event)
    })
    listenerList.forEach((listener) => {
      stay.addEventListener(listener)
    })
    userTrigger = (name: string, payload: Dict) =>
      customTrigger(stay, name, payload)
    if (mounted) {
      mounted(stay.tools)
      stay.draw()
    }
  }, [])

  return (
    <>
      <div
        ref={container}
        style={{
          display: "flex",
          position: "relative",
          justifyContent: "center",
          alignItems: "center",
          width: `${width}px`,
          height: `${height}px`,
        }}
      >
        <canvas
          ref={mainCanvas}
          width={width}
          height={height}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
          }}
        ></canvas>
        <canvas
          ref={drawCanvas}
          width={width}
          height={height}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
          }}
          tabIndex={1}
        ></canvas>
      </div>
    </>
  )
}

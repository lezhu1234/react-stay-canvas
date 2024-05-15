import React, { useCallback, useEffect, useRef } from "react"

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
  className = "",
}: StayCanvasProps) {
  const drawCanvas = useRef<HTMLCanvasElement | null>(null)
  const mainCanvas = useRef<HTMLCanvasElement | null>(null)
  const stay = useRef<StayStage>()

  const customTrigger = (stay: StayStage, name: string, payload: Dict) => {
    const customEvent = new Event(name)
    stay.triggerAction(customEvent, { [name]: customEvent }, payload)
  }

  const container = useCallback((node: HTMLDivElement) => {
    if (drawCanvas.current === null || mainCanvas.current === null) return
    stay.current = new StayStage(
      drawCanvas.current,
      mainCanvas.current,
      600,
      600
    )
    ;[...eventList, ...Object.values(PredefinedEventList)].forEach((event) => {
      stay.current!.registerEvent(event)
    })
    listenerList.forEach((listener) => {
      stay.current!.addEventListener(listener)
    })
    userTrigger = (name: string, payload: Dict) => {
      if (stay.current) {
        customTrigger(stay.current, name, payload)
      }
    }

    if (mounted) {
      mounted(stay.current.tools)
      stay.current.draw()
    }
  }, [])

  useEffect(() => {
    if (!stay.current) {
      return
    }
    stay.current.clearEvents()
    ;[...Object.values(PredefinedEventList), ...eventList].forEach((event) => {
      stay.current!.registerEvent(event)
    })
  }, [eventList])

  useEffect(() => {
    if (!stay.current) {
      return
    }
    stay.current.clearEventListeners()
    listenerList.forEach((listener) => {
      stay.current!.addEventListener(listener)
    })
  }, [listenerList])

  return (
    <>
      <div
        ref={container}
        className={className}
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

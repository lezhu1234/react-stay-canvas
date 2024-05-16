import React, { useCallback, useEffect, useMemo, useRef } from "react"

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
  eventList,
  listenerList,
  mounted,
  layers = 2,
  className = "",
}: StayCanvasProps) {
  if (layers < 1) {
    throw new Error("layers must be greater than 0")
  }
  const canvasLayers = useRef<HTMLCanvasElement[]>([])
  const stay = useRef<StayStage>()

  eventList = useMemo(() => eventList || [], [])
  listenerList = useMemo(() => listenerList || [], [])

  useEffect(() => {
    canvasLayers.current = canvasLayers.current.slice(0, layers)
  }, [layers])

  const customTrigger = (stay: StayStage, name: string, payload: Dict) => {
    const customEvent = new Event(name)
    stay.triggerAction(customEvent, { [name]: customEvent }, payload)
  }

  const container = useCallback((node: HTMLDivElement) => {
    if (!node) {
      return
    }
    stay.current = new StayStage(canvasLayers.current, 600, 600)
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
        {Array(layers)
          .fill(0)
          .map((_, index) => (
            <canvas
              key={index}
              ref={(el) => {
                if (el) {
                  canvasLayers.current[index] = el
                }
              }}
              tabIndex={1}
              width={width}
              height={height}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
              }}
            ></canvas>
          ))}
      </div>
    </>
  )
}

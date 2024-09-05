import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react"

import * as PredefinedEventList from "./predefinedEvents"
import StayStage from "./stay/stayStage"
import { ContextLayerSetFunction, StayCanvasProps } from "./types"
import { StayCanvasRefType } from "./userTypes"

const StayCanvas = forwardRef<StayCanvasRefType, StayCanvasProps>(function StayCanvas(
  {
    width = 500,
    height = 500,
    eventList,
    listenerList,
    mounted,
    layers = 2,
    className = "",
    passive = true,
    autoRender = true,
  }: StayCanvasProps,
  ref
) {
  let contextLayerSetFunctionList: ContextLayerSetFunction[] = []

  if (typeof layers === "number") {
    Array(layers)
      .fill(0)
      .forEach((_, i) => {
        contextLayerSetFunctionList.push((canvas: HTMLCanvasElement) => {
          return canvas.getContext("2d")
        })
      })
  } else {
    contextLayerSetFunctionList = layers
  }
  if (contextLayerSetFunctionList.length < 1) {
    throw new Error("layers must be greater than 0")
  }

  type GetNamePayloadPairType<T> = T extends {
    name: infer U
    callback: (props: infer R) => void
  }
    ? R extends { payload: infer S }
      ? {
          name: U
          payload: S
        }
      : never
    : never

  type GetListenerPairProps<T extends unknown[]> = T extends Array<infer Items>
    ? GetNamePayloadPairType<Items>
    : never

  const canvasLayers = useRef<HTMLCanvasElement[]>([])
  const stay = useRef<StayStage>()

  eventList = useMemo(() => eventList || [], [eventList])
  listenerList = useMemo(() => listenerList || [], [listenerList])

  type ListenerPair = GetListenerPairProps<typeof listenerList>
  type GetListenerPairName<T> = T extends { name: infer U } ? U : never
  type GetListenerPayloadByName<Name> = ListenerPair extends { name: Name; payload: infer U }
    ? U
    : never
  type ListenerNames = GetListenerPairName<ListenerPair>

  const init = () => {
    stay.current = new StayStage(
      canvasLayers.current,
      contextLayerSetFunctionList,
      width,
      height,
      passive,
      autoRender
    )
    ;[...Object.values(PredefinedEventList), ...eventList].forEach((event) => {
      stay.current!.registerEvent(event)
    })
    listenerList.forEach((listener) => {
      stay.current!.addEventListener(listener)
    })

    if (mounted) {
      mounted(stay.current.tools)
      stay.current.draw()
    }
  }

  const container = useCallback((node: HTMLDivElement) => {
    if (!node) {
      return
    }
    init()
  }, [])

  useImperativeHandle(
    ref,
    () => {
      return {
        trigger<T extends ListenerNames>(name: T, payload?: GetListenerPayloadByName<T>) {
          const customEvent = new Event(name as string)
          if (stay.current) {
            stay.current.triggerAction(
              customEvent,
              { [name as string]: customEvent },
              payload || {}
            )
          }
        },
        reCreate() {
          init()
        },
      }
    },
    []
  )

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

  useEffect(() => {
    init()
  }, [width, height])

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
                display: "block",
                left: 0,
                top: 0,
              }}
            ></canvas>
          ))}
      </div>
    </>
  )
})

export default StayCanvas

"use client"
import React, {
  forwardRef,
  Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"

import * as PredefinedEventList from "./predefinedEvents"
import StayStage from "./stay/stayStage"
import { ContextLayerSetFunction, StayCanvasProps } from "./types"
import { PredefinedEventName, StayCanvasRefType, StayMode } from "./userTypes"

const StayCanvas = forwardRef(
  <EventName extends string, Mode extends StayMode>(
    {
      width = 500,
      height = 500,
      eventList = [],
      listenerList = [],
      mounted,
      layers = 2,
      className = "",
      passive = true,
      mode,
      recreateOnResize = false,
      focusOnInit = true,
    }: StayCanvasProps<"instant", EventName> | StayCanvasProps<"animated", EventName>,
    ref: Ref<StayCanvasRefType>
  ) => {
    const initialized = useRef(false)
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
    const stay = useRef<StayStage<Mode>>()

    // eventList = useMemo(() => eventList || [], [eventList])
    // listenerList = useMemo(() => listenerList || [], [listenerList])

    type ListenerPair = GetListenerPairProps<typeof listenerList>
    type GetListenerPairName<T> = T extends { name: infer U } ? U : never
    type GetListenerPayloadByName<Name> = ListenerPair extends { name: Name; payload: infer U }
      ? U
      : never
    type ListenerNames = GetListenerPairName<ListenerPair>

    const init = () => {
      //@ts-ignore i cannot understand
      stay.current = new StayStage(
        canvasLayers.current,
        contextLayerSetFunctionList,
        width,
        height,
        passive,
        mode
      )
      ;[...Object.values(PredefinedEventList), ...eventList].forEach((event) => {
        stay.current!.registerEvent(event as any)
      })
      listenerList.forEach((listener) => {
        stay.current!.addEventListener(listener)
      })

      if (mounted && stay.current) {
        //@ts-ignore i cannot understand
        mounted(stay.current.tools)
      }

      if (focusOnInit) {
        canvasLayers.current[canvasLayers.current.length - 1].focus()
      }
    }

    useImperativeHandle(
      ref,
      () => {
        return {
          trigger<T extends ListenerNames>(name: T, payload?: GetListenerPayloadByName<T>) {
            const customEvent = new Event(name as string)
            if (stay.current) {
              stay.current.triggerAction(
                customEvent,
                { [name as string]: { info: customEvent, event: customEvent } },
                payload || {}
              )
            }
          },
          reCreate() {
            init()
          },
          focus() {
            canvasLayers.current[canvasLayers.current.length - 1].focus()
          },
        }
      },
      []
    )

    useEffect(() => {
      if (width > 0 && height > 0 && (!initialized.current || recreateOnResize)) {
        init()
        initialized.current = true
      }
    }, [width, height])

    return (
      <>
        <div
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
                style={{
                  position: "absolute",
                  display: "block",
                  outline: "none",
                  left: 0,
                  top: 0,
                }}
              ></canvas>
            ))}
        </div>
      </>
    )
  }
)

export default StayCanvas

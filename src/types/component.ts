import type { Rectangle } from "../shapes/rectangle"
import type React from "react"
import type { CanvasLayerConfig } from "./canvas"
import type { Dict } from "./common"
import type {
  EventProps,
  ListenerNamePayloadPair,
  ListenerProps,
  PredefinedEventListenerProps,
  PredefinedKeyEventName,
  PredefinedMouseEventName,
  PredefinedWheelEventName,
} from "./events"
import type { HistoryAdapter } from "./history"
import type { StayTools, ViewportOptions } from "./tools"
import type { WorkerStayCanvasProps, WorkerStayCanvasRef } from "./worker"

export interface composeProps {
  status?: string
  area?: Rectangle[] | Rectangle
  event?: string
}

export type StayCanvasRefType = {
  trigger: (name: string, payload?: Dict) => void
  reCreate: () => void
  focus: () => void
}

export interface StayCanvasProps<
  EventName extends string = string,
  HistorySnapshot = unknown,
  StoreSchema extends object = never,
  StateStoreSchema extends object = never,
> {
  runtime?: { readonly mode: "main" }
  className?: string
  width?: number
  height?: number
  layers?: number | CanvasLayerConfig[]
  eventList?: EventProps<EventName, StoreSchema, StateStoreSchema>[]
  listenerList?: (
    | ListenerProps<
        ListenerNamePayloadPair,
        EventName,
        any,
        StoreSchema,
        StateStoreSchema
      >
    | PredefinedEventListenerProps<
        PredefinedWheelEventName,
        any,
        StoreSchema,
        StateStoreSchema
      >
    | PredefinedEventListenerProps<
        PredefinedMouseEventName,
        any,
        StoreSchema,
        StateStoreSchema
      >
    | PredefinedEventListenerProps<
        PredefinedKeyEventName,
        any,
        StoreSchema,
        StateStoreSchema
      >
  )[]
  passive?: boolean
  mounted?: (tools: StayTools) => void
  recreateOnResize?: boolean
  focusOnInit?: boolean
  viewport?: ViewportOptions
  historyAdapter?: HistoryAdapter<HistorySnapshot>
}

export interface StayCanvasComponent {
  <Input, Notice>(
    props: WorkerStayCanvasProps<Input, Notice> &
      React.RefAttributes<WorkerStayCanvasRef>
  ): React.ReactElement | null
  <
    EventName extends string = string,
    HistorySnapshot = unknown,
    StoreSchema extends object = never,
    StateStoreSchema extends object = never,
  >(
    props: StayCanvasProps<
      EventName,
      HistorySnapshot,
      StoreSchema,
      StateStoreSchema
    > & React.RefAttributes<StayCanvasRefType>
  ): React.ReactElement | null
}

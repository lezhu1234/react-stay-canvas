import type { Rectangle } from "../shapes/rectangle"
import type { CanvasLayerConfig } from "./canvas"
import type { Dict } from "./common"
import type {
  EventProps,
  ListenerProps,
  PredefinedEventListenerProps,
  PredefinedKeyEventName,
  PredefinedMouseEventName,
  PredefinedWheelEventName,
} from "./events"
import type { HistoryAdapter } from "./history"
import type { StayTools, ViewportOptions } from "./tools"

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
> {
  className?: string
  width?: number
  height?: number
  layers?: number | CanvasLayerConfig[]
  eventList?: EventProps<EventName>[]
  listenerList?: (
    | ListenerProps
    | PredefinedEventListenerProps<PredefinedWheelEventName>
    | PredefinedEventListenerProps<PredefinedMouseEventName>
    | PredefinedEventListenerProps<PredefinedKeyEventName>
  )[]
  passive?: boolean
  mounted?: (tools: StayTools) => void
  recreateOnResize?: boolean
  focusOnInit?: boolean
  viewport?: ViewportOptions
  historyAdapter?: HistoryAdapter<HistorySnapshot>
}

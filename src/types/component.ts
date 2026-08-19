import type { Rectangle } from "../shapes/rectangle"
import type { ContextLayerSetFunction } from "./canvas"
import type { Dict } from "./common"
import type {
  EventProps,
  ListenerProps,
  PredefinedEventListenerProps,
  PredefinedKeyEventName,
  PredefinedMouseEventName,
  PredefinedWheelEventName,
} from "./events"
import type { StayTools } from "./tools"

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

export interface StayCanvasProps<EventName extends string = string> {
  className?: string
  width?: number
  height?: number
  layers?: number | ContextLayerSetFunction[]
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
}

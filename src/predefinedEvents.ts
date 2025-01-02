import { Point } from "./shapes/point"
import { EventProps } from "./types"
import { KEYBOARRD_EVENTS, MOUSE_EVENTS } from "./userConstants"
import {
  Coordinate,
  PredefinedEventName,
  PredefinedKeyEventName,
  PredefinedMouseEventName,
  PredefinedWheelEventName,
} from "./userTypes"
import { distance } from "./utils"

export const mouseDownEvent: EventProps<PredefinedMouseEventName> = {
  name: "mousedown",
  trigger: MOUSE_EVENTS.MOUSE_DOWN,
  conditionCallback: () => true,
  successCallback: ({ e, store }) => {
    store.set("lastMouseDownPosition", e.point)
    store.set("laseMouseDownTime", Date.now())
  },
}

export const UndoEvent: EventProps<PredefinedKeyEventName> = {
  name: "undo",
  trigger: KEYBOARRD_EVENTS.KEY_UP,
  conditionCallback: ({ e }) => {
    return (
      e.pressedKeys.has("Control") && !e.pressedKeys.has("Shift") && e.key.toLowerCase() === "z"
    )
  },
}

export const RedoEvent: EventProps<PredefinedKeyEventName> = {
  name: "redo",
  trigger: KEYBOARRD_EVENTS.KEY_UP,
  conditionCallback: ({ e }) => {
    return e.pressedKeys.has("Control") && e.pressedKeys.has("Shift") && e.key.toLowerCase() === "z"
  },
}

export const ClickEvent: EventProps<PredefinedMouseEventName> = {
  name: "click",
  trigger: MOUSE_EVENTS.MOUSE_UP,
  conditionCallback: ({ e, store }) => {
    if (!store.get("lastMouseDownPosition")) {
      return false
    }
    const { x, y } = store.get("lastMouseDownPosition")
    const now = Date.now()
    const timeDiff = now - store.get("laseMouseDownTime")
    const distance = Math.sqrt((e.x - x) ** 2 + (e.y - y) ** 2)
    return timeDiff < 500 && distance < 10
  },
}

export const MousemoveEvent: EventProps<PredefinedMouseEventName> = {
  name: "mousemove",
  trigger: MOUSE_EVENTS.MOUSE_MOVE,
  conditionCallback: ({ e }) => {
    return !e.pressedKeys.has("mouse0")
  },
}

export const MouseEnterEvent: EventProps<PredefinedMouseEventName> = {
  name: "mouseenter",
  trigger: MOUSE_EVENTS.MOUSE_ENTER,
  conditionCallback: () => true,
}

export const MouseLeaveEvent: EventProps<PredefinedMouseEventName> = {
  name: "mouseleave",
  trigger: MOUSE_EVENTS.MOUSE_LEAVE,
  conditionCallback: () => true,
}

const DragEndEvent: EventProps<PredefinedMouseEventName> = {
  name: "dragend",
  trigger: MOUSE_EVENTS.MOUSE_UP,
  successCallback: ({ store, deleteEvent }) => {
    deleteEvent("drag")
    deleteEvent("dragend")
    store.set("dragging", false)
  },
}

const DragEvent: EventProps<PredefinedMouseEventName> = {
  name: "drag",
  trigger: MOUSE_EVENTS.MOUSE_MOVE,
  conditionCallback: ({ e, store }) => {
    const dragStartPosition: Coordinate = store.get("dragStartPosition")
    return (
      e.pressedKeys.has("mouse0") &&
      (distance(dragStartPosition, e.point) >= 10 || store.get("dragging")) &&
      !e.pressedKeys.has("Control")
    )
  },
  successCallback: ({ store }) => {
    store.set("dragging", true)
    return DragEndEvent
  },
}

export const DragStartEvent: EventProps<PredefinedMouseEventName> = {
  name: "dragstart",
  trigger: MOUSE_EVENTS.MOUSE_DOWN,
  conditionCallback: ({ e }) => {
    return e.pressedKeys.has("mouse0") && !e.pressedKeys.has("Control")
  },
  successCallback: ({ e, store }) => {
    store.set("dragStartPosition", e.point)
    return DragEvent
  },
}

const MoveEndEvent: EventProps<PredefinedMouseEventName> = {
  name: "moveend",
  trigger: MOUSE_EVENTS.MOUSE_UP,
  conditionCallback: () => true,
  successCallback: ({ deleteEvent }) => {
    deleteEvent("move")
    deleteEvent("moveend")
  },
}

const MoveEvent: EventProps<PredefinedMouseEventName> = {
  name: "move",
  trigger: MOUSE_EVENTS.MOUSE_MOVE,
  conditionCallback: ({ e, store }) => {
    return e.pressedKeys.has("Control") && e.pressedKeys.has("mouse0")
  },
  successCallback: () => {
    return MoveEndEvent
  },
}

export const StartMoveEvent: EventProps<PredefinedMouseEventName> = {
  name: "startmove",
  trigger: MOUSE_EVENTS.MOUSE_DOWN,
  conditionCallback: ({ e }) => {
    return e.pressedKeys.has("mouse0") && e.pressedKeys.has("Control")
  },
  successCallback: () => {
    return MoveEvent
  },
}

export const MouseUpEvent: EventProps<PredefinedMouseEventName> = {
  name: "mouseup",
  trigger: MOUSE_EVENTS.MOUSE_UP,
  conditionCallback: () => true,
  successCallback: ({ store }) => {
    store.delete("lastMouseDownPosition")
    store.delete("laseMouseDownTime")
  },
}

export const ZoomInEvent: EventProps<PredefinedWheelEventName> = {
  name: "zoomin",
  trigger: MOUSE_EVENTS.WHEEL,
  conditionCallback: ({ e }) => e.deltaY < 0,
}

export const ZoomOutEvent: EventProps<PredefinedWheelEventName> = {
  name: "zoomout",
  trigger: MOUSE_EVENTS.WHEEL,
  conditionCallback: ({ e }) => e.deltaY > 0,
}

export const KeyUpEvent: EventProps<PredefinedKeyEventName> = {
  name: "keyup",
  trigger: KEYBOARRD_EVENTS.KEY_UP,
  conditionCallback: () => true,
}

export const KeyDownEvent: EventProps<PredefinedKeyEventName> = {
  name: "keydown",
  trigger: KEYBOARRD_EVENTS.KEY_DOWN,
  conditionCallback: () => true,
}

export const DropEvent: EventProps<PredefinedMouseEventName> = {
  name: "drop",
  trigger: MOUSE_EVENTS.DROP,
  conditionCallback: () => true,
}

export const DragOverEvent: EventProps<PredefinedMouseEventName> = {
  name: "dragover",
  trigger: MOUSE_EVENTS.DRAG_OVER,
  conditionCallback: () => true,
}

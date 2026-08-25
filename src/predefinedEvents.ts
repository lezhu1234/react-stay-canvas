import type { EventProps } from "./types/events"
import { KEYBOARRD_EVENTS, MOUSE_EVENTS } from "./userConstants"
import type {
  PredefinedEventName,
  PredefinedKeyEventName,
  PredefinedMouseEventName,
  PredefinedWheelEventName,
} from "./types/events"

export const mouseDownEvent: EventProps<PredefinedMouseEventName> = {
  name: "mousedown",
  trigger: MOUSE_EVENTS.MOUSE_DOWN,
  conditionCallback: () => true,
}

export const UndoEvent: EventProps<PredefinedKeyEventName> = {
  name: "undo",
  trigger: KEYBOARRD_EVENTS.KEY_UP,
  conditionCallback: ({ e }) => {
    return (
      e.pressedKeys.has("Control") &&
      !e.pressedKeys.has("Shift") &&
      e.key?.toLowerCase() === "z"
    )
  },
}

export const RedoEvent: EventProps<PredefinedKeyEventName> = {
  name: "redo",
  trigger: KEYBOARRD_EVENTS.KEY_UP,
  conditionCallback: ({ e }) => {
    return (
      e.pressedKeys.has("Control") &&
      e.pressedKeys.has("Shift") &&
      e.key?.toLowerCase() === "z"
    )
  },
}

export const ClickEvent: EventProps<PredefinedMouseEventName> = {
  name: "click",
  trigger: MOUSE_EVENTS.MOUSE_UP,
  conditionCallback: () => true,
}

export const MousemoveEvent: EventProps<PredefinedMouseEventName> = {
  name: "mousemove",
  trigger: MOUSE_EVENTS.MOUSE_MOVE,
  conditionCallback: ({ e, store }) => {
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
  conditionCallback: ({ e, store }) => Boolean(e.cancelled || store.get("dragging")),
  successCallback: ({ store, deleteEvent }) => {
    deleteEvent("drag")
    deleteEvent("dragend")
    store.set("dragging", false)
  },
}

const DragEvent: EventProps<PredefinedMouseEventName> = {
  name: "drag",
  trigger: MOUSE_EVENTS.MOUSE_MOVE,
  conditionCallback: ({ e }) =>
    e.pressedKeys.has("mouse0") && !e.pressedKeys.has("Control"),
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
    if (e.point) store.set("dragStartPosition", e.point)
    store.set("dragging", false)
    return [DragEvent, DragEndEvent]
  },
}

const MoveEndEvent: EventProps<PredefinedMouseEventName> = {
  name: "moveend",
  trigger: MOUSE_EVENTS.MOUSE_UP,
  conditionCallback: ({ e, store }) => Boolean(e.cancelled || store.get("moving")),
  successCallback: ({ store, deleteEvent }) => {
    deleteEvent("move")
    deleteEvent("moveend")
    store.set("moving", false)
  },
}

const MoveEvent: EventProps<PredefinedMouseEventName> = {
  name: "move",
  trigger: MOUSE_EVENTS.MOUSE_MOVE,
  conditionCallback: ({ e, store }) => {
    return e.pressedKeys.has("Control") && e.pressedKeys.has("mouse0")
  },
  successCallback: ({ store }) => {
    store.set("moving", true)
    return MoveEndEvent
  },
}

export const StartMoveEvent: EventProps<PredefinedMouseEventName> = {
  name: "startmove",
  trigger: MOUSE_EVENTS.MOUSE_DOWN,
  conditionCallback: ({ e }) => {
    return e.pressedKeys.has("mouse0") && e.pressedKeys.has("Control")
  },
  successCallback: ({ store }) => {
    store.set("moving", false)
    return [MoveEvent, MoveEndEvent]
  },
}

export const MouseUpEvent: EventProps<PredefinedMouseEventName> = {
  name: "mouseup",
  trigger: MOUSE_EVENTS.MOUSE_UP,
  conditionCallback: () => true,
}

export const ZoomInEvent: EventProps<PredefinedWheelEventName> = {
  name: "zoomin",
  trigger: MOUSE_EVENTS.WHEEL,
  conditionCallback: ({ e }) => e.deltaY !== undefined && e.deltaY < 0,
}

export const ZoomOutEvent: EventProps<PredefinedWheelEventName> = {
  name: "zoomout",
  trigger: MOUSE_EVENTS.WHEEL,
  conditionCallback: ({ e }) => e.deltaY !== undefined && e.deltaY > 0,
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

// export const HoverEvent: EventProps<PredefinedMouseEventName> = {
//   name: "hover",
//   trigger: FRAME_EVENT_NAME,
//   conditionCallback: () => true,
//   withTargetConditionCallback: ({ target, e, store, originEvent }) => {
//     const mousePoint = store.get("MOUSE_POINT")
//     console.log(mousePoint)
//     // console.log(target.containsPointer(e.point))
//     // return target.containsPointer(e.point)
//     // console.log(originEvent)
//     return false
//   },
// }

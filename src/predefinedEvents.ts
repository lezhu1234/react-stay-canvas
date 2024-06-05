import { Point } from "./shapes/point"
import { EventProps } from "./types"
import { KEYBOARRD_EVENTS, MOUSE_EVENTS } from "./userConstants"

export const mouseDownEvent: EventProps = {
  name: "mousedown",
  trigger: MOUSE_EVENTS.MOUSE_DOWN,
  conditionCallback: () => true,
  successCallback: ({ e, store }) => {
    store.set("lastMouseDownPosition", e.point)
    store.set("laseMouseDownTime", Date.now())
  },
}

export const UndoEvent: EventProps = {
  name: "undo",
  trigger: KEYBOARRD_EVENTS.KEY_UP,
  conditionCallback: ({ e }) => {
    return (
      e.pressedKeys.has("Control") && !e.pressedKeys.has("Shift") && e.key?.toLowerCase() === "z"
    )
  },
}

export const RedoEvent: EventProps = {
  name: "redo",
  trigger: KEYBOARRD_EVENTS.KEY_UP,
  conditionCallback: ({ e }) => {
    return (
      e.pressedKeys.has("Control") && e.pressedKeys.has("Shift") && e.key?.toLowerCase() === "z"
    )
  },
}

export const ClickEvent: EventProps = {
  name: "click",
  trigger: MOUSE_EVENTS.MOUSE_UP,
  conditionCallback: ({ e, store }) => {
    const { x, y } = store.get("lastMouseDownPosition")
    const now = Date.now()
    const timeDiff = now - store.get("laseMouseDownTime")
    const distance = Math.sqrt((e.x - x) ** 2 + (e.y - y) ** 2)
    return timeDiff < 500 && distance < 10
  },
}

export const MousemoveEvent: EventProps = {
  name: "mousemove",
  trigger: MOUSE_EVENTS.MOUSE_MOVE,
  conditionCallback: ({ e }) => {
    return !e.pressedKeys.has("mouse0")
  },
}

const DragEndEvent: EventProps = {
  name: "dragend",
  trigger: MOUSE_EVENTS.MOUSE_UP,
  successCallback: ({ store, deleteEvent }) => {
    deleteEvent("drag")
    deleteEvent("dragend")
    store.set("dragging", false)
  },
}

const DragEvent: EventProps = {
  name: "drag",
  trigger: MOUSE_EVENTS.MOUSE_MOVE,
  conditionCallback: ({ e, store }) => {
    const dragStartPosition: Point = store.get("dragStartPosition")
    return (
      e.pressedKeys.has("mouse0") &&
      (dragStartPosition.distance(e.point) >= 10 || store.get("dragging")) &&
      !e.pressedKeys.has("Control")
    )
  },
  successCallback: ({ store }) => {
    store.set("dragging", true)
    return DragEndEvent
  },
}

export const DragStartEvent: EventProps = {
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

const MoveEndEvent: EventProps = {
  name: "moveend",
  trigger: MOUSE_EVENTS.MOUSE_UP,
  conditionCallback: () => true,
  successCallback: ({ deleteEvent }) => {
    deleteEvent("move")
    deleteEvent("moveend")
  },
}

const MoveEvent: EventProps = {
  name: "move",
  trigger: MOUSE_EVENTS.MOUSE_MOVE,
  conditionCallback: ({ e, store }) => {
    return e.pressedKeys.has("Control") && e.pressedKeys.has("mouse0")
  },
  successCallback: () => {
    return MoveEndEvent
  },
}

export const StartMoveEvent: EventProps = {
  name: "startmove",
  trigger: MOUSE_EVENTS.MOUSE_DOWN,
  conditionCallback: ({ e }) => {
    return e.pressedKeys.has("mouse0") && e.pressedKeys.has("Control")
  },
  successCallback: () => {
    return MoveEvent
  },
}

export const MouseUpEvent: EventProps = {
  name: "mouseup",
  trigger: MOUSE_EVENTS.MOUSE_UP,
  conditionCallback: () => true,
  successCallback: ({ store }) => {
    store.delete("lastMouseDownPosition")
    store.delete("laseMouseDownTime")
  },
}

export const ZoomInEvent: EventProps = {
  name: "zoomin",
  trigger: MOUSE_EVENTS.WHEEL,
  conditionCallback: ({ e }) => e.deltaY < 0,
}

export const ZoomOutEvent: EventProps = {
  name: "zoomout",
  trigger: MOUSE_EVENTS.WHEEL,
  conditionCallback: ({ e }) => e.deltaY > 0,
}

export const KeyUpEvent: EventProps = {
  name: "keyup",
  trigger: KEYBOARRD_EVENTS.KEY_UP,
  conditionCallback: () => true,
}

export const KeyDownEvent: EventProps = {
  name: "keydown",
  trigger: KEYBOARRD_EVENTS.KEY_DOWN,
  conditionCallback: () => true,
}

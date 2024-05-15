import { UserStayEventProps } from "./types"
import { KeyboardEvents, MouseEvents } from "./userConstants"

export const mouseDownEvent: UserStayEventProps = {
  name: "mousedown",
  trigger: MouseEvents.MOUSE_DOWN,
  conditionCallback: () => true,
  successCallback: ({ e, store }) => {
    store.set("lastMouseDownPosition", { x: e.x, y: e.y })
    store.set("laseMouseDownTime", Date.now())
  },
}

export const BackwardEvent: UserStayEventProps = {
  name: "backward",
  trigger: KeyboardEvents.KEY_UP,
  conditionCallback: ({ e }) => {
    return (
      e.pressedKeys.has("Control") &&
      !e.pressedKeys.has("Shift") &&
      e.key?.toLowerCase() === "z"
    )
  },
}

export const ForwardEvent: UserStayEventProps = {
  name: "forward",
  trigger: KeyboardEvents.KEY_UP,
  conditionCallback: ({ e }) => {
    return (
      e.pressedKeys.has("Control") &&
      e.pressedKeys.has("Shift") &&
      e.key?.toLowerCase() === "z"
    )
  },
}

export const ClickEvent: UserStayEventProps = {
  name: "click",
  trigger: MouseEvents.MOUSE_UP,
  conditionCallback: ({ e, store }) => {
    const { x, y } = store.get("lastMouseDownPosition")
    const now = Date.now()
    const timeDiff = now - store.get("laseMouseDownTime")
    const distance = Math.sqrt((e.x - x) ** 2 + (e.y - y) ** 2)
    return timeDiff < 500 && distance < 10
  },
}

export const MousemoveEvent: UserStayEventProps = {
  name: "mousemove",
  trigger: MouseEvents.MOUSE_MOVE,
  conditionCallback: ({ e }) => {
    return !e.pressedKeys.has("mouse0")
  },
}

const DragEndEvent: UserStayEventProps = {
  name: "dragend",
  trigger: MouseEvents.MOUSE_UP,
  conditionCallback: () => true,
  successCallback: ({ store, deleteEvent }) => {
    deleteEvent("drag")
    deleteEvent("dragend")
    store.set("dragging", false)
  },
}

const DragEvent: UserStayEventProps = {
  name: "drag",
  trigger: MouseEvents.MOUSE_MOVE,
  conditionCallback: ({ e, store }) => {
    let distance = 0
    if (store.get("lastMouseDownPosition")) {
      const { x, y } = store.get("lastMouseDownPosition")
      distance = Math.sqrt((e.x - x) ** 2 + (e.y - y) ** 2)
    }
    return (
      e.pressedKeys.has("mouse0") &&
      (distance >= 10 || store.get("dragging")) &&
      !e.pressedKeys.has("Control")
    )
  },
  successCallback: ({ store }) => {
    store.set("dragging", true)
    return DragEndEvent
  },
}

export const DragStartEvent: UserStayEventProps = {
  name: "dragstart",
  trigger: MouseEvents.MOUSE_DOWN,
  conditionCallback: ({ e }) => {
    return e.pressedKeys.has("mouse0") && !e.pressedKeys.has("Control")
  },
  successCallback: () => {
    return DragEvent
  },
}

const MoveEndEvent: UserStayEventProps = {
  name: "moveend",
  trigger: MouseEvents.MOUSE_UP,
  conditionCallback: () => true,
  successCallback: ({ deleteEvent }) => {
    deleteEvent("move")
    deleteEvent("moveend")
  },
}

const MoveEvent: UserStayEventProps = {
  name: "move",
  trigger: MouseEvents.MOUSE_MOVE,
  conditionCallback: ({ e, store }) => {
    return e.pressedKeys.has("Control") && e.pressedKeys.has("mouse0")
  },
  successCallback: () => {
    return MoveEndEvent
  },
}

export const StartMoveEvent: UserStayEventProps = {
  name: "startmove",
  trigger: MouseEvents.MOUSE_DOWN,
  conditionCallback: ({ e }) => {
    return e.pressedKeys.has("mouse0") && e.pressedKeys.has("Control")
  },
  successCallback: () => {
    return MoveEvent
  },
}

export const MouseUpEvent: UserStayEventProps = {
  name: "mouseup",
  trigger: MouseEvents.MOUSE_UP,
  conditionCallback: () => true,
  successCallback: ({ store }) => {
    store.delete("lastMouseDownPosition")
    store.delete("laseMouseDownTime")
  },
}

export const ZoomInEvent: UserStayEventProps = {
  name: "zoomIn",
  trigger: MouseEvents.WHEEL,
  conditionCallback: ({ e }) => e.deltaY < 0,
}

export const ZoomOutEvent: UserStayEventProps = {
  name: "zoomOut",
  trigger: MouseEvents.WHEEL,
  conditionCallback: ({ e }) => e.deltaY > 0,
}

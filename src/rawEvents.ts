import { FireEvent } from "./types"
import { KEYBOARRD_EVENTS, MOUSE_EVENTS } from "./userConstants"

interface ReleasePressKey {
  (key: string): void
}
export function keyup(
  fireEvent: FireEvent,
  releaseKey: ReleasePressKey,
  e: KeyboardEvent
) {
  releaseKey(e.key)
  fireEvent(e, KEYBOARRD_EVENTS.KEY_UP)
}

export function keydown(
  fireEvent: FireEvent,
  pressKey: ReleasePressKey,
  e: KeyboardEvent
) {
  pressKey(e.key)
  fireEvent(e, KEYBOARRD_EVENTS.KEY_DOWN)
}
export function mousemove(fireEvent: FireEvent, e: MouseEvent) {
  fireEvent(e, MOUSE_EVENTS.MOUSE_MOVE)
}
export function mousedown(
  fireEvent: FireEvent,
  pressKey: ReleasePressKey,
  e: MouseEvent
) {
  pressKey("mouse" + e.button)
  fireEvent(e, MOUSE_EVENTS.MOUSE_DOWN)
}
export function mouseup(
  fireEvent: FireEvent,
  releaseKey: ReleasePressKey,
  e: MouseEvent
) {
  releaseKey("mouse" + e.button)
  fireEvent(e, MOUSE_EVENTS.MOUSE_UP)
}
export function wheel(fireEvent: FireEvent, e: WheelEvent) {
  fireEvent(e, MOUSE_EVENTS.WHEEL)
}

export function click(fireEvent: FireEvent, e: MouseEvent) {
  fireEvent(e, MOUSE_EVENTS.CLICK)
}

export function dblclick(fireEvent: FireEvent, e: MouseEvent) {
  fireEvent(e, MOUSE_EVENTS.DB_CLICK)
}

export function contextmenu(fireEvent: FireEvent, e: MouseEvent) {
  fireEvent(e, MOUSE_EVENTS.CONTEXT_MENU)
}

import { FireEvent } from "./types"
import { KeyboardEvents, MouseEvents } from "./userConstants"

interface ReleasePressKey {
  (key: string): void
}
export function keyup(
  fireEvent: FireEvent,
  releaseKey: ReleasePressKey,
  e: KeyboardEvent
) {
  releaseKey(e.key)
  fireEvent(e, KeyboardEvents.KEY_UP)
}

export function keydown(
  fireEvent: FireEvent,
  pressKey: ReleasePressKey,
  e: KeyboardEvent
) {
  pressKey(e.key)
  fireEvent(e, KeyboardEvents.KEY_DOWN)
}
export function mousemove(fireEvent: FireEvent, e: MouseEvent) {
  fireEvent(e, MouseEvents.MOUSE_MOVE)
}
export function mousedown(
  fireEvent: FireEvent,
  pressKey: ReleasePressKey,
  e: MouseEvent
) {
  pressKey("mouse" + e.button)
  fireEvent(e, MouseEvents.MOUSE_DOWN)
}
export function mouseup(
  fireEvent: FireEvent,
  releaseKey: ReleasePressKey,
  e: MouseEvent
) {
  releaseKey("mouse" + e.button)
  fireEvent(e, MouseEvents.MOUSE_UP)
}
export function wheel(fireEvent: FireEvent, e: WheelEvent) {
  fireEvent(e, MouseEvents.WHEEL)
}

export function click(fireEvent: FireEvent, e: MouseEvent) {
  fireEvent(e, MouseEvents.CLICK)
}

export function dblclick(fireEvent: FireEvent, e: MouseEvent) {
  fireEvent(e, MouseEvents.DB_CLICK)
}

export function contextmenu(fireEvent: FireEvent, e: MouseEvent) {
  fireEvent(e, MouseEvents.CONTEXT_MENU)
}

import { MOUSE_EVENTS } from "../../userConstants"

export type GestureFamily = "drag" | "move"

export type GesturePhase = "start" | "continue" | "terminal"

export type EventDefinitionRole =
  | { kind: "ordinary" }
  | { kind: "click-terminal" }
  | { kind: "gesture"; family: GestureFamily; phase: GesturePhase }

export type EventDefinitionScope =
  | { kind: "persistent" }
  | { kind: "pointer-session"; sessionId: number }

export type GestureDefinition = {
  family: GestureFamily
  start: string
  end: string
  all: ReadonlySet<string>
  triggers: Readonly<Record<string, string>>
}

export const GESTURES: readonly GestureDefinition[] = [
  {
    family: "drag",
    start: "dragstart",
    end: "dragend",
    all: new Set(["dragstart", "drag", "dragend"]),
    triggers: {
      dragstart: MOUSE_EVENTS.MOUSE_DOWN,
      drag: MOUSE_EVENTS.MOUSE_MOVE,
      dragend: MOUSE_EVENTS.MOUSE_UP,
    },
  },
  {
    family: "move",
    start: "startmove",
    end: "moveend",
    all: new Set(["startmove", "move", "moveend"]),
    triggers: {
      startmove: MOUSE_EVENTS.MOUSE_DOWN,
      move: MOUSE_EVENTS.MOUSE_MOVE,
      moveend: MOUSE_EVENTS.MOUSE_UP,
    },
  },
]

function gestureForEvent(eventName: string): GestureDefinition | undefined {
  return GESTURES.find(({ all }) => all.has(eventName))
}

export function describeEventDefinition(
  eventName: string,
  trigger: string
): EventDefinitionRole {
  if (eventName === "click" && trigger === MOUSE_EVENTS.MOUSE_UP) {
    return { kind: "click-terminal" }
  }

  const gesture = gestureForEvent(eventName)
  if (!gesture || gesture.triggers[eventName] !== trigger) {
    return { kind: "ordinary" }
  }
  if (eventName === gesture.start) {
    return { kind: "gesture", family: gesture.family, phase: "start" }
  }
  if (eventName === gesture.end) {
    return { kind: "gesture", family: gesture.family, phase: "terminal" }
  }
  return { kind: "gesture", family: gesture.family, phase: "continue" }
}

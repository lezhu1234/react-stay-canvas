# Interaction and events

[Documentation home](./README.md) · [中文](../zh/interaction-and-events.md)

`react-stay-canvas` does not send every DOM detail directly to application Listeners. Native input is normalized first, Event definitions decide which actions exist, and Listener state, selectors, and target rules determine which callbacks receive them.

## How input reaches a Listener

```text
PointerEvent / MouseEvent / KeyboardEvent / WheelEvent
  → DOM input adapter and pressed-input state
  → Pointer Session (continuous pointer interactions only)
  → Event definition: trigger → conditionCallback → successCallback
  → named action and ActionEvent
  → Listener: event → state → selector / target
  → callback
```

There are three different kinds of name in this flow:

- a DOM type such as `pointerdown`, `keydown`, or `wheel`;
- an Event `trigger`, such as the library's normalized `mousedown` trigger;
- an action name—the Event `name`—such as `dragstart`, `zoomin`, or a custom `save-request`.

Listeners subscribe to action names. In a browser with Pointer Events, a `mousedown` action may carry a native `PointerEvent` as its `originEvent`, so an action name does not identify the native event class.

Programmatic actions take a shorter path:

```text
StayCanvas ref.trigger / StayTools.triggerAction
  → manual ActionEvent
  → Listener state gate
  → callback (no scene target by default)
```

Manual actions do not run `eventList` conditions or success callbacks, and they do not start, continue, or end a real Pointer Session.

## Your first Listener

```tsx
import { useMemo, useState } from "react"
import { StayCanvas, type ListenerProps } from "react-stay-canvas"

export function SelectableCanvas() {
  const [selectedId, setSelectedId] = useState<string>()

  const listeners = useMemo<ListenerProps[]>(
    () => [
      {
        name: "select-card",
        event: "click",
        selector: ".card",
        callback: ({ e }) => {
          if (!e.target) return
          setSelectedId(e.target.id)
        },
      },
    ],
    []
  )

  return (
    <>
      <StayCanvas width={440} height={260} listenerList={listeners} />
      <output>{selectedId ?? "Nothing selected"}</output>
    </>
  )
}
```

This callback runs only when all three conditions hold:

1. an Event definition has produced the `click` action;
2. the Listener's state is currently available;
3. the pointer position hits a Child selected by `.card`.

When nothing is hit, the callback is skipped instead of being called with an empty target.

This example assumes that `mounted` has already appended a Child with `className: "card"`.

## Listener filtering order

The main `ListenerProps` fields are:

| Field | Purpose |
| --- | --- |
| `name` | Unique Listener name; registering the same name replaces the old Listener |
| `event` | One action name or an array of action names |
| `state` | Canvas states in which the Listener is available; defaults to `default-state` |
| `selector` | Children that may become targets; defaults to the `.stay-canvas` root Child |
| `sortBy` | Candidate ordering; provide an explicit comparator for overlapping targets |
| `callback` | Scene or application logic for accepted actions |

Listeners run in registration order. State is read before each Listener and each action, so a synchronous `switchState` in an earlier Listener is visible to later Listeners.

Replacing a same-name Listener creates a new registration. It does not inherit the old `composeStore`, gesture owner, or registration position.

## Selectors and targets

Selectors match Children, not Shapes:

```text
.node                 className is node
.node:active          full className is node:active
#node-a               id is node-a
.node|.label          node or label
.node&!#node-a        node except node-a
(.node|.label)&!#node-a parentheses make grouping explicit
```

The selector language supports `&`, `|`, `!`, and parentheses. Do not put whitespace inside an expression. Use parentheses for complex expressions instead of relying on operator-precedence assumptions.

A Child `className` is not a DOM-style whitespace-separated list. `node:active` has base class `node`; `.node` matches the base and `.node:active` matches the full value.

For pointer actions, the router first selects candidate Children and then hit-tests them at the current Canvas coordinate. The current default comparator does not provide a stable ordering guarantee, so overlapping targets should always supply `sortBy(a, b)`.

`withTargetConditionCallback` on an Event definition is a second target filter. It receives each candidate `target`; the Child it accepts is the same Child later exposed as `e.target`.

Keyboard and manual actions have no scene target by default. Without a target predicate, selectors do not filter these actions; Listeners whose event and state match run without a target. A selector on a manually triggered Listener does not cause an automatic Child lookup.

## Continuous gestures retain their start target

`dragstart → drag → dragend` and `startmove → move → moveend` capture an owner for each Listener during the start phase:

- later phases keep using the Child hit at the start;
- crossing another Child does not retarget the gesture;
- a start miss cannot acquire a target later;
- if the Listener's state was unavailable at the start, a mid-gesture state change does not let it take over.

Code handling a drag can therefore treat `e.target` as the gesture owner without repeating hit testing on every move.

## State, store, and composeStore

The initial Canvas state is `default-state`. After `tools.switchState("draw")`, only Listeners whose state expression accepts `draw` are available.

```tsx
const listeners: ListenerProps[] = [
  { name: "draw", state: "draw", event: "click", callback: drawItem },
  { name: "select", state: "select", event: "click", callback: selectItem },
  { name: "always", state: "all-state", event: "mousedown", callback: recordInput },
]
```

State expressions also support `&`, `|`, `!`, and parentheses, such as `draw|select` or `!disabled`. `all-state` is reserved and accepts every known state.

The three callback stores have different lifetimes:

| Store | Lifetime |
| --- | --- |
| `store` | Persists for the Canvas instance and survives state changes |
| `stateStore` | Belongs to the instance but is cleared by every `switchState` |
| `composeStore` | Private to one Listener registration and connects its actions over time |

Prefer updating `composeStore` through the action functions returned by the callback:

```tsx
const dragListener: ListenerProps = {
  name: "drag-card",
  event: ["dragstart", "drag", "dragend"],
  selector: ".card",
  callback: ({ e, composeStore }) => {
    if (!e.target || e.x === undefined || e.y === undefined) return
    const target = e.target
    const x = e.x
    const y = e.y

    return {
      dragstart: () => {
        target.moveInit()
        return { target, start: { x, y } }
      },
      drag: () => {
        composeStore.target.move(
          x - composeStore.start.x,
          y - composeStore.start.y
        )
      },
    }
  },
}
```

The outer `callback` runs for every accepted action. Only the returned function whose key matches the current `e.name` then runs, and its returned object is merged into that Listener's `composeStore`.

## `originEvent` and `ActionEvent`

A Listener callback receives two event objects:

- `originEvent` is the native Event that caused the action. Use it for `preventDefault()`, DOM type checks, and browser-specific fields.
- `e` is the library's plain `ActionEvent`. Use it for the action name, Canvas coordinates, pressed-input state, and scene target.

They are not the same object. Every Listener invocation also receives its own ActionEvent envelope; `point` and `pressedKeys` are copied so mutations in one Listener do not leak into the next.

Every `ActionEvent` has:

- `name`;
- `state`;
- `pressedKeys`;
- `isMouseEvent`.

Other fields depend on the input source and routing result:

| Field | Present when |
| --- | --- |
| `x`, `y`, `point` | Native input has a pointer coordinate, or manual data supplies them |
| `target` | Target resolution succeeds for this Listener |
| `key` | Keyboard input, or manual data supplies it |
| `deltaX/Y/Z` | Wheel input, or manual data supplies them |
| `pointerId`, `pointerType` | The action belongs to a real Pointer Session |
| `cancelled`, `cancelReason` | Gesture terminal metadata; `cancelled` is `true` on cancellation |

`isMouseEvent` is a legacy name for pointer-position semantics; it does not guarantee that the device is a mouse. Read `pointerType` to distinguish mouse, pen, and touch.

## Narrow optional fields before use

An action name cannot guarantee a field because a manual action may also be named `drag` or `keydown`. Use a type guard before reading coordinates or a target:

```tsx
import type { ActionEvent, Coordinate } from "react-stay-canvas"

type PositionedAction<EventName extends string = string> =
  ActionEvent<EventName> & {
    x: number
    y: number
    point: Coordinate
  }

function hasPointerPosition<EventName extends string>(
  e: ActionEvent<EventName>
): e is PositionedAction<EventName> {
  return e.x !== undefined && e.y !== undefined && e.point !== undefined
}

function hasPointerTarget<EventName extends string>(
  e: ActionEvent<EventName>
): e is PositionedAction<EventName> & { target: NonNullable<ActionEvent["target"]> } {
  return hasPointerPosition(e) && e.target !== undefined
}
```

An object-level type guard remains narrowed inside returned action functions and nested callbacks such as `forEach`. Separate checks of `e.x` and `e.y` in an outer scope do not always retain that narrowing in closures.

## Predefined actions

The default Event definitions provide these commonly used actions:

| Action | Default condition |
| --- | --- |
| `mousedown`, `mouseup` | Primary pointer press and release; extra mouse-chord buttons also produce separate actions |
| `mousemove` | Pointer moves while primary button `mouse0` is not pressed |
| `mouseenter`, `mouseleave` | Pointer enters or leaves the top Canvas layer |
| `click` | Normal press and release are under 500ms and less than 10px apart |
| `dragstart` | Primary button is pressed without Control |
| `drag` | Primary button stays pressed, moves at least 10px, and Control is not pressed |
| `dragend` | An active drag ends normally, or its session is cancelled |
| `startmove` | Control and the primary button are pressed |
| `move` | Control and the primary button remain pressed while moving |
| `moveend` | An active move ends normally, or its session is cancelled |
| `zoomin`, `zoomout` | Wheel `deltaY` is respectively below or above zero |
| `keydown`, `keyup` | Keyboard input while the Canvas has focus |
| `undo` | Z is released while Control remains pressed |
| `redo` | Z is released while Control and Shift remain pressed |
| `dragover`, `drop` | Native browser drag-and-drop input |

`undo` and `redo` are action names; they do not call `tools.undo()` or `tools.redo()` automatically. Register Listeners to perform those commands.

## `pressedKeys`, focus, and platform differences

`pressedKeys` is a snapshot of current input state:

- keyboard entries use `KeyboardEvent.key`, such as `Control`, `Shift`, `Meta`, and `" "` for Space;
- the primary/left mouse button is `mouse0`;
- the middle button is `mouse1`;
- the secondary/right button is `mouse2`.

Keyboard actions are emitted only while the top Canvas has focus. `focusOnInit` is enabled by default, and `StayCanvasRef.focus()` can restore focus. Releasing a key outside the Canvas reconciles internal pressed state but does not synthesize a Canvas `keyup` action.

The predefined `startmove`, `undo`, and `redo` actions currently use Control and do not map macOS Command to Control. On macOS, Control-click may also open a context menu. For cross-platform panning, prefer a Space-plus-primary override like the Transform example. Add explicit `Meta` support for standard macOS shortcuts.

Set `passive={false}` on `StayCanvas` when a Wheel Listener needs to call `originEvent.preventDefault()`.

## Pointer Sessions and release outside the Canvas

Each `StayCanvas` tracks at most one primary Pointer Session. Its job is to finish an interaction that starts inside the Canvas even after the pointer leaves its bounds.

```text
pointer down inside Canvas
  → start session and capture pointer
pointer move inside or outside
  → continue the same session and retain the start target
pointer up
  → normal terminal
pointercancel / lostpointercapture / window blur / document hidden
  → cancelled terminal
```

When Pointer Events are available, the runtime requests Pointer Capture at the start. If capture is unavailable or never becomes active, window terminal listeners provide an outside-release fallback. Releases delivered to the Canvas, including capture-retargeted releases, still run through the Canvas's own DOM listener.

Every normal or cancelled path terminates once. Cancellation has these semantics:

- `dragend` or `moveend` may receive `e.cancelled === true`;
- `e.cancelReason` is `pointercancel`, `lostpointercapture`, `blur`, or `visibilitychange`;
- coordinates come from the last pointer sample in the session;
- `originEvent` remains the real native event that caused cancellation;
- cancellation emits no `click` and is not disguised as an ordinary `mouseup`.

The current model tracks only the primary pointer for each Canvas; it does not implement multi-pointer gestures such as pinch zoom. Input state, targets, and sessions are isolated between Canvas instances.

## Override panning with Space

These Event definitions retain the `startmove → move → moveend` action names while replacing the default Control condition with Space:

```tsx
import {
  MOUSE_EVENTS,
  type EventProps,
  type ListenerProps,
} from "react-stay-canvas"

const isSpacePressed = (keys: Set<string>) =>
  keys.has(" ") || keys.has("Spacebar")

const spaceMoveEnd: EventProps<string> = {
  name: "moveend",
  trigger: MOUSE_EVENTS.MOUSE_UP,
  conditionCallback: ({ e, store }) =>
    Boolean(e.cancelled || store.get("spaceMoving")),
  successCallback: ({ store, deleteEvent }) => {
    store.set("spaceMoving", false)
    deleteEvent("move")
    deleteEvent("moveend")
  },
}

const spaceMove: EventProps<string> = {
  name: "move",
  trigger: MOUSE_EVENTS.MOUSE_MOVE,
  conditionCallback: ({ e }) =>
    isSpacePressed(e.pressedKeys) && e.pressedKeys.has("mouse0"),
  successCallback: ({ store }) => {
    store.set("spaceMoving", true)
    return spaceMoveEnd
  },
}

export const spaceStartMove: EventProps<string> = {
  name: "startmove",
  trigger: MOUSE_EVENTS.MOUSE_DOWN,
  conditionCallback: ({ e }) =>
    isSpacePressed(e.pressedKeys) && e.pressedKeys.has("mouse0"),
  successCallback: ({ store }) => {
    store.set("spaceMoving", false)
    return [spaceMove, spaceMoveEnd]
  },
}

export const spacePanListener: ListenerProps = {
  name: "space-pan",
  event: ["startmove", "move", "moveend"],
  callback: ({ e, composeStore, tools }) => {
    if (e.x === undefined || e.y === undefined || !e.point) return
    const { x, y, point } = e
    return {
      startmove: () => {
        tools.moveStart()
        return { start: point }
      },
      move: () => {
        void tools.move(
          x - composeStore.start.x,
          y - composeStore.start.y
        )
      },
    }
  },
}
```

Putting `spaceStartMove` in `eventList` replaces the default definition by name. Its returned `move` and `moveend` definitions belong only to the active Pointer Session and are cleaned up at terminal.

Also register a keyboard Listener that calls `originEvent.preventDefault()` while Space is pressed to prevent page scrolling.

## Custom Events and dynamic chains

The core `EventProps` fields are:

| Field | Purpose |
| --- | --- |
| `name` | Produced action name; a persistent Event with the same name is replaced |
| `trigger` | Raw input type such as `mousedown`, `mousemove`, or `keyup` |
| `conditionCallback` | Produces the action only when it returns `true` |
| `successCallback` | Runs after success and may delete or return Event definitions |
| `withTargetConditionCallback` | Applies a second check to Children selected for a Listener |

When `successCallback` returns one or more Event definitions, new names become visible on the next input. It may also call `deleteEvent(name)` to remove a definition immediately from the current scope.

Later phases returned by a standard drag or move start are scoped to the current Pointer Session and are removed at terminal. Other dynamically returned definitions persist until deletion, replacement, or Canvas destruction.

The runtime snapshots the names to inspect at the start of one input. A new name waits for the next input; deletion is immediate; a same-name replacement whose turn has not run may take effect in the current input. Synchronous exceptions from Event conditions, success callbacks, and Listeners propagate to the caller, and completed registry changes are not rolled back.

## Trigger actions manually

From React, prefer the component ref:

```tsx
const canvasRef = useRef<StayCanvasRefType>(null)

canvasRef.current?.trigger("save-request", {
  documentId: "doc-42",
})
```

The Listener receives the application data through `payload`:

```tsx
const saveListener: ListenerProps = {
  name: "save-request-listener",
  event: "save-request",
  callback: ({ payload }) => {
    console.log(payload.documentId)
  },
}
```

Use `StayTools.triggerAction` when explicit ActionEvent fields are required:

```tsx
tools.triggerAction(
  new Event("save-request"),
  {
    "save-request": {
      info: {
        state: "editing",
        pressedKeys: new Set(["Meta"]),
      },
    },
  },
  { documentId: "doc-42" }
)
```

The first argument is the separate native `originEvent`. `info` accepts plain action data only. Passing a native Event as `info` throws a `TypeError`, including Events from another realm such as an iframe.

Omitted manual fields use safe defaults: state is the state at dispatch time, `pressedKeys` is empty, and `isMouseEvent` is `false`. Manual actions have no target by default. Even a manual action named `dragstart` does not take ownership of a real gesture, and a Listener selector does not change that.

`info.state` only controls the `e.state` value seen by the callback. It does not call `switchState` or change Listener state gates, which always read the Canvas's real current state.

## Terminal and synchronous reentry boundary

A Pointer Session terminal—from EventRuntime evaluation through Listener dispatch and cleanup of dynamic definitions, click pairing, and gesture targets—is one synchronous boundary.

Do not synchronously create the next native `pointerdown` or `mousedown` with `canvas.dispatchEvent(...)` before a `dragend`, `moveend`, `mouseup`, or cancellation callback returns. The Canvas ignores that nested native start.

Use `ref.trigger()` or `tools.triggerAction()` for application-level cascading actions. Dispatch a new native down event only after the current terminal callback has returned.

If an Event definition or Listener throws synchronously during terminal processing, the session's dynamic definitions, click pairing, and target are still removed in `finally`, after which the exception continues outward.

## Related examples

- [Events](https://lezhu1234.github.io/react-stay-canvas/#/simple/events): DOM input, drag, focus, ref triggering, and recreation.
- [Selectors](https://lezhu1234.github.io/react-stay-canvas/#/simple/selectors): selector queries, hit testing, and visible feedback.
- [State](https://lezhu1234.github.io/react-stay-canvas/#/simple/state): state gates, store, and stateStore.
- [Transform](https://lezhu1234.github.io/react-stay-canvas/#/simple/transform): Space-drag, Wheel zoom, and release outside the Canvas.
- [Diagram](https://lezhu1234.github.io/react-stay-canvas/#/integrations/diagram): stable gesture targets, mode switching, and dependent updates.

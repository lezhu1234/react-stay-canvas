# Events and Listeners API

[中文](../../zh/api/events-and-listeners.md) · [Interaction and events guide](../interaction-and-events.md)

For event flow, selectors, state, Pointer Sessions, macOS modifiers, and manual actions, see [Interaction and events](../interaction-and-events.md).

## ListenerProps

```ts
import type { ListenerProps } from "react-stay-canvas"

const saveListener: ListenerProps = {
  name: "save-listener",
  event: "save",
  callback: () => {},
}
```

| Field | Meaning |
| --- | --- |
| `name` | Unique Listener identity and composeStore isolation boundary |
| `state` | Route only when the current Canvas state matches the expression |
| `selector` | Target query; native pointer actions default to the root selector `.stay-canvas` when omitted |
| `event` | Subscribe to one or more action names |
| `sortBy` | Override the default smallest-bound-first target ordering |
| `callback` | Runs synchronously after action routing |

Standard drag and move gestures choose their target when the gesture begins. Continuation and terminal phases retain that owner. A manual action named `drag` remains an ordinary action and does not enter Pointer Session ownership.

## ActionCallbackProps

| Field | Type | Meaning |
| --- | --- | --- |
| `originEvent` | `Event` | Current native event; do not retain its propagation state across async work |
| `e` | `ActionEvent` | Per-Listener action envelope |
| `store` | `Map` or `StayStore<Schema>` | Storage shared by Event definitions |
| `stateStore` | `Map` or `StayStore<Schema>` | Storage for the current Canvas state, cleared on state changes |
| `composeStore` | object | State merged from callback-returned functions inside this Listener |
| `canvas` | `Canvas` | Current runtime Canvas |
| `tools` | `StayTools` | Tools for the current Canvas |
| `payload` | object | Business data from a manual trigger |

A `callback` may return a function map keyed by action name. The selected function runs synchronously, and its returned object is merged into that Listener's `composeStore`.

`StayStore<Schema>` is a typed view of the same native Map. Its `get()` and `set()` methods infer a different value type for each known string key. Add store schemas through the trailing generics of `EventProps`, `ListenerProps`, or `StayCanvasProps`; omitting them preserves the existing `Map<string, any>` callback type. Schemas do not initialize values, so `get()` still returns `undefined` until a key is set. See [Interaction and events: Typed callback stores](../interaction-and-events.md#typed-callback-stores).

## ActionEvent

Always present:

| Field | Type | Meaning |
| --- | --- | --- |
| `name` | `string` | Registered action name; restored even if an Event successCallback mutates it |
| `state` | `string` | Current Canvas state |
| `pressedKeys` | `Set<string>` | Isolated snapshot for this Listener |
| `isMouseEvent` | `boolean` | Whether the action carries pointer-coordinate semantics |

Optional by input source:

| Field | Present when |
| --- | --- |
| `target` | Selector routing resolves a Child |
| `x`, `y`, `point` | Native pointer, mouse, and wheel inputs use Content coordinates; manual actions retain only explicitly supplied values |
| `movement` | View-coordinate delta between adjacent Pointer Session samples; `{ x: 0, y: 0 }` for ordinary stateless mouse input |
| `key` | Keyboard input or an explicit manual key exists |
| `deltaX`, `deltaY`, `deltaZ` | Wheel input or explicit manual deltas exist |
| `pointerId`, `pointerType` | Input came from Pointer Events |
| `cancelled`, `cancelReason` | A Pointer Session produced a cancelled terminal action; reasons include DOM cancellation and logical `resize` |

An action name does not guarantee these fields. Narrow before use:

```ts
import type { ActionEvent, ContentPoint } from "react-stay-canvas"

function hasPointerPosition(
  e: ActionEvent,
): e is ActionEvent & { x: number; y: number; point: ContentPoint } {
  return e.x !== undefined && e.y !== undefined && e.point !== undefined
}
```

Native pointer input passes through three internal spaces. Client is measured in browser viewport pixels. View is the CSS-normalized `width × height` Canvas plane. Content is obtained by inversely applying `tools.viewport`. Public `e.point` is a `ContentPoint`, so hit testing and Child operations do not need viewport math; `e.movement` is a `ViewVector`, so drag thresholds and panning feel do not change with zoom. Use `tools.coordinates` for explicit conversion.

## EventProps

```ts
import type {
  EventProps,
} from "react-stay-canvas"

const saveEvent: EventProps<"save"> = {
  name: "save",
  trigger: "keydown",
}
```

The exported `EventProps<EventName, StoreSchema?, StateStoreSchema?>` type combines required `name`/`trigger` fields, optional condition and success callbacks, and an optional target predicate. Use the exported type rather than reproducing its internal trigger union.

- `conditionCallback` decides whether an action succeeds before target resolution;
- `successCallback` runs after success and may register linked Event definitions;
- `deleteEvent(name)` removes the currently visible definition;
- `withTargetConditionCallback` applies an additional predicate to one candidate Child;
- runtime scope, not action-name inference in application code, determines whether a dynamic Event is session or global.

## Predefined action names

Mouse and pointer:

```text
mousedown, mouseup, mousemove, mouseenter, mouseleave, click,
dragstart, drag, dragend, startmove, move, moveend,
dragover, drop, zoomin, zoomout
```

Keyboard:

```text
keydown, keyup, undo, redo
```

`dragstart` is emitted on an eligible primary-button press. The `drag` continuation begins after at least 10 px of movement; a normal `dragend` requires that continuation to have started. `startmove/move/moveend` is the immediate-movement family. Exact conditions are defined by the current `PredefinedEventList`.

The `PredefinedMouseEventName` type also contains `wheel` and `hover`, but the current `PredefinedEventList` does not register same-named Event definitions. Add explicit definitions through `eventList` before subscribing Listeners to those names.

## ManualTriggerEvents

```ts
type ManualTriggerEvents<EventName extends string> = Partial<
  Record<EventName, { info: ManualActionEvent }>
>
```

`ManualActionEvent` is plain data, not a native `Event`. It may provide `state`, `pressedKeys`, `isMouseEvent`, `x`, `y`, `point`, `key`, `deltaX`, `deltaY`, and `deltaZ`. It cannot provide a target, Pointer Session id, or cancellation metadata. Pass the native Event as the first argument of `tools.triggerAction()`.

## Related reference

- [Interaction and events](../interaction-and-events.md)
- [StayCanvas API](./stay-canvas.md)
- [StayTools API](./stay-tools.md)

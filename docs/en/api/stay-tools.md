# StayTools API

[中文](../../zh/api/stay-tools.md) · [Scenes and tools guide](../scene-and-tools.md)

`StayTools` is the unified `BasicTools & InstantTools & AnimatedTools` interface. Every Canvas has static, animated, and history tools at the same time; there is no runtime mode to select.

## Children and queries

| Method | Signature summary | Meaning |
| --- | --- | --- |
| `appendChild` | `({ id?, className, shape }) => StayInstantChild` | Add a static Child; shape may be one value, an array, or a Map |
| `removeChild` | `(childId) => Promise<void> \| void` | Remove a Child; root cannot be removed |
| `hasChild` | `(id) => boolean` | Test existence by id |
| `getChildrenWithoutRoot` | `() => StayInstantChild[]` | Return application Children |
| `getChildById` | `(id) => StayInstantChild \| void` | Read one Child by id |
| `getChildBySelector` | `(selector) => StayInstantChild \| void` | Return the first selector match |
| `getChildrenBySelector` | `(selector, sortBy?) => StayInstantChild[]` | Query and optionally sort matches |
| `getContainPointChildren` | `({ selector, point, ... }) => StayInstantChild[]` | Query Children that hit one point |
| `getChildrenByArea` | `(area, selector?) => StayInstantChild[]` | Query Children with a Shape center inside an area |

`getContainPointChildren` options:

| Field | Default | Meaning |
| --- | --- | --- |
| `selector` | required | String, string array, or function selector |
| `point` | required | Canvas-local coordinate |
| `returnFirst` | `false` | Return at most the first sorted match |
| `sortBy` | — | Hit-result ordering |
| `withRoot` | `true` | Whether root may be returned |

## State and display

| Method | Meaning |
| --- | --- |
| `switchState(state)` | Change Canvas/Listener state and clear stateStore |
| `getAvailiableStates(selector)` | Return known states matching an expression; the public name retains its current historical spelling |
| `changeCursor(cursor)` | Set the top Canvas cursor |
| `refresh()` | Force every layer to redraw |

## Scene transforms

| Method | Meaning |
| --- | --- |
| `moveStart()` | Snapshot the whole-scene movement origin |
| `move(offsetX, offsetY, filter?)` | Pan the scene; filter may exclude non-root Children |
| `zoom(deltaY, center, filter?)` | Zoom around a Canvas-local point |
| `reset()` | Apply the current root-based inverse transform; not reliable after a scene move |

`move()`, `zoom()`, and `reset()` return a Promise resolved on the next runtime tick; it does not mean the browser compositor has completed a frame. `reset()` is not a reliable restore-to-initial-state operation after scene movement; see [Current limitations](../known-limitations.md#scene-operations).

## History

| Method | Meaning |
| --- | --- |
| `log()` | Commit pending static-Child diffs, including Shape mutations, as one history item |
| `undo()` | Undo one item; logs when none remain |
| `redo()` | Redo one item; logs when none remain |
| `resetHistory()` | Clear undo/redo and use the current static scene as the new baseline |

Animated Children do not participate in history. See [Scenes and tools: History transactions](../scene-and-tools.md#history-transactions) for boundaries and examples.

## Animation

| Method | Signature summary | Meaning |
| --- | --- | --- |
| `createChild` | `({ id?, className }) => StayAnimatedChild` | Create and append an animated Child |
| `progress` | `({ timeMs, bound?, beforeDrawCallback?, afterDrawCallback? }) => DrawReturn` | Advance animated Children and draw immediately |

`DrawReturn`:

```ts
interface DrawReturn {
  updatedLayers: number[]
  updatedChilds: Array<{
    child: StayInstantChild
    shapes: InstantShape[]
  }>
}
```

## Scene transfer and output

| Method | Meaning |
| --- | --- |
| `exportChildren({ children, area? })` | Capture current Shapes as a reusable `SceneFragment` |
| `importChildren(scene, targetArea?)` | Materialize a fragment at equal aspect ratio with new runtime ids |
| `regionToTargetCanvas({ area, targetSize?, children, progress? })` | Aspect-fit a region onto a new HTMLCanvasElement; optionally capture an animation frame without changing playback |

`CaptureSceneProps` is the export input. `SceneFragment` contains an `area` and Child fragments with `sourceId`, `className`, and `shapes`. `sourceId` is correlation metadata; it is not reused as the imported Child id.

Scene transfer captures common Shape state and independently owned style containers. It intentionally captures only the current projection of an Animated Child and is not a timeline serialization format.

## Actions and Listeners

| Method | Meaning |
| --- | --- |
| `triggerAction(originEvent, triggerEvents, payload)` | Route manual actions from an explicit native Event, plain action data, and business payload |
| `deleteListener(name)` | Delete a named Listener |

```ts
tools.triggerAction(
  new Event("save"),
  { save: { info: { state: "editing" } } },
  { documentId: "doc-1" },
)
```

`triggerEvents.*.info` cannot be a native Event; native Events from another iframe realm are rejected as well. See [Trigger actions manually](../interaction-and-events.md#trigger-actions-manually) for the full contract.

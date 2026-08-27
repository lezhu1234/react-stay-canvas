# StayTools API

[中文](../../zh/api/stay-tools.md) · [Scenes and tools guide](../scene-and-tools.md)

`StayTools` is the unified `BasicTools & InstantTools & AnimatedTools` interface. Every Canvas has static, animated, and history tools at the same time; there is no runtime mode to select.

## Children and queries

| Method | Signature summary | Meaning |
| --- | --- | --- |
| `appendChild` | `({ id?, className, shape, transform? }) => StayInstantChild` | Add a static Child; shape may be one value, an array, or a Map |
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
| `point` | required | Scene-space `ContentPoint` |
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

### Coordinate conversion

`tools.coordinates` is the unified conversion surface for the three global Client, View, and Content spaces. It does not own a second viewport state; every call uses the current Canvas display metrics and current viewport.

| Method | Meaning |
| --- | --- |
| `clientToView(point)` | Browser Client point → Canvas View point |
| `viewToClient(point)` | Canvas View point → browser Client point |
| `viewToContent(point)` | View point → current scene Content point |
| `contentToView(point)` | Content point → current Canvas View point |
| `clientToContent(point)` | Browser Client point → current scene Content point |
| `contentToClient(point)` | Content point → browser Client point, suitable for DOM overlays |
| `viewVectorToContent(vector)` | View displacement → Content displacement; applies scale but not translation |
| `contentVectorToView(vector)` | Content displacement → View displacement; applies scale but not translation |

The package root also exports `ClientPoint`, `ViewPoint`, `ContentPoint`, `ViewVector`, and `ContentVector`. These are zero-runtime-cost weak branded types: plain `{ x, y }` values remain compatible with existing APIs, while values returned with a known space cannot be passed to a different space by mistake. Points and vectors are also distinct because point conversion includes translation and vector conversion does not.

`tools.coordinates` reads the latest viewport when it is called. By contrast, event `e.point` is the Content point captured for that input sample; it stays stable even when an earlier Listener changes the viewport during the same dispatch.

### Non-destructive Child transform

`appendChild()` and `createChild()` accept an optional semantic `{ x, y, rotation, scaleX, scaleY, skewX, skewY, origin }` transform or an advanced raw `{ matrix: { a, b, c, d, e, f } }`. Rotation and skew are degrees. The transform maps Child-local Shape geometry into Content without changing Shape properties.

`child.setTransform(transform)` replaces the complete transform. `child.transform` returns the resolved matrix snapshot; `child.toLocalPoint(contentPoint)` and `child.toContentPoint(localPoint)` cross the local boundary explicitly. Matrices must be finite and invertible. Static transforms participate in history and scene transfer; animated transform interpolation is not yet supported.

### Non-destructive viewport

`tools.viewport` changes how Content is displayed in the View without mutating Child/Shape geometry or writing history:

| Method | Meaning |
| --- | --- |
| `get()` | Return a `{ x, y, scale }` snapshot |
| `panBy(viewMovement)` | Accumulate a `ViewVector` display offset |
| `zoomBy(factor, contentAnchor?)` | Zoom by a positive factor; the anchor is the `ContentPoint` whose display position stays fixed, defaulting to the View center |
| `reset()` | Restore `{ x: 0, y: 0, scale: 1 }`, subject to min/max limits |
| `restore(state)` | Restore a previous snapshot and clamp its scale to configured limits |
| `toClientPoint(contentPoint)` | Compatibility entry point for `coordinates.contentToClient()` |

The projection is `View = Content × scale + (x, y)`. Every method synchronously returns the new read-only snapshot; the Renderer uses one coordinate snapshot to repaint all dirty layers on the next frame.

### Destructive scene transforms

| Method | Meaning |
| --- | --- |
| `moveStart()` | Snapshot the whole-scene movement origin |
| `move(offsetX, offsetY, filter?)` | Pan the scene; filter may exclude non-root Children |
| `zoom(deltaY, center, filter?)` | Zoom around a Canvas-local point |
| `reset()` | Apply the current root-based inverse transform; not reliable after a scene move |

These legacy methods directly mutate Child/Shape coordinates. They are batch geometry operations, not viewport controls. `move()`, `zoom()`, and `reset()` return a Promise resolved on the next runtime tick; it does not mean the browser compositor has completed a frame. `reset()` is not a reliable restore-to-initial-state operation after scene movement; see [Current limitations](../known-limitations.md#scene-operations).

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
| `createChild` | `({ id?, className, transform? }) => StayAnimatedChild` | Create and append an animated Child with an optional static transform |
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

`CaptureSceneProps` is the export input. `SceneFragment` contains an `area` and Child fragments with `sourceId`, `className`, `shapes`, and `transform`. `sourceId` is correlation metadata; it is not reused as the imported Child id.

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

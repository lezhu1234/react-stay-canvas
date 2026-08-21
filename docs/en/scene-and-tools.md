# Scenes and StayTools

[中文](../zh/scene-and-tools.md) · [Documentation home](./README.md) · [Interaction and events](./interaction-and-events.md)

Every `StayCanvas` owns an independent `StayTools` instance. It is the high-level entry point for reading and changing that scene: create and query objects, pan and zoom, record history, copy scenes, capture regions, and dispatch manual actions.

## Get the tools for one Canvas

The usual entry point is `mounted`:

```tsx
const toolsRef = useRef<StayTools | null>(null)

<StayCanvas
  width={720}
  height={420}
  mounted={(tools) => {
    toolsRef.current = tools
  }}
/>
```

A `StayTools` instance belongs to exactly one Canvas. Do not use the source Canvas tools to manipulate a Child owned by a target Canvas, and do not call a stale tools reference after its component unmounts.

## Create, read, and remove

```ts
const child = tools.appendChild({
  id: "node-a",
  className: "node:selected",
  shape: new Rectangle({ x: 20, y: 20, width: 120, height: 72 }),
})

tools.hasChild("node-a")
tools.getChildById<Rectangle>("node-a")
tools.getChildBySelector<Rectangle>("#node-a")
tools.getChildrenBySelector<Rectangle>(".node")

await tools.removeChild(child.id)
```

`getChildrenWithoutRoot()` returns the Children created by application code. The internal root Child represents Canvas bounds and cannot be removed; most whole-scene application logic should exclude it as well.

## Selector queries

Tool queries use the selector expression language below. Listener `selector` accepts the same string expressions, but not string arrays or selector functions:

- `#node-a` selects by id;
- `.node` selects a base class and also matches a colon suffix such as `node:selected`;
- `.node:selected` selects that exact full class name;
- `#node-a|.label` is a union;
- `#node-a&.node` intersects an id with its base class;
- `.node&!#node-a` excludes one id from a class;
- parentheses group expressions;
- `(child) => boolean` handles custom filtering in tool-query APIs only.

```ts
const selectedNodes = tools.getChildrenBySelector(
  ".node:selected",
  (a, b) => b.shape.zIndex - a.shape.zIndex,
)
```

`sortBy` controls the returned order and which item `getContainPointChildren({ returnFirst: true })` picks. Use a stable comparator so overlapping objects do not produce inconsistent selections.

## Point hits and area queries

```ts
const [frontmost] = tools.getContainPointChildren<Rectangle>({
  selector: ".node",
  point: { x: 180, y: 120 },
  sortBy: (a, b) => b.shape.zIndex - a.shape.zIndex,
  returnFirst: true,
  withRoot: false,
})

const inside = tools.getChildrenByArea(
  { x: 40, y: 40, width: 300, height: 200 },
  ".node",
)
```

`getContainPointChildren()` calls each Child's `containsPointer()`, which depends on Shape `contains()` implementations. Text and lines are not hittable by default, so group them with hittable geometry when they need an interaction region.

`getChildrenByArea()` currently checks whether the center of any Shape lies inside the area. It is not equivalent to full bounding-box containment or rectangle intersection. Implement and test those product semantics explicitly in a function selector or application layer when required.

## Pan the scene

At the start of one continuous pan, call `moveStart()` to snapshot Shape origins. Then call `move()` with offsets relative to that gesture start:

```ts
tools.moveStart()

await tools.move(offsetX, offsetY, (child) => {
  return child.id !== "fixed-toolbar"
})
```

Non-root Children for which `filter` returns `false` are not moved. The root Child always participates in global transforms so scene coordinates remain aligned with Canvas bounds.

To move one object, call that Child's `moveInit()` and `move()` instead of traversing the entire scene.

## Zoom around a point

```ts
await tools.zoom(deltaY, { x: pointerX, y: pointerY }, (child) => {
  return !child.className.includes("screen-ui")
})
```

`deltaY` follows wheel direction. The internal scale step is `1 + deltaY * -0.001`, so negative values zoom in and positive values zoom out. The center is in Canvas-local coordinates.

`reset()` exists on `StayTools`, but it is not currently a reliable inverse after a scene move because it reuses the previous movement snapshot. Do not use it as a restore-to-initial-state operation; see [Current limitations](./known-limitations.md#scene-operations).

## History transactions

History is not automatic. Call `log()` when one business operation is complete:

```ts
const child = tools.appendChild({
  className: "annotation",
  shape: new Rectangle({ x: 20, y: 20, width: 80, height: 60 }),
})

tools.log()

await tools.removeChild(child.id)
tools.log()

tools.undo()
tools.redo()
```

The transaction boundaries are:

- `appendChild()` and `removeChild()` mark static Children as pending history changes;
- `log()` groups changes since the previous snapshot into one history item;
- several mutations followed by one `log()` become one undo unit;
- recording a new operation after `undo()` truncates the previous redo tail;
- animated Children never enter history and removing one cannot be undone;
- `undo()` and `redo()` also restore the Canvas state captured with the item.

A pure Shape `update()` does not add an existing Child to the pending-history set, so calling `log()` only at drag end does not reliably record that movement. When an update must be undoable, use an explicit remove/append replacement with the same id as demonstrated by the Annotator example. Do not assume that `log()` scans every Child.

## Copy a scene between Canvases

`exportChildren()` calls each Child's current `copy()` implementation and returns those copies plus a source area. `importChildren()` maps them into a target area:

```ts
const scene = sourceTools.exportChildren({
  children: sourceTools.getChildrenBySelector(".asset"),
  area: { x: 0, y: 0, width: 360, height: 220 },
})

targetTools.importChildren(scene, {
  x: 24,
  y: 24,
  width: 720,
  height: 440,
})
```

Source and target areas must have the same aspect ratio or the method throws `area not match`. Import creates new Child ids while copying class names and current `shapeMap` contents; do not expect source ids to survive in the target Canvas.

This is a geometry-transfer path, not a fully state-preserving serialization format. Built-in copies currently omit some common Shape state, may share nested style values, and reduce animated Children to static snapshots. See [Current limitations](./known-limitations.md#scene-operations).

`importChildren()` copies `scene.children` before moving and zooming its internal copies. The same exported payload can therefore be imported repeatedly into different Canvases or target areas without mutating the input data.

When `exportChildren()` omits `area`, it uses the source root bounds. When `importChildren()` omits its target area, it uses the target root bounds.

## Render a region to a standalone Canvas

```ts
const snapshotCanvas = await tools.regionToTargetCanvas({
  area: { x: 0, y: 0, width: 360, height: 220 },
  targetSize: { width: 720, height: 440 },
  children: tools.getChildrenWithoutRoot(),
})

const png = snapshotCanvas.toDataURL("image/png")
```

`regionToTargetCanvas()` returns an `HTMLCanvasElement` that is not mounted in the DOM. It force-draws the supplied Children in layer and `zIndex` order. When `progress` is supplied, animated Children seek to that millisecond time, including `progress: 0`, while static Children remain unchanged.

The current implementation does not automatically translate `area` or scale it into `targetSize`; it is closer to drawing current scene coordinates onto another Canvas. For true crop or scale behavior, first export/import into the target coordinate system or apply an explicit application-level transform.

## Other tools

```ts
tools.changeCursor("grabbing")
tools.refresh()
tools.switchState("editing")
tools.deleteListener("temporary-listener")
```

- `changeCursor()` changes the CSS cursor on the top Canvas layer;
- `refresh()` forces every layer to redraw. Same-layer Shape updates dirty their current layer automatically; use `refresh()` after changing a Shape's `layer`, for external-resource changes, or for diagnostics;
- `switchState()` changes Listener state and clears `stateStore`;
- `deleteListener()` removes a Listener by its unique name;
- `getAvailiableStates()` returns known states matching a state expression. The public method retains this historical spelling and must currently be called exactly as written.

For `triggerAction()` and the React ref `trigger()` input contract, see [Interaction and events: Trigger actions manually](./interaction-and-events.md#trigger-actions-manually).

## Next steps

- [StayTools API](./api/stay-tools.md)
- [StayCanvas API](./api/stay-canvas.md)
- [Transfer example](https://lezhu1234.github.io/react-stay-canvas/#/simple/transfer)
- [History example](https://lezhu1234.github.io/react-stay-canvas/#/simple/history)

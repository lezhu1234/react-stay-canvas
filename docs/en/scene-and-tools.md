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

Applications can choose their own business Children, merge their Content bounds, and explicitly fit them into the current View:

```ts
const children = tools.getChildrenBySelector(".node|.edge")
const bounds = unionRects(children.map((child) => child.getBound()))

if (bounds) tools.viewport.fit(bounds, { padding: 32 })
```

The library performs the geometry and viewport calculation, while the application decides which Children count as scene content and when fitting should run.

## Place one Child without rewriting geometry

Every Child owns one local-to-Content `placement`. An affine placement accepts semantic fields:

```ts
const plane = tools.appendChild({
  className: "plane",
  placement: {
    type: "affine",
    x: 180,
    y: 96,
    rotation: -6,
    skewX: -18,
    scaleY: 0.78,
    origin: { x: 0, y: 0 },
  },
  shape: [background, ...gridLines, label],
})

plane.setPlacement({ type: "affine", x: 220, y: 120, rotation: 12 })
const local = plane.toLocalPoint(e.point)
const content = local && plane.toContentPoint(local)
```

`x`, `y`, `origin`, scale, rotation, and skew define one non-destructive affine placement. Rotation and skew use degrees. The matrix is composed as `translate(x, y) · translate(origin) · rotate · skew · scale · translate(-origin)`. `scaleX` and `scaleY` default to `1`; all other values default to `0`.

Advanced affine callers may pass `{ type: "affine", matrix: { a, b, c, d, e, f } }`. For a perspective plane, map its finite local rectangle to four named Content corners:

```ts
plane.setPlacement(projectivePlacementFromQuad(
  { x: 0, y: 0, width: 320, height: 180 },
  {
    topLeft: { x: 24, y: 18 },
    topRight: { x: 350, y: 42 },
    bottomRight: { x: 332, y: 210 },
    bottomLeft: { x: 12, y: 232 },
  }
))
```

`projectivePlacementFromQuad()` returns the same public `{ type: "projective", matrix, domain }` placement accepted by `appendChild()`, `createChild()`, and `setPlacement()`; callers that already own a homography may pass that raw placement directly. Corners are named in clockwise order so the helper can validate the finite mapping without making rendering or interaction decisions for the application.

The projective domain must be finite, positive, and remain on one side of the homogeneous horizon. Points outside it map to `undefined`. `child.placement` returns a discriminated snapshot; `setPlacement()` replaces the complete placement rather than merging fields. Rendering, bounds, hit testing, tool queries, event routing, history, scene transfer, and region capture all read that same value. `e.point` remains in Content.

Static placement changes participate in the next `log()` transaction. Animated Children may use one static placement, but placement keyframes and interpolation are not part of the current contract.

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

For an initialized editor, call `resetHistory()` after loading non-undoable background content. It clears both history stacks and treats the current static scene as the new baseline.

The transaction boundaries are:

- `appendChild()`, `removeChild()`, normal Shape mutations, and `child.setPlacement()` mark static Children as pending history changes;
- `tools.webgl.appendChild()`, `tools.webgl.removeChild()`, and Mesh geometry/model/material mutations enter the same pending set and transaction;
- `log()` groups changes since the previous snapshot into one history item;
- `resetHistory()` clears undo/redo and makes the current static scene the baseline;
- several mutations followed by one `log()` become one undo unit;
- recording a new operation after `undo()` truncates the previous redo tail;
- animated Children never enter history and removing one cannot be undone;
- camera changes remain display state and are not recorded;
- `undo()` and `redo()` also restore the Canvas state captured with the item.

## Copy a scene between Canvases

`exportChildren()` captures the selected Children's current Shape state as a reusable scene fragment. `importChildren()` materializes that fragment in a target area:

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

Source and target areas must have the same aspect ratio or the method throws `area not match`. Each exported Child fragment contains `sourceId`, `className`, `shapes`, and its resolved local-to-Content `placement`. Import creates a new runtime Child id; use `sourceId` only to correlate imported objects with their source objects.

This is a scene-transfer path, not a serialization format. Common Shape state and library-owned mutable style values are captured independently. Arbitrary values inside `shapeStore` remain shared because the library cannot infer their ownership. Animated Children contribute their current rendered projection, not their timeline.

`importChildren()` materializes fresh Shapes before moving and zooming them. The same exported payload can therefore be imported repeatedly into different Canvases or target areas without mutating the input data.

When `exportChildren()` omits `area`, it uses the source root bounds. When `importChildren()` omits its target area, it uses the target root bounds.

Native Mesh scenes use their separate ownership-preserving transfer surface:

```ts
const fragment = sourceTools.webgl.exportChildren(
  sourceTools.webgl.getChildrenBySelector(".plane"),
)
const imported = targetTools.webgl.importChildren(fragment)
```

Each imported Child receives a new id and independent Mesh geometry, normals, model matrices, and material values. The target WebGL2 layer config continues to own its camera, environment, and lights; that display state is not transferred. Mesh transfer has no 2D `area` or Child placement because its geometry already lives in the native scene's world space.

## Render a region to a standalone Canvas

```ts
const snapshotCanvas = await tools.regionToTargetCanvas({
  area: { x: 0, y: 0, width: 360, height: 220 },
  targetSize: { width: 720, height: 440 },
  children: tools.getChildrenWithoutRoot(),
})

const png = snapshotCanvas.toDataURL("image/png")
```

`regionToTargetCanvas()` returns an `HTMLCanvasElement` that is not mounted in the DOM. It clips to `area`, then scales that region uniformly and centers it inside `targetSize`; any space left by a different aspect ratio stays transparent. Shapes still draw in layer and `zIndex` order, and the call does not move or zoom the source Children.

When `progress` is supplied, animated Children temporarily project the requested millisecond time, including `progress: 0`, while static Children remain unchanged. Their previous live projections are restored after drawing, so capturing a frame does not move the playback position.

## Other tools

```ts
tools.changeCursor("grabbing")
tools.refresh()
tools.switchState("editing")
tools.deleteListener("temporary-listener")
```

- `changeCursor()` changes the CSS cursor on the top Canvas layer;
- `refresh()` forces every layer to redraw. Shape updates dirty their affected layers automatically; use `refresh()` for external-resource changes or diagnostics;
- `switchState()` changes Listener state and clears `stateStore`;
- `deleteListener()` removes a Listener by its unique name;
- `getAvailiableStates()` returns known states matching a state expression. The public method retains this historical spelling and must currently be called exactly as written.

For `triggerAction()` and the React ref `trigger()` input contract, see [Interaction and events: Trigger actions manually](./interaction-and-events.md#trigger-actions-manually).

## Next steps

- [StayTools API](./api/stay-tools.md)
- [StayCanvas API](./api/stay-canvas.md)
- [Transfer example](https://lezhu1234.github.io/react-stay-canvas/#/simple/transfer)
- [History example](https://lezhu1234.github.io/react-stay-canvas/#/simple/history)

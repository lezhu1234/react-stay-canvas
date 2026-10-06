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

## Append complete timeline steps

Use `tools.scene.appendStep()` when work produces one complete target step at a time. Every submission describes all Children and named Shapes that exist at that step:

```ts
const controller = new AbortController()

tools.scene.appendStep({
  revision: "step-0",
  resourceRevision: "fonts-4",
  durationMs: 0,
  children: [{
    id: "value-1",
    className: "value",
    shapes: new Map([["body", new Rectangle({
      x: 20, y: 20, width: 80, height: 40,
      transition: { type: "easeInOutSine" },
    })]]),
  }],
}, { signal: controller.signal })

const accepted = tools.scene.appendStep({
  revision: "step-1",
  resourceRevision: "fonts-4",
  durationMs: 180,
  children: [{
    id: "value-1",
    className: "value",
    shapes: new Map([["body", new Rectangle({
      x: 180, y: 20, width: 80, height: 40,
      transition: { type: "easeInOutSine" },
    })]]),
  }],
}, { signal: controller.signal })

tools.progress({ timeMs: accepted.endTimeMs - 90 })
```

The first step normally has `durationMs: 0`. Later `durationMs` values define the entire added interval; each target Shape keeps its easing type. Input Shape delay and duration do not create a second clock. A Shape omitted from a complete step exits to its native transparent zero Shape, and a later reappearance enters from zero. Omitting a Child applies that rule to all of its tracks, while keeping its timeline available for earlier seeks.

Equal native endpoints are stored once. Their elapsed intervals become a hold before the next changed endpoint, so integer and fractional sampling stay on the same native timeline without copied history prefixes. `appendStep()` does not move the current playback time. When the current sample already falls inside the newly accepted interval, the Canvas refreshes that same sample; appending a later interval leaves the current projection unchanged.

Acceptance is synchronous and does not wait for `requestAnimationFrame`. The returned `SceneStepReceipt` reports `revision`, `resourceRevision`, and the accepted `endTimeMs`; it does not claim that a display frame has painted. All Children are prepared before publication, so cancellation or an invalid later Child leaves the accepted timeline and visible projection unchanged.

`className` and `placement` remain static Child metadata. A later step must keep the original class; it may omit placement or repeat the same placement, but it cannot animate or replace it. Steps must also keep the current `resourceRevision`. Use the whole-scene `prepare()` and `commit()` transaction when resources, static Child metadata, or an authored complete timeline must be replaced. That existing transaction still commits at a display-frame boundary.

Replacement preparation also accepts a `SceneStepSequenceSubmission` with `{ revision, resourceRevision, steps }`, where `steps` is an async iterator of complete steps. The library prepares the pending timeline through the same native append mechanism and releases each input step after consumption; the application need not retain a complete graphical history. The accepted scene, playback position and viewport remain available while the iterator runs. After all steps are prepared, `commit()` accepts the replacement once. Failed or cancelled preparation preserves the accepted scene. Each step must use the replacement's `resourceRevision`.

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

`sortBy` controls the returned query order and which item `getContainPointChildren({ returnFirst: true })` picks. Listener target routing uses a stable default when its own `sortBy` is omitted: smaller bounds first, equal bounds in scene insertion order, and root last. Tool queries do not apply this Listener default; they retain their selector result order unless the call supplies a comparator.

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

Use `tools.canUndo()` and `tools.canRedo()` to derive disabled states for history controls. They only inspect the committed history cursor and never perform an operation. Pending Canvas or application changes become visible to these queries only after `tools.log()`.

For an initialized editor, call `resetHistory()` after loading non-undoable background content. It clears both history stacks and treats the current static scene as the new baseline.

Application state can join the same transaction through the optional [`historyAdapter`](./api/stay-canvas.md#historyadapter). The adapter captures before/after snapshots on each explicit `log()` boundary; it does not own another stack. This also allows an application-only change to become a history item.

The transaction boundaries are:

- `appendChild()`, `removeChild()`, normal Shape mutations, and `child.setPlacement()` mark static Children as pending history changes;
- `tools.webgl.appendChild()`, `tools.webgl.removeChild()`, and Mesh geometry/model/material mutations enter the same pending set and transaction;
- `log()` groups changes since the previous snapshot into one history item, including application state when a `historyAdapter` is configured;
- `resetHistory()` clears undo/redo and makes the current static scene and adapted application state the baseline;
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

Each imported Child receives a new id and independent Mesh geometry, normals, model matrices, and material values, including Glass roughness and volume-attenuation settings. The target WebGL2 layer config continues to own its camera, environment, and lights; that display state is not transferred. Mesh transfer has no 2D `area` or Child placement because its geometry already lives in the native scene's world space.

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

`progress({ timeMs, bound: { beforeMs, afterMs } })` uses the two bound times as the interpolation endpoints for the sample at `timeMs`. This is useful when a caller owns a smaller playback interval: the native timeline still supplies the endpoint Shapes and their easing, while the bound sample controls the interpolation window.

## Own the canvas in a background thread

`StayCanvas` preserves its main-thread tools by default. Selecting `runtime={{ mode: "worker", createWorker }}` at creation transfers the DOM Canvas drawing surfaces to a library-owned worker. `mounted` receives an asynchronous `CanvasWorkerHandle` for seeking, playback, viewport commands and capture. Complete Children, Shapes and animation remain in the worker; the page receives notices, playback state and output Blobs.

The application registers its own program in a static worker entry, using an entry that does not load React:

```ts
import { installCanvasWorker, Rectangle } from "react-stay-canvas/worker"

installCanvasWorker<{ positions: readonly number[] }, number>({
  async run(input, context) {
    for (const [index, x] of input.positions.entries()) {
      const receipt = context.canvas.scene.appendStep({
        revision: `step-${index}`,
        resourceRevision: "geometry-v1",
        durationMs: index === 0 ? 0 : 100,
        children: [{
          id: "value", className: "value",
          shapes: new Map([["body", new Rectangle({
            x, y: 20, width: 40, height: 30,
            transition: { type: "linear" },
          })]]),
        }],
      }, { signal: context.signal })
      if (index === 0) context.canvas.progress({ timeMs: 0 })
      context.emit(receipt.endTimeMs)
      await context.yield()
    }
  },
})
```

The application defines the input and notices. The library does not interpret execution results, variables, themes or layout and does not serialize functions. Event listeners in `setup`, layer configuration and `onState` are registered locally in the static worker entry. Shapes, event routing, coordinates and drawing share the main-thread implementation. Worker events carry plain input data; synchronous DOM operations such as `preventDefault()` belong in the page-side `onInput` callback.

The application bundler discovers the worker factory, for example `() => new Worker(new URL("./canvas.worker.ts", import.meta.url), { type: "module" })`. The factory is selected when the component is created. Changing the factory or execution mode requires a new instance; active playback data is not migrated. Resizing only changes DOM dimensions and sends current measurements, without transferring a drawing surface again.

`handle.run(input, { signal, transfer })` accepts application input and transferable resources. A new task cancels and waits for the previous task to exit. `context.yield()` yields a message turn and checks cancellation. Failed preparation does not clear the accepted picture first. Use `scene.prepare()`/`scene.commit()` to atomically replace the first step of a new scene or resource set, then `appendStep()` for later complete targets. An append receipt means the data was accepted, not that the browser has displayed it. `handle.seek({ timeMs, bound })` and `handle.play({ toTimeMs, speed, bound })` expose the same bounded endpoint interpolation; `bound` is optional. `handle.viewport({ kind: "zoomBy", factor, viewAnchor })` accepts a point in View coordinates and converts it to the corresponding Content anchor before applying the native viewport zoom; pass `anchor` directly when it is already in Content coordinates. `handle.trigger(name, payload)` dispatches an application-defined manual action using only its name and plain payload data; it does not require a library-specific business event type. Asynchronous `handle.capture()` returns a PNG Blob without moving the live sample. Destruction releases the worker, DOM input and pending requests.

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

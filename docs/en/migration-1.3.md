# Migrating from 1.2.0 to 1.3.0

[Documentation home](./README.md) · [中文](../zh/migration-1.3.md)

Version 1.3.0 keeps the existing Shape/Child/Listener model and adds substantial editor-runtime capabilities. Two Shape behavior changes require attention: `Path` width configuration and the default `StayText` anchor. Review the behavior sections as well if the application depends on Canvas recreation, overlapping targets, or keyboard shortcuts.

## Before upgrading

- Pin `react-stay-canvas@1.3.0` while migrating instead of using a range.
- Run the application's TypeScript build; the declarations now expose coordinate spaces, Child placement, typed stores, and the supported Child update boundary more precisely.
- Exercise create, select, drag, release outside, resize, undo, redo, zoom, and pan in the real product flow.
- Do not rebuild `<StayCanvas>` from React state merely to reflect selection or geometry. Keep the Canvas runtime mounted and synchronize application state at explicit operation boundaries.

## Required code changes

### Replace Path radius

`Path` now paints one native stroked `Path2D`. The removed `radius` represented half the old path width, so multiply it by two when converting to `strokeConfig.lineWidth`.

```ts
// 1.2.0
new Path({
  points,
  radius: 5,
  fillConfig: {
    color: "#2563eb",
  },
})
```

```ts
// 1.3.0: preserves a total width of 10
new Path({
  points,
  strokeConfig: {
    color: "#2563eb",
    lineWidth: 10,
    lineCap: "round",
    lineJoin: "round",
  },
})
```

`Path` no longer accepts `fillConfig`: move the old `fillConfig.color` to `strokeConfig.color` so the path remains visible. Use `Polygon` only when the geometry is genuinely a closed fillable region. Path bounds and hit width are both derived from half of `strokeConfig.lineWidth`, and zoom scales the line width with the points.

### Adopt the native StayText anchor

In 1.2.0, the default `start + alphabetic` combination treated `(x, y)` as an upper-center box position. In 1.3.0, `(x, y)` is always the Canvas text anchor selected by `textAlign` and `textBaseline`.

```ts
// 1.2.0: (x, y) behaved like the upper-center of the text box
new StayText({ x, y, text: "Node" })
```

```ts
// 1.3.0: preserve that visual placement explicitly
new StayText({
  x,
  y,
  text: "Node",
  textAlign: "center",
  textBaseline: "top",
})
```

Callers that already supplied an explicit alignment and baseline should keep those values and verify the measured bounds. Drawing, bounds, movement, zoom, and timeline interpolation now share the same native anchor.

## Behavior changes to review

### Resize preserves runtime state

Changing `width` or `height` now resizes the existing Canvas and backing stores while preserving Children, Content geometry, listeners, history, and viewport state. Set `recreateOnResize` only when the application intentionally wants `mounted()` to rebuild the scene.

### Target ordering is deterministic

When a Listener omits `sortBy`, overlapping ordinary Children are considered by ascending combined-bound area, equal areas follow scene insertion order, and the root Child is last. Preserve a product-specific stacking rule by supplying it explicitly:

```ts
const listener: ListenerProps = {
  name: "select-frontmost",
  event: "mousedown",
  selector: ".node",
  sortBy: (a, b) => b.shape.zIndex - a.shape.zIndex,
  callback: ({ e }) => selectNode(e.target),
}
```

Tool queries do not inherit this Listener default; they keep their existing selector result order unless the query receives a comparator.

### Keyboard history shortcuts include Meta

Predefined `undo` and `redo` actions recognize Command/Meta on macOS in addition to Control on Windows/Linux. They remain action names: the application Listener still decides whether to call `tools.undo()` or `tools.redo()`. Cross-platform panning should use Space plus primary drag; the legacy Control-based predefined move condition remains only for compatibility.

## New optional capabilities

Application state can join the existing scene history without a hidden Child:

```tsx
<StayCanvas
  historyAdapter={{
    capture: () => structuredClone(documentRef.current),
    restore: (snapshot) => replaceDocument(snapshot),
  }}
/>
```

`tools.log()` remains the transaction boundary. `resetHistory()` creates a new scene/application baseline, and `canUndo()`/`canRedo()` expose the committed cursor state.

Listener stores can remain untyped, or opt into per-key value inference while using the same native Maps:

```ts
type RuntimeStore = {
  selectedId: string | null
  dirty: boolean
}

type ToolStateStore = {
  hoveredId: string | null
}

type SelectListener = ListenerProps<
  ListenerNamePayloadPair,
  "mousedown",
  Record<string, never>,
  RuntimeStore,
  ToolStateStore
>
```

Other optional additions include coordinate/viewport tools, affine or projective Child placement, `StayInstantChild.update()`, `Polygon`, reusable detached scene fragments, and mixed Canvas2D/WebGL2 layers. Adopt only the parts owned by the application; none are required for a basic Canvas2D scene.

## Upgrade checklist

- Replace every `Path.radius`, move `Path.fillConfig.color` to `Path.strokeConfig.color`, and remove `Path.fillConfig`.
- Check default-aligned `StayText` placement and bounds.
- Decide whether resize should preserve or recreate the runtime.
- Add explicit `sortBy` wherever product z-order must override the new default.
- Verify Command-Z and Command-Shift-Z on macOS, plus Control variants on Windows/Linux.
- Confirm React state updates do not recreate the Canvas runtime.
- Run the complete edit/history/viewport flow before widening the dependency range.

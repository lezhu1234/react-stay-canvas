# StayCanvas API

[中文](../../zh/api/stay-canvas.md) · [API index](../README.md#api-reference) · [Getting started](../getting-started.md)

```ts
import {
  AmbientLight,
  DirectionalLight,
  EnvironmentMap,
  PointLight,
  StayCanvas,
  PerspectiveCamera,
  type CanvasLayerConfig,
  type HistoryAdapter,
  type StayCanvasProps,
  type StayCanvasRefType,
  type WebGL2LayerConfig,
} from "react-stay-canvas"
```

`StayCanvas` creates a React container and a stack of equally sized, absolutely positioned `<canvas>` layers. Scene content is not passed as React children; create it with `StayTools` from `mounted` or event callbacks.

## Props

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `width` | `number` | `500` | CSS and logical View width; must be greater than zero |
| `height` | `number` | `500` | CSS and logical View height; must be greater than zero |
| `layers` | `number \| CanvasLayerConfig[]` | `2` | Canvas layer count or explicit Canvas2D/WebGL2 configuration per layer |
| `className` | `string` | `""` | Class name on the outer `<div>` |
| `eventList` | `EventProps[]` | `[]` | Event definitions registered during initialization |
| `listenerList` | `ListenerProps[]` | `[]` | Listeners registered during initialization |
| `mounted` | `(tools: StayTools) => void` | — | Called after each runtime instance is created |
| `passive` | `boolean` | `true` | Passive option for the wheel DOM listener |
| `recreateOnResize` | `boolean` | `false` | Opt into destructive runtime recreation when width or height changes |
| `focusOnInit` | `boolean` | `true` | Whether to focus the top Canvas after initialization |
| `viewport` | `{ minScale?, maxScale? }` | `{ minScale: 0.1, maxScale: 10 }` | Non-destructive viewport scale limits; fixed after runtime creation |
| `historyAdapter` | `HistoryAdapter<TSnapshot>` | — | Include application-owned state in the same undo/redo transactions as the Canvas scene |

### layers

A numeric value uses `canvas.getContext("2d")` for every layer:

```tsx
<StayCanvas width={720} height={420} layers={3} />
```

The legacy function-array form creates one Canvas per entry and calls the corresponding function with that Canvas. Every function must return a usable 2D drawing context. Descriptor entries make a backend explicit and may be mixed with legacy functions. A native WebGL2 layer requires one CPU-owned camera. It may also own an explicit equirectangular environment:

```tsx
<StayCanvas
  layers={[
    { backend: "canvas2d" },
    {
      backend: "webgl2",
      camera: new PerspectiveCamera({ position: [0, 0, 3], target: [0, 0, 0] }),
      environment: new EnvironmentMap({
        width: 1024,
        height: 512,
        data: environmentRgba8,
        intensity: 0.8,
      }),
      lights: [
        new AmbientLight({ intensity: 0.25 }),
        new DirectionalLight({
          directionToLight: [0.2, 0.4, 1],
          intensity: 0.8,
          shadow: { target: [0, 0, 0], width: 6, height: 4, near: 0.1, far: 20 },
        }),
        new PointLight({
          position: [-2, 3, 1],
          intensity: 12,
          range: 8,
        }),
      ],
      context: (canvas) => canvas.getContext("webgl2", { alpha: true, depth: true }),
      onContextRestored: () => console.info("WebGL2 layer restored"),
    },
  ]}
/>
```

Canvas2D remains the default. A WebGL2 layer is an opt-in native Mesh scene, not a Shape raster backend. Add Mesh children with `tools.webgl.appendChild()`; Canvas2D Shapes may target only Canvas2D layers, while a `StayWebGLChild` targets exactly one WebGL2 layer. Opaque Mesh visibility is depth-authoritative; Glass Meshes keep depth testing and stable-sort back to front after the opaque pass. Shape `zIndex` does not cross backend boundaries.

`lights` and `environment` are optional layer display state. `EnvironmentMap`, `AmbientLight`, `DirectionalLight`, and `PointLight` mutations invalidate only their owning WebGL2 layers, as camera mutations do; none is included in Child History or scene transfer. `EnvironmentMap` deep-copies a 2:1, row-major equirectangular sRGB RGBA8 image. The first row represents the +Y pole, horizontal pixels wrap around world Y, and `intensity` is a non-negative linear multiplier. Changing only intensity updates uniforms; changing pixels uploads the existing GPU texture and regenerates its roughness mip chain. One layer currently accepts up to four directional lights, four point lights, and one directional shadow map. `directionToLight` is a world-space vector from the surface toward the light and is normalized by the Light. `PointLight.position` is world-space; its radiance follows inverse-square attenuation. Omitting `range` gives unlimited reach, while a positive range applies a smooth fourth-power cutoff and contributes nothing outside that range. Point-light shadows are not supported. A DirectionalLight shadow uses an explicit orthographic camera (`target`, `up`, `distance`, `width`, `height`, `near`, `far`) plus `mapSize` and `bias`; the core does not automatically fit it to scene content. Changing only a light or shadow camera reuses Mesh geometry uploads. Shadow and environment GPU resources persist until their source, context, or layer lifetime requires a rebuild.

Backend failures are explicit. Failure to create WebGL2 or its linear scene target, context loss during a draw, invalid Mesh state, and GPU upload failures are not converted to Canvas2D. A lost WebGL2 layer pauses until the native context is restored. The layer runtime prevents the native loss event by default so the browser may restore its owned context; `onContextLost` observes that event without owning recovery. Restoration discards invalid GPU handles, rebuilds them lazily from CPU Mesh state, invalidates the layer, and then calls `onContextRestored`.

The array must contain at least one entry. Replacing layer descriptors during a normal React rerender does not migrate an existing runtime; use `reCreate()` when the backend or lifecycle callbacks change.

Shape `layer` values are zero-based and may target only Canvas2D layers. Negative Shape layers count from the end, so `-1` means the last layer. `StayWebGLChild.layer` is a non-negative WebGL2 layer index; wrong-backend and out-of-range assignments fail synchronously.

### eventList and listenerList lifecycle

These lists are read when a runtime is created. A React rerender that only replaces the arrays does not migrate registrations in the existing runtime. To apply new definitions:

1. render the latest props;
2. call `reCreate()` through the ref;
3. rebuild the scene and external references from the new `mounted` callback.

`reCreate()` destroys the previous input listeners, render loop, and scene objects. Treat previous `StayTools`, Child, and Shape references as stale afterward.

### historyAdapter

Use `historyAdapter` when one editor operation changes both Canvas objects and application-owned state:

```tsx
type EditorSnapshot = {
  activePage: number
  labels: Record<string, string>
}

<StayCanvas
  historyAdapter={{
    capture: () => structuredClone(editorStateRef.current),
    restore: (snapshot: EditorSnapshot) => updateEditorState(snapshot),
  }}
/>
```

The adapter does not create a second history stack. `log()` stores the before/after application snapshots on the same history item as pending static-Child changes; `undo()` restores the before snapshot and `redo()` restores the after snapshot. `resetHistory()` clears that shared stack and captures both the current scene and current application state as the new baseline. With an adapter, `log()` is an explicit commit even when only application state changed.

The library stores the value returned by `capture()` as-is: return an owned snapshot, using `structuredClone` or an application-specific immutable representation when necessary. `capture()` and `restore()` must be synchronous. `restore()` owns only application state; it must not mutate the Canvas scene or call `log()`, `undo()`, `redo()`, or `resetHistory()`. If `restore()` throws, Canvas objects and the history cursor are left at their current position.

The adapter is read when the runtime is created. A normal React rerender does not replace it; call `reCreate()` only when intentionally rebuilding the complete runtime and scene.

### recreateOnResize

With the default `false`, valid width and height changes resize the existing runtime. The Canvas elements, `StayTools`, Children, Shapes, placements, history, state, listeners, and viewport state retain their identity and values. Content geometry is not scaled, moved, or laid out again: shrinking clips more Content and expanding reveals more Content. The Root hit boundary follows the new View size, while the Content boundary represented by the Root Shape remains unchanged.

Resizing resets each native Canvas backing store, then invokes the original context resolver for every layer. Canvas2D layers repaint with the new `ShapeDrawProps.width` and `height`; WebGL2 layers retain their live program/buffer cache and use the new drawing-buffer aspect on their next dirty frame. An active Pointer Session is cancelled before the surface changes, using its last point in the old coordinate frame and `cancelReason: "resize"`.

With `recreateOnResize={true}`, every valid size change instead destroys the previous instance, creates a new one, and calls `mounted` again. Use this only when application code intentionally rebuilds or lays out the entire scene; previous runtime and Child references become stale.

### passive

`passive` currently applies only to the wheel DOM listener. Set it to `false` when an Event or Listener needs to call `preventDefault()` on a wheel `originEvent`:

```tsx
<StayCanvas passive={false} />
```

## Ref

```tsx
const canvasRef = useRef<StayCanvasRefType>(null)

<StayCanvas ref={canvasRef} />
```

| Method | Signature | Meaning |
| --- | --- | --- |
| `trigger` | `(name, payload?) => void` | Manually dispatch an action using a plain `Event` |
| `reCreate` | `() => void` | Destroy the current runtime and rebuild from latest props |
| `focus` | `() => void` | Focus the top Canvas so keyboard input can reach it |

`trigger()` does not include pointer position, keyboard key, or a hit target. Do not assume those fields exist because the action is named `drag` or `click`; see [Trigger actions manually](../interaction-and-events.md#trigger-actions-manually).

## DOM structure and layout

The outer container uses:

```css
display: flex;
position: relative;
width: <width>px;
height: <height>px;
```

Each Canvas is absolutely positioned at `(0, 0)`. `width` and `height` define the logical View and bitmap resolution; a wider parent does not stretch it automatically. Responsive layouts have three distinct options:

- Change the logical drawing size by passing new numeric dimensions. The existing scene and viewport are preserved by default.
- Enable `recreateOnResize` when a size change must intentionally rebuild and lay out the scene from `mounted`.
- Preserve the logical scene while applying a positive, axis-aligned CSS scale to the rendered Canvas or one of its wrappers. Native pointer input is normalized from the rendered bounding rectangle into Canvas-local logical coordinates before event routing.

The third option only changes presentation and does not increase bitmap resolution. Keep the rendered scale stable during an active Pointer Session; changing CSS layout in the middle of one interaction is outside this contract. Rotation, skew, and mirroring do not have defined coordinate behavior.

`viewport` is not React-controlled state. Use [`tools.viewport`](./stay-tools.md#non-destructive-viewport) to pan, zoom, or restore the runtime. It only changes the Content-to-View projection; it does not mutate Children or Shapes.

## Related reference

- [Core concepts: Canvas and layers](../core-concepts.md)
- [Interaction and events](../interaction-and-events.md)
- [StayTools API](./stay-tools.md)

# StayCanvas API

[中文](../../zh/api/stay-canvas.md) · [API index](../README.md#api-reference) · [Getting started](../getting-started.md)

```ts
import {
  StayCanvas,
  type CanvasLayerConfig,
  type StayCanvasProps,
  type StayCanvasRefType,
  type WebGLLayerConfig,
} from "react-stay-canvas"
```

`StayCanvas` creates a React container and a stack of equally sized, absolutely positioned `<canvas>` layers. Scene content is not passed as React children; create it with `StayTools` from `mounted` or event callbacks.

## Props

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `width` | `number` | `500` | CSS and logical View width; must be greater than zero |
| `height` | `number` | `500` | CSS and logical View height; must be greater than zero |
| `layers` | `number \| CanvasLayerConfig[]` | `2` | Canvas layer count or explicit Canvas2D/WebGL configuration per layer |
| `className` | `string` | `""` | Class name on the outer `<div>` |
| `eventList` | `EventProps[]` | `[]` | Event definitions registered during initialization |
| `listenerList` | `ListenerProps[]` | `[]` | Listeners registered during initialization |
| `mounted` | `(tools: StayTools) => void` | — | Called after each runtime instance is created |
| `passive` | `boolean` | `true` | Passive option for the wheel DOM listener |
| `recreateOnResize` | `boolean` | `false` | Opt into destructive runtime recreation when width or height changes |
| `focusOnInit` | `boolean` | `true` | Whether to focus the top Canvas after initialization |
| `viewport` | `{ minScale?, maxScale? }` | `{ minScale: 0.1, maxScale: 10 }` | Non-destructive viewport scale limits; fixed after runtime creation |

### layers

A numeric value uses `canvas.getContext("2d")` for every layer:

```tsx
<StayCanvas width={720} height={420} layers={3} />
```

The legacy function-array form creates one Canvas per entry and calls the corresponding function with that Canvas. Every function must return a usable 2D drawing context. Descriptor entries make a backend explicit and may be mixed with legacy functions:

```tsx
<StayCanvas
  layers={[
    { backend: "canvas2d" },
    {
      backend: "webgl",
      context: (canvas) => canvas.getContext("webgl", { alpha: true }),
      onContextLost: (event) => event.preventDefault(),
      onContextRestored: () => console.info("WebGL layer restored"),
    },
  ]}
/>
```

Canvas2D remains the default. A WebGL layer is opt-in and consumes the same globally ordered RenderPlan, so affine and projective Shapes retain their `zIndex` order within that layer. Shapes still use their normal Canvas2D drawing contract; the WebGL backend rasterizes affine runs and finite projective Shapes, then composites them in order. A pass containing projective content currently requires `source-over` composition.

Backend failures are explicit. Failure to create WebGL, context loss during a draw, unsupported composition, invalid projective geometry, and texture-limit overflow are not converted to Canvas2D. A lost WebGL layer pauses until the native context is restored. `onContextLost` receives the native cancelable event; call `preventDefault()` there when the application wants the browser to restore it. Restoration resolves the configured context again and invalidates that layer for repaint before calling `onContextRestored`.

The array must contain at least one entry. Replacing layer descriptors during a normal React rerender does not migrate an existing runtime; use `reCreate()` when the backend or lifecycle callbacks change.

Shape `layer` values are zero-based. Negative values count from the end, so `-1` means the last layer. A positive index greater than or equal to the layer count, or a negative index still below zero after conversion, throws `layer is out of range`.

### eventList and listenerList lifecycle

These lists are read when a runtime is created. A React rerender that only replaces the arrays does not migrate registrations in the existing runtime. To apply new definitions:

1. render the latest props;
2. call `reCreate()` through the ref;
3. rebuild the scene and external references from the new `mounted` callback.

`reCreate()` destroys the previous input listeners, render loop, and scene objects. Treat previous `StayTools`, Child, and Shape references as stale afterward.

### recreateOnResize

With the default `false`, valid width and height changes resize the existing runtime. The Canvas elements, `StayTools`, Children, Shapes, placements, history, state, listeners, and viewport state retain their identity and values. Content geometry is not scaled, moved, or laid out again: shrinking clips more Content and expanding reveals more Content. The Root hit boundary follows the new View size, while the Content boundary represented by the Root Shape remains unchanged.

Resizing resets each native Canvas backing store, then invokes the original context resolver for every layer so it can restore context-owned state. Every drawable layer repaints with the new `ShapeDrawProps.width` and `height`. An active Pointer Session is cancelled before the surface changes, using its last point in the old coordinate frame and `cancelReason: "resize"`.

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

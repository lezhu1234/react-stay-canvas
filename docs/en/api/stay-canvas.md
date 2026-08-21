# StayCanvas API

[中文](../../zh/api/stay-canvas.md) · [API index](../README.md#api-reference) · [Getting started](../getting-started.md)

```ts
import {
  StayCanvas,
  type StayCanvasProps,
  type StayCanvasRefType,
} from "react-stay-canvas"
```

`StayCanvas` creates a React container and a stack of equally sized, absolutely positioned `<canvas>` layers. Scene content is not passed as React children; create it with `StayTools` from `mounted` or event callbacks.

## Props

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `width` | `number` | `500` | CSS and scene width; must be greater than zero |
| `height` | `number` | `500` | CSS and scene height; must be greater than zero |
| `layers` | `number \| ContextLayerSetFunction[]` | `2` | Canvas layer count or one custom 2D-context setter per layer |
| `className` | `string` | `""` | Class name on the outer `<div>` |
| `eventList` | `EventProps[]` | `[]` | Event definitions registered during initialization |
| `listenerList` | `ListenerProps[]` | `[]` | Listeners registered during initialization |
| `mounted` | `(tools: StayTools) => void` | — | Called after each runtime instance is created |
| `passive` | `boolean` | `true` | Passive option for the wheel DOM listener |
| `recreateOnResize` | `boolean` | `false` | Whether width or height changes recreate the runtime |
| `focusOnInit` | `boolean` | `true` | Whether to focus the top Canvas after initialization |

### layers

A numeric value uses `canvas.getContext("2d")` for every layer:

```tsx
<StayCanvas width={720} height={420} layers={3} />
```

The function-array form creates one Canvas per entry and calls the corresponding function with that Canvas. The array must contain at least one function, and each function must return a usable 2D drawing context.

Shape `layer` values are zero-based. Negative values count from the end, so `-1` means the last layer. A positive index greater than or equal to the layer count, or a negative index still below zero after conversion, throws `layer is out of range`.

### eventList and listenerList lifecycle

These lists are read when a runtime is created. A React rerender that only replaces the arrays does not migrate registrations in the existing runtime. To apply new definitions:

1. render the latest props;
2. call `reCreate()` through the ref;
3. rebuild the scene and external references from the new `mounted` callback.

`reCreate()` destroys the previous input listeners, render loop, and scene objects. Treat previous `StayTools`, Child, and Shape references as stale afterward.

### recreateOnResize

With the default `false`, width and height prop changes after initialization do not rebuild the runtime. With `true`, every valid size change destroys the previous instance, creates a new one, and calls `mounted` again. This is not a content-preserving resize; application code must rebuild the scene.

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

Each Canvas is absolutely positioned at `(0, 0)`. `width` and `height` define the real drawing size; a wider parent does not stretch it automatically. Responsive layouts should compute explicit numeric dimensions in application code and enable `recreateOnResize` when rebuilding is intended.

## Related reference

- [Core concepts: Canvas and layers](../core-concepts.md)
- [Interaction and events](../interaction-and-events.md)
- [StayTools API](./stay-tools.md)

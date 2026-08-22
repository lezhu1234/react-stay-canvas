# Children and Shapes API

[中文](../../zh/api/children-and-shapes.md) · [Shapes and animation](../shapes-and-animation.md) · [Custom Shapes](../advanced/custom-shapes.md)

## StayInstantChild

Create a static Child with `tools.appendChild(...)`.

### Properties

| Property | Type | Meaning |
| --- | --- | --- |
| `id` | `string` | Explicit id or generated uuid |
| `className` | `string` | One base class with an optional `:` suffix, such as `node:active` |
| `shape` | `T` | First Shape in `shapeMap` |
| `shapeMap` | `Map<string, T>` | All Shapes in the Child |
| `canvas` | `Canvas` | Owning Canvas runtime |
| `participatesInHistory` | `boolean` | `true` for static Children |

### Common methods

| Method | Returns | Meaning |
| --- | --- | --- |
| `getShape()` | `T` | Same value as `shape` |
| `getBound()` | `Rect` | Union of all Shape bounds |
| `containsPointer(point)` | `boolean` | True when any Shape is hit |
| `inArea(area)` | `boolean` | True when any Shape center is inside the area |
| `moveInit()` | `void` | Snapshot the start of continuous movement |
| `move(offsetX, offsetY)` | `void` | Move every Shape as a unit |
| `zoom(deltaY, center)` | `void` | Zoom every Shape as a unit |
| `getLayers()` | `Set<number>` | Layers used by the Child |
| `getShapes(layer)` | `T[]` | Shapes on one layer |

`update(...)` is an internal replacement primitive for history restoration. Application code should call `child.shape.update(...)` or retrieve a specific Shape from `shapeMap` and update that Shape.

Children are Canvas-bound runtime entities and do not expose a copy operation. Use `exportChildren()` and `importChildren()` to capture and materialize a reusable scene fragment.

## StayAnimatedChild

`tools.createChild(...)` creates a `StayAnimatedChild`. It inherits the query and drawing interface of a static Child, while its current Shapes are interpolated from the timeline.

| Property or method | Meaning |
| --- | --- |
| `shapeFramesMap` | `Map<string, AnimatedShape[]>`; each key is one slice |
| `totalDurationMs` | Duration of the longest slice |
| `appendKeyFrame(name, shape, prependZeroShape?)` | Append one keyframe to a slice |
| `appendKeyFrames(frameMap, prependZeroShape?)` | Append frames to several slices |
| `appendDefaultFrame(shape, prependZeroShape?)` | Append to the `default` slice |
| `getSlice(name)` | Return a slice or an empty array |
| `hasSlice(name)` | Test whether a slice exists |
| `getSliceTotalDurationMs(name)` | Sum delay and duration for one slice |
| `disappear(transition?, mode?)` | Append a transparent zero frame to each slice |
| `setCurrentTime({ time, bound? })` | Compute interpolated Shapes; normally called through `tools.progress()` |
| `participatesInHistory` | Always `false` |

`disappear(..., "afterEach")` appends a transparent frame at each slice's own end. With the default zero-duration transition, disappearance is immediate; pass a non-zero transition to animate it. `"afterAll"` adds delay so every slice begins its disappearance after the longest timeline has completed.

## Common ShapeProps

| Property | Type | Default | Meaning |
| --- | --- | --- | --- |
| `layer` | `number` | `0` | Native Canvas layer index |
| `zIndex` | `number` | `1` | Ordering within a layer |
| `strokeConfig` | `CanvasStrokeProps` | transparent | Color, width, dash, and join style |
| `fillConfig` | `CanvasFillProps` | transparent | Fill color |
| `globalConfig` | `CanvasGlobalProps` | `source-over` | Composite mode |
| `state` | `string` | `default` | Shape-local drawing state |
| `stateDrawFuncMap` | `ShapeProps["stateDrawFuncMap"]` | built-in default | Drawing-stage overrides per Shape state |
| `shapeStore` | `Map<string, any>` | new Map | Shape-local storage |
| `zoomY` | `number` | `1` | Accumulated zoom |
| `zoomCenter` | `PointType` | `{ x: 0, y: 0 }` | Current zoom center |

Shape state and Listener state are separate concepts. `Shape.switchState()` changes one Shape's drawing functions; `tools.switchState()` changes which Listeners can fire.

## Style types

```ts
interface CanvasStrokeProps {
  color?: RGBA
  lineWidth?: number
  dash?: number[]
  dashOffset?: number
  lineCap?: CanvasLineCap
  lineJoin?: CanvasLineJoin
  miterLimit?: number
}

interface CanvasFillProps {
  color?: RGBA
}

interface CanvasGlobalProps {
  gco?: GlobalCompositeOperation
}
```

## Built-in constructor fields

| Type | Required geometry/content | Type-specific optional fields |
| --- | --- | --- |
| `Rectangle` | `x`, `y`, `width`, `height` | `filter` |
| `Circle` | `x`, `y`, `radius` | — |
| `Line` | `x1`, `y1`, `x2`, `y2` | — |
| `StayText` | `x`, `y`, `text` | `font`, `decoration`, `border`, `offsetXRatio`, `offsetYRatio`, `textBaseline`, `textAlign`, `autoTransitionDiffText` |
| `StayImage` | `image`, `x`, `y`, `width`, `height`, `opacity` | `sx`, `sy`, `swidth`, `sheight`, `imageLoaded` |
| `Point` | `x`, `y` | — |
| `Path` | `points`, `radius` | — |

Every constructor also accepts common `ShapeProps`. `Rectangle`, `StayText`, and `StayImage` additionally accept `transition`. `Line` is implemented as an animated Shape, but its current exported `LineProps` does not accept `transition`.

`StayImage` uses the image's natural size when `swidth` or `sheight` is omitted. Explicit source-crop dimensions are preserved during construction, update, and copy. Timeline interpolation does not currently preserve custom crop dimensions; see [Current limitations](../known-limitations.md#rendering-and-geometry).

`CircleAttr` also retains `stroke` and `fill` fields, but the current constructor does not use them; use `strokeConfig` and `fillConfig` consistently. `StayText` likewise does not carry `decoration` into its current drawing state, so do not rely on it as a stable visual effect.

## Font and transition

| Font field | Type | Meaning |
| --- | --- | --- |
| `size` | `number` | Font size |
| `fontFamily` | `string` | Font family |
| `fontWeight` | `number` | Font weight |
| `italic` | `boolean` | Italic style |
| `underline` | `boolean` | Underline |
| `strikethrough` | `boolean` | Strikethrough |

| Transition field | Type | Meaning |
| --- | --- | --- |
| `type` | `EasingFunction` | Easing name |
| `durationMs` | `number` | Interpolation time arriving at the current frame |
| `delayMs` | `number` | Time to hold the previous frame before interpolation |

## ShapeDrawProps

| Field | Type | Meaning |
| --- | --- | --- |
| `context` | `CanvasRenderingContext2D \| OffscreenCanvasRenderingContext2D` | Drawing context for the current layer |
| `now` | `number` | Current draw timestamp |
| `width`, `height` | `number` | Logical Canvas dimensions |
| `forchDraw` | `boolean?` | Internal force-draw flag; the public spelling is retained as-is |

## InstantShape protocol

A custom static Shape implements:

```ts
abstract copy(): InstantShape
abstract commonDraw(props: ShapeDrawProps): void
abstract stroke(props: ShapeDrawProps): void
abstract fill(props: ShapeDrawProps): void
abstract move(offsetX: number, offsetY: number): void
abstract update(props: ShapeProps): InstantShape
abstract zoom(zoomScale: number): void
abstract getBound(): Rect
```

The base class provides rectangular `contains()`, `getCenterPoint()`, `applyUpdate()`, coordinate helpers for zoom, and style application. Non-rectangular geometry should override `contains()`.

## Additional AnimatedShape protocol

| Method | Responsibility |
| --- | --- |
| `getTransProps()` | List recursively interpolated fields |
| `intermediateState(before, after, ratio, type)` | Create an intermediate Shape |
| `zeroShape(shapeFramesMap)` | Create a transparent zero frame |
| `childSameAs(shape)` | Compare subclass geometry and content |

See [Custom Shapes](../advanced/custom-shapes.md) for implementation guidance.

## Current limitations

- `Line.contains()` and `StayText.contains()` currently always return false;
- `Point.getBound()` is not implemented, so an appended Point throws during normal rendering;
- `Path.getBound()` is not implemented, so an appended Path throws during rendering;
- `Circle` does not extend `AnimatedShape` and cannot be used directly as a timeline keyframe;
- `Root` is exported from the package entry point but is an internal runtime boundary Shape and should not normally be constructed by application code.

These limitations affect basic rendering as well as hit testing, Child bounds, history, and scene transfer. Do not hide them with type assertions.

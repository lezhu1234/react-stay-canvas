# Shapes and animation

[中文](../zh/shapes-and-animation.md) · [Documentation home](./README.md) · [Core concepts](./core-concepts.md)

A Shape owns geometry, drawing, hit testing, and its own visual state. A Child groups one or more Shapes into a scene object that can be queried and moved as a unit. Static scenes and keyframe timelines use the same Shape model, but enter the scene through different APIs:

- add static content with `tools.appendChild(...)`;
- create a timeline with `tools.createChild(...)`, then append keyframes;
- advance animation explicitly with `tools.progress({ timeMs })`.

## Current built-in capabilities

| Shape | Main geometry | Default hit testing | Keyframe interpolation | Notes |
| --- | --- | --- | --- | --- |
| `Rectangle` | `x`, `y`, `width`, `height` | Yes | Yes | `x` and `y` are the top-left corner |
| `Circle` | `x`, `y`, `radius` | Yes | No | Uses radial hit testing with plain coordinates |
| `Line` | `x1`, `y1`, `x2`, `y2` | No | Yes | Use `nearPoint` for a custom line hit area |
| `StayText` | `x`, `y`, `text`, `font` | No | Yes | `(x, y)` is always the Canvas text anchor defined by `textAlign` and `textBaseline` |
| `StayImage` | `image`, `x`, `y`, `width`, `height`, `opacity` | Yes | Yes | Uses rectangular bounds; create it after the image loads |
| `Point` | `x`, `y` | No | No | Geometry helper only; appending it throws during render because `getBound()` is not implemented |
| `Path` | `points`, `strokeConfig.lineWidth` | Yes | No | Uses a native stroked `Path2D`; defaults to round caps and joins |

“Default hit testing” means that `Child.containsPointer()` can rely on the Shape's `contains()` implementation. A Child is hit when any Shape inside it is hit. A practical pattern is to group non-hittable text or lines with a visible or low-opacity `Rectangle`, giving the whole Child a stable interaction region.

`Path` builds one native `Path2D` centerline from its points and paints it with `context.stroke()`. `strokeConfig.lineWidth` is the only width source; `fillConfig` is not accepted. Its bound expands the point extrema by half the line width, and hit testing compares the pointer with the nearest segment after a bounds check. Empty, single-point, repeated-point, and multi-segment paths are valid static geometry. Zoom scales both the points and line width.

`StayText` follows Canvas coordinate semantics: the default `start + alphabetic` uses `(x, y)` as the start-side alphabetic-baseline anchor. To center text on a visual point, pass that point as `x` and `y` together with `textAlign: "center"` and `textBaseline: "middle"`. Drawing, bounds, movement, zoom, and keyframe interpolation use the same anchor. `offsetXRatio` and `offsetYRatio` apply an additional width- and height-relative shift to it.

## Styling and paint order

Every Shape accepts common drawing properties:

```ts
const rectangle = new Rectangle({
  x: 24,
  y: 32,
  width: 160,
  height: 96,
  layer: 1,
  zIndex: 10,
  fillConfig: {
    color: { r: 54, g: 108, b: 220, a: 0.18 },
  },
  strokeConfig: {
    color: { r: 54, g: 108, b: 220, a: 1 },
    lineWidth: 2,
    dash: [8, 4],
    lineCap: "round",
  },
  globalConfig: {
    gco: "source-over",
  },
})
```

- `layer` selects the native `<canvas>` that paints the Shape;
- `zIndex` sorts Shapes within one layer;
- colors use `{ r, g, b, a }`, with RGB in 0–255 and alpha in 0–1;
- `strokeConfig` controls the outline and `fillConfig` controls the fill;
- `globalConfig.gco` maps to Canvas 2D `globalCompositeOperation`.

A single Child may span multiple layers. Queries, movement, and removal still operate on the Child as a unit, while each Shape paints on its own layer.

## Grouping multiple Shapes in one Child

Use an array when a stable name for each Shape is unnecessary:

```ts
const child = tools.appendChild({
  id: "node-a",
  className: "node:selected",
  shape: [
    new Rectangle({
      x: 40,
      y: 40,
      width: 140,
      height: 80,
      fillConfig: { color: { r: 230, g: 238, b: 255, a: 1 } },
    }),
    new StayText({
      x: 72,
      y: 82,
      text: "Node A",
      fillConfig: { color: { r: 25, g: 32, b: 45, a: 1 } },
    }),
  ],
})
```

`child.shape` always returns the first Shape. Use a `Map` when application code needs stable names for multiple Shapes:

```ts
const shapes = new Map([
  ["body", new Rectangle({ x: 40, y: 40, width: 140, height: 80 })],
  ["label", new StayText({ x: 72, y: 82, text: "Node A" })],
])

const child = tools.appendChild({
  id: "node-a",
  className: "node",
  shape: shapes,
})

const label = child.shapeMap.get("label") as StayText | undefined
label?.update({ text: "Renamed" })
```

Arrays become `shapeMap` entries named `"0"`, `"1"`, and so on. Copies, scene exports, and history snapshots retain those map keys.

## Update the Shape, not the Child container

The public mutation path is the Shape's own `update(...)` method:

```ts
const child = tools.getChildById<Rectangle>("node-a")
child?.shape.update({
  x: 80,
  width: 180,
  fillConfig: { color: { r: 255, g: 214, b: 153, a: 1 } },
})
```

`update()` tells the owning Child which layers need repainting. A same-layer update dirties that layer; changing `layer` dirties both the previous and next layers so the old Canvas is cleared automatically. `StayInstantChild.update(...)` is an internal replacement primitive used by undo and redo; it is not the normal application-level mutation API.

`move()` applies a relative offset. At the start of a continuous gesture, call `moveInit()` once, then pass offsets relative to that gesture start:

```ts
child.moveInit()
child.move(24, 12)
```

## Loading images

`StayImage` expects an already loaded `HTMLImageElement`, and `opacity` is required:

```ts
const image = new Image()

image.onload = () => {
  tools.appendChild({
    className: "photo",
    shape: new StayImage({
      image,
      x: 20,
      y: 20,
      width: 240,
      height: 160,
      opacity: 1,
    }),
  })
}

image.src = "/photo.png"
```

Cross-origin images follow the browser's Canvas tainting rules. If the scene will later call `toDataURL()` or `regionToTargetCanvas()`, the image response must allow the corresponding CORS use.

Pass `sx`, `sy`, `swidth`, and `sheight` to crop the source image. Explicit crop dimensions are preserved during construction, update, and copy; omitted dimensions use the image's natural size. Custom crop dimensions are not currently preserved in interpolated timeline frames.

## Explicit timeline model

An animated Child contains named slices. Each slice is a sequence of keyframes for one AnimatedShape type, and different slices advance in parallel:

```ts
const card = tools.createChild({
  id: "animated-card",
  className: "animated-card",
})

card.appendKeyFrame(
  "body",
  new Rectangle({
    x: 40,
    y: 80,
    width: 100,
    height: 72,
    fillConfig: { color: { r: 54, g: 108, b: 220, a: 1 } },
    transition: { durationMs: 400, type: "easeOutCubic" },
  }),
)

card.appendKeyFrame(
  "body",
  new Rectangle({
    x: 260,
    y: 48,
    width: 140,
    height: 120,
    fillConfig: { color: { r: 46, g: 137, b: 91, a: 1 } },
    transition: {
      delayMs: 120,
      durationMs: 680,
      type: "easeInOutBack",
    },
  }),
)

tools.progress({ timeMs: 0 })
```

The first `appendKeyFrame()` call prepends a transparent zero frame by default. The example therefore fades from transparent into its first visible rectangle. Keep that default: the current runtime cannot safely seek to `timeMs: 0` when the first frame has a non-zero duration and the zero frame is disabled. See [Current limitations](./known-limitations.md#animation-and-history).

`durationMs` and `delayMs` describe the transition arriving at the current keyframe: hold the previous frame for `delayMs`, then interpolate for `durationMs`. `totalDurationMs` is the longest total duration among all slices.

## Seeking, scrubbing, and playback

The library does not own an autoplay clock. Time comes from your controls, media clock, or `requestAnimationFrame` loop:

```ts
function seek(timeMs: number) {
  tools.progress({ timeMs })
}

let start = performance.now()
let frame = 0

function play(now: number) {
  tools.progress({ timeMs: Math.min(now - start, card.totalDurationMs) })
  if (now - start < card.totalDurationMs) {
    frame = requestAnimationFrame(play)
  }
}

frame = requestAnimationFrame(play)
```

Application code remains responsible for cancelling its animation frame when playback stops or the component unmounts. `progress()` returns the layers and Children updated by that draw, which can be useful for diagnostics or external statistics.

Use `bound: { beforeMs, afterMs }` to remap the current time into a subrange, for example when previewing a trimmed timeline:

```ts
tools.progress({
  timeMs: 600,
  bound: { beforeMs: 300, afterMs: 900 },
})
```

## Animation constraints

- Only Shapes extending `AnimatedShape` and implementing its interpolation protocol can be used in a timeline. Current built-ins are `Rectangle`, `Line`, `StayText`, and `StayImage`.
- Do not mutate keyframe Shape instances after adding them. The runtime warns about this, and cached interpolation can become inconsistent. Add a new keyframe instead.
- `StayAnimatedChild` does not participate in `log()`, `undo()`, or `redo()`. A static snapshot cannot restore a complete timeline without losing information.
- Static and animated Children can coexist. `tools.progress()` leaves static Children unchanged, while `tools.log()` excludes animated Children.

## Next steps

- [Scenes and StayTools](./scene-and-tools.md)
- [Custom Shapes](./advanced/custom-shapes.md)
- [Children and Shapes API](./api/children-and-shapes.md)
- [Timeline example](https://lezhu1234.github.io/react-stay-canvas/#/simple/timeline)

# Custom Shapes

[中文](../../zh/advanced/custom-shapes.md) · [Documentation home](../README.md) · [Shapes and animation](../shapes-and-animation.md)

Create a custom Shape only when built-ins cannot express the required geometry, drawing, or hit semantics. Product concepts such as nodes, annotations, and cards are usually Children composed from existing Shapes rather than new Shape subclasses.

The important contract is larger than “it draws”:

- `copy()` creates an independent instance for history and scene transfer;
- `getBound()` returns stable bounds for culling, Child bounds, and area queries;
- `contains()` describes the actual hit region;
- `move()`, `zoom()`, and `update()` change geometry;
- `update()` calls `applyUpdate()` so the owning Child repaints;
- `commonDraw()`, `stroke()`, and `fill()` each own one drawing phase.

## A complete static Shape

This diamond implements the minimum complete contract:

```ts
import {
  InstantShape,
  type PointType,
  type Rect,
  type ShapeDrawProps,
  type ShapeProps,
} from "react-stay-canvas"

interface DiamondProps extends ShapeProps {
  x: number
  y: number
  halfWidth: number
  halfHeight: number
}

class Diamond extends InstantShape {
  x: number
  y: number
  halfWidth: number
  halfHeight: number

  constructor(props: DiamondProps) {
    super(props)
    this.x = props.x
    this.y = props.y
    this.halfWidth = props.halfWidth
    this.halfHeight = props.halfHeight
    this.area = this.halfWidth * this.halfHeight * 2
  }

  commonDraw({ context }: ShapeDrawProps) {
    context.beginPath()
    context.moveTo(this.x, this.y - this.halfHeight)
    context.lineTo(this.x + this.halfWidth, this.y)
    context.lineTo(this.x, this.y + this.halfHeight)
    context.lineTo(this.x - this.halfWidth, this.y)
    context.closePath()
  }

  stroke({ context }: ShapeDrawProps) {
    context.stroke()
  }

  fill({ context }: ShapeDrawProps) {
    context.fill()
  }

  getBound(): Rect {
    return {
      x: this.x - this.halfWidth,
      y: this.y - this.halfHeight,
      width: this.halfWidth * 2,
      height: this.halfHeight * 2,
    }
  }

  contains(point: PointType) {
    const dx = Math.abs(point.x - this.x) / this.halfWidth
    const dy = Math.abs(point.y - this.y) / this.halfHeight
    return dx + dy <= 1
  }

  copy() {
    return new Diamond({
      x: this.x,
      y: this.y,
      halfWidth: this.halfWidth,
      halfHeight: this.halfHeight,
      layer: this.layer,
      zIndex: this.zIndex,
      state: this.state,
      stateDrawFuncMap: Object.fromEntries(
        Object.entries(this.stateDrawFuncMap).map(([name, stages]) => [
          name,
          { ...stages },
        ]),
      ),
      shapeStore: new Map(this.shapeStore),
      zoomY: this.zoomY,
      zoomCenter: { ...this.zoomCenter },
      strokeConfig: {
        ...this.strokeConfig,
        color: { ...this.strokeConfig.color },
        dash: [...this.strokeConfig.dash],
      },
      fillConfig: {
        ...this.fillConfig,
        color: { ...this.fillConfig.color },
      },
      globalConfig: { ...this.globalConfig },
    })
  }

  move(offsetX: number, offsetY: number) {
    this.update({ x: this.x + offsetX, y: this.y + offsetY })
  }

  zoom(scale: number) {
    const center = this.getZoomPoint(scale, { x: this.x, y: this.y })
    this.update({
      x: center.x,
      y: center.y,
      halfWidth: this.halfWidth * scale,
      halfHeight: this.halfHeight * scale,
    })
  }

  update(props: Partial<DiamondProps>) {
    this.x = props.x ?? this.x
    this.y = props.y ?? this.y
    this.halfWidth = props.halfWidth ?? this.halfWidth
    this.halfHeight = props.halfHeight ?? this.halfHeight
    this.area = this.halfWidth * this.halfHeight * 2
    this.applyUpdate(props)
    return this
  }
}
```

Append it like a built-in Shape:

```ts
tools.appendChild({
  id: "decision-a",
  className: "decision",
  shape: new Diamond({
    x: 160,
    y: 120,
    halfWidth: 72,
    halfHeight: 48,
    fillConfig: { color: { r: 255, g: 214, b: 153, a: 1 } },
    strokeConfig: { color: { r: 214, g: 114, b: 48, a: 1 }, lineWidth: 2 },
  }),
})
```

## Drawing phases

The default Shape paint order is:

```text
commonDraw → stroke (when non-transparent) → fill (when non-transparent) → afterDraw
```

`commonDraw()` usually establishes a path or sets context state unique to that Shape. `stroke()` and `fill()` perform their respective draw calls. `afterDraw()` restores temporary state. The base class applies common styles before each stage, so a subclass should not reimplement `strokeConfig` or `fillConfig` parsing.

If a Shape changes shared context state such as `filter`, `globalAlpha`, or transforms, restore it in `afterDraw()`. Otherwise later Shapes on the same layer inherit the modified state.

## Bounds and hit testing are different concerns

Bounds support fast queries, culling, and viewport checks; they need not match the exact geometry. The diamond's `getBound()` returns its enclosing rectangle, while `contains()` uses the diamond equation. Inheriting the base rectangular `contains()` would incorrectly hit the four corners of that enclosing box.

Hit testing should be:

- expressed in Canvas-local coordinates;
- explicit about stroke-width tolerance;
- free of DOM queries and side effects;
- cheap enough to run repeatedly during `mousemove`.

## Updates and dirty layers

Assigning geometry fields does not notify the renderer. A custom `update()` must call `applyUpdate(props)` after changing its fields:

```ts
update(props: Partial<DiamondProps>) {
  // update this Shape's geometry
  this.applyUpdate(props)
  return this
}
```

`applyUpdate()` merges `layer`, `zIndex`, zoom fields, `state`, `stateDrawFuncMap`, `strokeConfig`, and `fillConfig`, then marks the Shape's current layer dirty through `parent.onChildShapeChange()`. It does not merge `globalConfig` or `shapeStore`. When an update changes `layer`, call `tools.refresh()` because the old layer is not dirtied automatically. Omitting `applyUpdate()` can leave data updated while the screen remains stale.

## Independent copies

History, `exportChildren()`, and import flows all rely on `copy()`. At minimum it must:

- return the same concrete Shape type;
- copy geometry and drawing configuration;
- allow the copy and original to be modified independently;
- avoid sharing mutable arrays, Maps, or application objects.

When a custom Shape owns arrays or objects, choose a shallow or deep copy based on whether those values can be mutated in place.

The example shallow-copies `shapeStore`. If the Map values are mutable, the custom Shape must copy those values according to its own data model; the base class cannot infer a deep-copy policy for arbitrary application objects.

## When to extend AnimatedShape

Extend `AnimatedShape` only when the custom geometry truly needs keyframe interpolation. In addition to the static contract, implement:

- `getTransProps()` to list interpolated fields;
- `intermediateState()` to create a Shape between two frames using a ratio and easing function;
- `zeroShape()` to create a transparent zero frame;
- `childSameAs()` to compare the Shape's own geometry and content.

These methods affect caches, keyframe boundaries, and animation visibility. Build and test the static Shape first, then add animation as a separate contract instead of debugging paint, hit testing, and interpolation at the same time.

## Minimum test checklist

A custom Shape should verify at least:

1. bounds and center immediately after construction;
2. points inside, on the boundary, and outside `contains()`;
3. `move()` and `zoom()` around an arbitrary center;
4. independence between an original and `copy()`;
5. repainting of the owning layer after `update()`;
6. Child bounds and whole-Child movement when grouped with other Shapes;
7. when animated, time 0, mid-transition, exact keyframe end, and delay windows.

## Related reference

- [Children and Shapes API](../api/children-and-shapes.md)
- [Shapes and animation](../shapes-and-animation.md)
- [Source architecture](../../SOURCE_ARCHITECTURE.md)

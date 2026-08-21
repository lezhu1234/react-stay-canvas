# Current limitations

[中文](../zh/known-limitations.md) · [Documentation home](./README.md)

The following user-visible behavior is not reliable in the current implementation.

## Rendering and geometry

- `Circle` default hit testing throws because its `contains()` implementation expects a `Point` instance while public hit paths pass a plain coordinate.
- `Line` and `StayText` do not provide default hit areas. Group them with a hittable Shape or provide an explicit selector/hit strategy.
- `Point.getBound()` and `Path.getBound()` are not implemented. Normal rendering performs bounds-based viewport culling, so appending either Shape throws before it paints. `Point` remains usable as a standalone geometry helper; `Path.copy()` is also unimplemented.
- Changing a Shape's `layer` through `update()` dirties only the new layer and leaves stale pixels on the old one. Call `tools.refresh()` after a layer change.
- `StayText({ x, y })` uses the upper center of the text bounding box as its current anchor. It does not use the visual center used by `Circle`.
- `StayImage` overwrites explicit `swidth` and `sheight` with the image's natural dimensions during construction.
- `CircleAttr.stroke`, `CircleAttr.fill`, and `StayText.decoration` are accepted by types but do not produce the corresponding stable drawing behavior. Use `strokeConfig` and `fillConfig` for Circle styling.

## Animation and history

- `Circle`, `Point`, and `Path` are not animated Shapes.
- A first keyframe appended with `prependZeroShape: false` and a non-zero duration cannot be sought safely at `timeMs: 0`. Keep the default zero frame.
- Animated Children do not participate in `log()`, `undo()`, or `redo()`.
- Updating an existing Shape does not automatically mark its Child as a pending history change. `log()` only records static Children marked by append/remove operations.

## Scene operations

- `reset()` is not a reliable inverse after a scene move because it reuses the previous movement snapshot. Do not present it as a restore-to-initial-state operation.
- Built-in `Shape.copy()` does not preserve every common field and may share nested mutable style values. `StayAnimatedChild.copy()` also loses its timeline and becomes a static snapshot. Consequently, history and scene transfer are not fully state-preserving for every Shape or animated scene.
- `importChildren()` mutates the copied Children inside its input payload before appending another copy. Export again before importing the same scene into a different target area.
- `regionToTargetCanvas({ progress: 0 })` skips timeline seeking because the current implementation uses a truthy check. Seek with `tools.progress({ timeMs: 0 })` first, then capture without the `progress` option.

## Events and targeting

- The default target comparator does not provide a stable ordering guarantee. Supply `sortBy` when pointer targets overlap.
- The public Event trigger type includes `"frame"`, but the current renderer does not emit frame actions through `EventRuntime`.

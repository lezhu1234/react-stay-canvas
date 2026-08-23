# Current limitations

[中文](../zh/known-limitations.md) · [Documentation home](./README.md)

The following user-visible behavior is not reliable in the current implementation.

## Rendering and geometry

- `Line` and `StayText` do not provide default hit areas. Group them with a hittable Shape or provide an explicit selector/hit strategy.
- `Point.getBound()` and `Path.getBound()` are not implemented. Normal rendering performs bounds-based viewport culling, so appending either Shape throws before it paints. `Point` remains usable as a standalone geometry helper.
- `StayText({ x, y })` uses the upper center of the text bounding box as its current anchor. It does not use the visual center used by `Circle`.
- `StayImage` preserves explicit source-crop dimensions during construction, update, and copy, but custom `swidth` and `sheight` are not transition fields and are not preserved in interpolated timeline frames.
- `CircleAttr.stroke`, `CircleAttr.fill`, and `StayText.decoration` are accepted by types but do not produce the corresponding stable drawing behavior. Use `strokeConfig` and `fillConfig` for Circle styling.

## Animation and history

- `Circle`, `Point`, and `Path` are not animated Shapes.
- A first keyframe appended with `prependZeroShape: false` and a non-zero duration cannot be sought safely at `timeMs: 0`. Keep the default zero frame.
- Animated Children do not participate in `log()`, `undo()`, or `redo()`.

## Scene operations

- `reset()` is not a reliable inverse after a scene move because it reuses the previous movement snapshot. Do not present it as a restore-to-initial-state operation.

## Events and targeting

- The default target comparator does not provide a stable ordering guarantee. Supply `sortBy` when pointer targets overlap.
- The public Event trigger type includes `"frame"`, but the current renderer does not emit frame actions through `EventRuntime`.

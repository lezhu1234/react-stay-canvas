# Current limitations

[中文](../zh/known-limitations.md) · [Documentation home](./README.md)

The following user-visible behavior is not reliable in the current implementation.

## Rendering and geometry

- `Line` and `StayText` do not provide default hit areas. Group them with a hittable Shape or provide an explicit selector/hit strategy.
- `Point.getBound()` is not implemented. Normal rendering performs bounds-based viewport culling, so appending a Point throws before it paints; it remains usable as a standalone geometry helper.
- `StayImage` preserves explicit source-crop dimensions during construction, update, and copy, but custom `swidth` and `sheight` are not transition fields and are not preserved in interpolated timeline frames.
- `CircleAttr.stroke`, `CircleAttr.fill`, and `StayText.decoration` are accepted by types but do not produce the corresponding stable drawing behavior. Use `strokeConfig` and `fillConfig` for Circle styling.
- Native WebGL2 supports depth-tested indexed triangle Meshes, a linear LDR RGBA8 scene target, opaque unlit/Lambert materials, rough scene-color refractive Glass materials with explicit Beer-Lambert volume attenuation, sRGB RGBA8 equirectangular environment reflection, vertex normals, ambient lights, up to four directional lights, and configurable fixed-radius PCF for opaque plus nearest-layer transmissive directional shadow maps. Glass uses one explicit travel distance and stable object-level back-to-front sorting, and samples only opaque WebGL2 scene color from the same layer; geometry-derived or textured thickness, intersecting transparent Meshes, self-overlap, transparent-on-transparent or DOM/CSS refraction/reflection, distance-varying penumbrae, HDR scene radiance, exposure or tone mapping, HDR prefiltered environments, general material textures, accumulation through overlapping transmissive shadow casters, order-independent transparency, and WebGL2 region capture are not yet available.

## Animation and history

- `Circle`, `Point`, and `Path` are not animated Shapes.
- A first keyframe appended with `prependZeroShape: false` and a non-zero duration cannot be sought safely at `timeMs: 0`. Keep the default zero frame.
- Animated Children do not participate in `log()`, `undo()`, or `redo()`.

## Scene operations

- `reset()` is not a reliable inverse after a scene move because it reuses the previous movement snapshot. Do not present it as a restore-to-initial-state operation.
- `tools.viewport` and 2D Child placement do not move a WebGL2 Camera. Camera pose/projection are explicit layer display state.

## Events and targeting

- The default target comparator does not provide a stable ordering guarantee. Supply `sortBy` when pointer targets overlap.
- The public Event trigger type includes `"frame"`, but the current renderer does not emit frame actions through `EventRuntime`.
- DOM and root actions still work on a WebGL2 Canvas, but a `StayWebGLChild` is not a pointer target until native raycasting is added.

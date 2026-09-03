# Changelog

## 1.3.1

### Added

- Public `ImageTexture`, `ImageMaterial`, and `TransparentImageMaterial` WebGL2 APIs with top-origin UV geometry, deep-owned RGBA8 pixels, History and scene-transfer support, and automatic GPU resource restoration.
- Straight-alpha image textures with premultiplied-linear upload, mip generation, and back-to-front composition in the existing transparent Mesh queue.

### Changed

- Rebuilt the Coordinates example as a responsive Canvas2D/WebGL2 physical installation that demonstrates real Client, View, and Content mappings through Canvas-routed controls.

## 1.3.0

### Added

- Public Content/View/Client coordinate conversion and viewport APIs, including fit, pan, zoom, reset, and restore.
- Affine and projective Child placement shared by rendering, hit testing, history, scene transfer, and capture.
- `Polygon` as a closed fillable Shape.
- Optional mixed Canvas2D/WebGL2 layers with native meshes, cameras, materials, lights, shadows, environment maps, and scene snapshots.
- Public `StayInstantChild.update()` for atomic class, Shape-composition, and placement updates.
- `historyAdapter`, `resetHistory()`, `canUndo()`, and `canRedo()` for unified scene and application history.
- Schema-based typing for Listener `store` and `stateStore` while retaining native Map behavior.
- Complete English and Chinese documentation in the npm package, guarded by an actual pack-content check.

### Changed

- `Path` is a native stroked centerline. Replace `radius` with `strokeConfig.lineWidth`, move paint color from `fillConfig.color` to `strokeConfig.color`, and remove the unsupported fill configuration.
- `StayText.x` and `StayText.y` always use native Canvas `textAlign` and `textBaseline` anchor semantics.
- Changing `StayCanvas` width or height preserves the current runtime by default; opt into `recreateOnResize` when rebuilding is intentional.
- Listener targets without an explicit `sortBy` use smaller bounds first, scene insertion order for equal bounds, and root last.
- Predefined undo and redo actions recognize Meta on macOS as well as Control on Windows/Linux.

### Fixed

- Shape updates participate in the next history transaction without remove-and-reappend workarounds.
- Pointer Sessions retain their starting target and terminate consistently after release or cancellation outside the Canvas.
- Pointer coordinates account for axis-aligned CSS scaling before event conditions and hit testing.
- Scene fragments are detached from their source Canvas and can be imported repeatedly without mutating the payload.

See the [English migration guide](./docs/en/migration-1.3.md) or [中文迁移指南](./docs/zh/migration-1.3.md) before upgrading from 1.2.0.

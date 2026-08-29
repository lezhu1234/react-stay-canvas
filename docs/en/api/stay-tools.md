# StayTools API

[中文](../../zh/api/stay-tools.md) · [Scenes and tools guide](../scene-and-tools.md)

`StayTools` combines `BasicTools`, `InstantTools`, `AnimatedTools`, and the native `webgl` namespace. Every Canvas has static, animated, history, and native-scene tools at the same time; there is no runtime mode to select.

## Children and queries

| Method | Signature summary | Meaning |
| --- | --- | --- |
| `appendChild` | `({ id?, className, shape, placement? }) => StayInstantChild` | Add a static Child; shape may be one value, an array, or a Map |
| `removeChild` | `(childId) => Promise<void> \| void` | Remove a Child; root cannot be removed |
| `hasChild` | `(id) => boolean` | Test existence by id |
| `getChildrenWithoutRoot` | `() => StayInstantChild[]` | Return application Children |
| `getChildById` | `(id) => StayInstantChild \| void` | Read one Child by id |
| `getChildBySelector` | `(selector) => StayInstantChild \| void` | Return the first selector match |
| `getChildrenBySelector` | `(selector, sortBy?) => StayInstantChild[]` | Query and optionally sort matches |
| `getContainPointChildren` | `({ selector, point, ... }) => StayInstantChild[]` | Query Children that hit one point |
| `getChildrenByArea` | `(area, selector?) => StayInstantChild[]` | Query Children with a Shape center inside an area |

`getContainPointChildren` options:

| Field | Default | Meaning |
| --- | --- | --- |
| `selector` | required | String, string array, or function selector |
| `point` | required | Scene-space `ContentPoint` |
| `returnFirst` | `false` | Return at most the first sorted match |
| `sortBy` | — | Hit-result ordering |
| `withRoot` | `true` | Whether root may be returned |

## Native WebGL2 scene

`tools.webgl` manages native Mesh children in the same instance and identity store as Canvas2D Children. A `StayWebGLChild` owns an ordered Mesh list on one WebGL2 layer; its Mesh geometry, model matrix, and material are CPU-authoritative and mutations invalidate that layer.

`Mesh` defaults to an opaque `UnlitMaterial`. Use explicit non-zero per-vertex normals with `LambertMaterial` or `GlassMaterial`; normals are copied, normalized in the shader, and transformed with the model matrix's inverse transpose. Material values are immutable, so replace one with `mesh.setMaterial()` rather than sharing mutable material state:

```ts
const mesh = new Mesh({
  geometry: {
    positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    indices: [0, 1, 2],
  },
  material: new LambertMaterial({ color: [0.2, 0.55, 0.9, 1] }),
  castShadow: true,
  receiveShadow: true,
})

const glass = new GlassMaterial({
  color: [0.6, 0.85, 1, 0.2],
  ior: 1.46,
  roughness: 0.24,
  thickness: 0.18,
  attenuationColor: [0.72, 0.9, 1],
  attenuationDistance: 0.8,
})
mesh.setMaterial(glass)
```

`UnlitMaterial` and `LambertMaterial` are opaque and require color alpha `1`. `GlassMaterial` requires alpha strictly between `0` and `1`, `ior` greater than `1` (default `1.5`), `roughness` from `0` to `1` (default `0`), and non-negative `thickness` in world units (default `0.1`). The renderer uses those values for a lit Fresnel edge and screen-space refraction through the layer's opaque WebGL2 scene color. Roughness selects progressively filtered scene-color and environment mip levels; zero is sharp and one selects the broadest available blur. A zero thickness keeps transmission and Fresnel shading but samples the undisplaced screen position.

Volume absorption follows Beer-Lambert transmission. `attenuationColor` is the RGB color that remains after traveling `attenuationDistance` world units, so transmission for a channel is `attenuationColor ** (thickness / attenuationDistance)`. The attenuation color defaults to white. Omitting `attenuationDistance` means infinite distance and therefore no absorption. A supplied distance must be positive and finite; attenuation channels must be finite values from `0` to `1`. `color` remains the boundary tint, while attenuation describes loss inside the volume. The current material treats `thickness` as the complete travel distance rather than deriving it from mesh geometry or a thickness texture.

Scene-color refraction is intentionally layer-local: it can bend opaque WebGL2 Meshes rendered earlier in the same layer. When the WebGL2 layer config supplies an `EnvironmentMap`, Glass also samples its world-space equirectangular reflection direction and applies the same roughness LOD. The environment belongs to layer display state, not Material History or scene transfer. Refraction still cannot sample DOM/CSS content behind the Canvas or other transparent Meshes, and the current LDR mip-chain model does not provide HDR prefiltered radiance or physical multi-surface transmission.

The renderer draws opaque Meshes first. Glass Meshes keep depth testing, disable depth writes, and are stable-sorted back to front by their transformed local bounding-box center in camera view space. This is standard object-level transparency: separate non-intersecting surfaces compose predictably, while intersecting transparent Meshes and self-overlapping geometry may require geometry splitting or a future order-independent transparency path.

Shadow behavior is explicit CPU Mesh state. `castShadow` and `receiveShadow` both default to `false`; update them with `setCastShadow()` and `setReceiveShadow()`. A lit receiver samples the layer's directional shadow maps, and Glass can both receive and cast shadows. Opaque casters block direct light; a Glass caster multiplies its existing boundary transmission (`1 - color alpha`) by the same Beer-Lambert RGB computed from `attenuationColor`, `attenuationDistance`, and `thickness`. The RGB part of `color` remains a boundary tint and is not a second shadow-color source. The current bounded shadow-map model stores only the nearest Glass caster at each light-space texel; overlapping transmissive volumes do not accumulate yet. Opaque occlusion is kept in a separate depth map, so an opaque caster still blocks light when it lies behind a Glass caster. Shadow flags are preserved by History and scene transfer without changing geometry revisions.

Without any configured lights, Lambert renders dark. Glass keeps scene-color transmission and its Fresnel edge, but its directly lit tint is dark; add ambient or directional light when that surface lighting is wanted instead of relying on a hidden default rig.

| Method | Meaning |
| --- | --- |
| `webgl.appendChild({ id?, className, layer, meshes? })` | Add one native Mesh Child to a configured WebGL2 layer |
| `webgl.removeChild(id)` | Remove the native Child and release its subscriptions/GPU cache entries |
| `webgl.hasChild(id)` / `getChildById(id)` | Query native identity without mixing it into Shape-only helpers |
| `webgl.getChildBySelector(selector)` | Return the first native selector match |
| `webgl.getChildrenBySelector(selector, sortBy?)` | Query native Children using the shared selector language |
| `webgl.exportChildren(children)` | Capture deep-owned CPU Mesh fragments with source ids |
| `webgl.importChildren(fragment)` | Materialize new Child ids and independent Mesh state |

`Mesh`, `UnlitMaterial`, `LambertMaterial`, `GlassMaterial`, `EnvironmentMap`, `AmbientLight`, `DirectionalLight`, `PerspectiveCamera`, `StayWebGLChild`, and the minimal Matrix4 helpers are exported from the package root. GPU programs, VAOs, buffers, scene-color/environment/shadow targets, shaders, and layer runtimes remain internal. WebGL2 Child picking/raycast, general-purpose material textures, multi-layer transmissive shadows, order-independent transparency, and Canvas capture are not part of this surface yet.

## State and display

| Method | Meaning |
| --- | --- |
| `switchState(state)` | Change Canvas/Listener state and clear stateStore |
| `getAvailiableStates(selector)` | Return known states matching an expression; the public name retains its current historical spelling |
| `changeCursor(cursor)` | Set the top Canvas cursor |
| `refresh()` | Force every layer to redraw |

## Scene transforms

### Coordinate conversion

`tools.coordinates` is the unified conversion surface for the three global Client, View, and Content spaces. It does not own a second viewport state; every call uses the current Canvas display metrics and current viewport.

| Method | Meaning |
| --- | --- |
| `clientToView(point)` | Browser Client point → Canvas View point |
| `viewToClient(point)` | Canvas View point → browser Client point |
| `viewToContent(point)` | View point → current scene Content point |
| `contentToView(point)` | Content point → current Canvas View point |
| `clientToContent(point)` | Browser Client point → current scene Content point |
| `contentToClient(point)` | Content point → browser Client point, suitable for DOM overlays |
| `viewVectorToContent(vector)` | View displacement → Content displacement; applies scale but not translation |
| `contentVectorToView(vector)` | Content displacement → View displacement; applies scale but not translation |

The package root also exports `ClientPoint`, `ViewPoint`, `ContentPoint`, `ViewVector`, `ContentVector`, `ViewRect`, and `ContentRect`. These are zero-runtime-cost weak branded types: plain coordinate and rectangle values remain compatible with existing APIs, while values returned with a known space cannot be passed to a different space by mistake. Points and vectors are also distinct because point conversion includes translation and vector conversion does not.

`tools.coordinates` reads the latest viewport when it is called. By contrast, event `e.point` is the Content point captured for that input sample; it stays stable even when an earlier Listener changes the viewport during the same dispatch.

### Non-destructive Child placement

`appendChild()` and `createChild()` accept one optional discriminated placement. `{ type: "affine", x, y, rotation, scaleX, scaleY, skewX, skewY, origin }` is the semantic form; `{ type: "affine", matrix: { a, b, c, d, e, f } }` is its raw equivalent. `{ type: "projective", matrix: { m00, ..., m22 }, domain }` defines a finite perspective plane.

`child.setPlacement(placement)` replaces the complete placement. `child.placement` returns a snapshot; `child.toLocalPoint(contentPoint)` and `child.toContentPoint(localPoint)` cross the local boundary explicitly and return `undefined` outside a projective domain. Matrices must be finite and invertible. Static placement participates in history and scene transfer; animated placement interpolation is not yet supported.

`projectivePlacementFromQuad(domain, quad)` constructs that projective placement from a finite local rectangle and named `topLeft`, `topRight`, `bottomRight`, and `bottomLeft` Content corners. It rejects non-finite, degenerate, or horizon-crossing mappings; raw matrices remain available for callers that already own the homography.

### Non-destructive viewport

`tools.viewport` changes how Content is displayed in the View without mutating Child/Shape geometry or writing history:

| Method | Meaning |
| --- | --- |
| `get()` | Return a `{ x, y, scale }` snapshot |
| `panBy(viewMovement)` | Accumulate a `ViewVector` display offset |
| `zoomBy(factor, contentAnchor?)` | Zoom by a positive factor; the anchor is the `ContentPoint` whose display position stays fixed, defaulting to the View center |
| `fit(contentBounds, { padding? })` | Uniformly scale and center one `ContentRect` inside the current View; padding is measured in View pixels |
| `reset()` | Restore `{ x: 0, y: 0, scale: 1 }`, subject to min/max limits |
| `restore(state)` | Restore a previous snapshot and clamp its scale to configured limits |
| `toClientPoint(contentPoint)` | Compatibility entry point for `coordinates.contentToClient()` |

The projection is `View = Content × scale + (x, y)`. `fit()` is an explicit one-shot operation: it does not select Children and is not rerun after append, import, or resize. Configured scale limits take precedence over fitting, while the requested bounds remain centered. Bounds may have zero width or zero height, but not both. Every method synchronously returns the new read-only snapshot; the Renderer uses one coordinate snapshot to repaint all dirty layers on the next frame.

The package root also exports two stateless rectangle helpers. `unionRects(rects)` returns the axis-aligned union or `undefined` for an empty iterable and preserves the input rectangle type. `fitRect(source, target)` returns the uniform scale and centered rectangle while preserving the target rectangle type. This keeps known View/Content brands intact through helper composition. Viewport fitting and region capture share this calculation; applications remain responsible for choosing which Child bounds represent their business scene.

### Destructive scene transforms

| Method | Meaning |
| --- | --- |
| `moveStart()` | Snapshot the whole-scene movement origin |
| `move(offsetX, offsetY, filter?)` | Pan the scene; filter may exclude non-root Children |
| `zoom(deltaY, center, filter?)` | Zoom around a Canvas-local point |
| `reset()` | Apply the current root-based inverse transform; not reliable after a scene move |

These legacy methods directly mutate Child/Shape coordinates. They are batch geometry operations, not viewport controls. `move()`, `zoom()`, and `reset()` return a Promise resolved on the next runtime tick; it does not mean the browser compositor has completed a frame. `reset()` is not a reliable restore-to-initial-state operation after scene movement; see [Current limitations](../known-limitations.md#scene-operations).

## History

| Method | Meaning |
| --- | --- |
| `log()` | Commit pending static-Child diffs, including Shape or Mesh mutations, as one history item |
| `undo()` | Undo one item; logs when none remain |
| `redo()` | Redo one item; logs when none remain |
| `resetHistory()` | Clear undo/redo and use the current static scene as the new baseline |

Canvas2D and WebGL2 static Children participate in the same History transaction and id namespace. Camera, EnvironmentMap, and Light changes are layer display state and are not recorded. Animated Children do not participate in history. See [Scenes and tools: History transactions](../scene-and-tools.md#history-transactions) for boundaries and examples.

## Animation

| Method | Signature summary | Meaning |
| --- | --- | --- |
| `createChild` | `({ id?, className, placement? }) => StayAnimatedChild` | Create and append an animated Child with an optional static placement |
| `progress` | `({ timeMs, bound?, beforeDrawCallback?, afterDrawCallback? }) => DrawReturn` | Advance animated Children and draw immediately |

`DrawReturn`:

```ts
interface DrawReturn {
  updatedLayers: number[]
  updatedChilds: Array<{
    child: StayInstantChild
    shapes: InstantShape[]
  }>
}
```

## Scene transfer and output

| Method | Meaning |
| --- | --- |
| `exportChildren({ children, area? })` | Capture current Shapes as a reusable `SceneFragment` |
| `importChildren(scene, targetArea?)` | Materialize a fragment at equal aspect ratio with new runtime ids |
| `regionToTargetCanvas({ area, targetSize?, children, progress? })` | Aspect-fit a region onto a new HTMLCanvasElement; optionally capture an animation frame without changing playback |

`CaptureSceneProps` is the export input. `SceneFragment` contains an `area` and Child fragments with `sourceId`, `className`, `shapes`, and `placement`. `sourceId` is correlation metadata; it is not reused as the imported Child id.

Scene transfer captures common Shape state and independently owned style containers. It intentionally captures only the current projection of an Animated Child and is not a timeline serialization format.

Native Mesh transfer is separate because it has no 2D area/placement transform: use `tools.webgl.exportChildren()` and `tools.webgl.importChildren()`. Camera, EnvironmentMap, and Light state is owned by the target layer config and is not included.

## Actions and Listeners

| Method | Meaning |
| --- | --- |
| `triggerAction(originEvent, triggerEvents, payload)` | Route manual actions from an explicit native Event, plain action data, and business payload |
| `deleteListener(name)` | Delete a named Listener |

```ts
tools.triggerAction(
  new Event("save"),
  { save: { info: { state: "editing" } } },
  { documentId: "doc-1" },
)
```

`triggerEvents.*.info` cannot be a native Event; native Events from another iframe realm are rejected as well. See [Trigger actions manually](../interaction-and-events.md#trigger-actions-manually) for the full contract.

# Source Architecture

## Public boundary

`src/index.ts` is the package entry point and the only supported consumer import boundary.
Internal modules import the concrete file that owns a symbol; they do not use package-level
barrels to reach another internal module.

## Type modules

```text
src/types/
├── animation.ts
├── canvas.ts
├── children.ts
├── common.ts
├── component.ts
├── coordinates.ts
├── events.ts
├── geometry.ts
├── manualActions.ts
├── shapes.ts
├── transform.ts
├── tools.ts
└── index.ts
```

Each public type has one domain owner. `types/index.ts` is a package-boundary facade: it preserves
the package-root type exports, while production modules import types from the owning leaf file.
Internal paths under `src/types/` are implementation details and are not supported consumer entry
points.

## Utility modules

```text
src/utils/
├── assertions.ts
├── color.ts
├── easing.ts
├── equality.ts
├── geometry.ts
├── identifiers.ts
├── numbers.ts
├── selectors.ts
├── stage.ts
├── typography.ts
└── index.ts
```

Each leaf file owns one domain. `utils/index.ts` only preserves the package-root export surface;
production code imports leaf files directly so a consumer does not pull unrelated dependencies
into its module graph.

## Infrastructure and vendor code

- `runtime/canvasResourceCache.ts` owns the shared font-measurement and OffscreenCanvas caches.
- `vendor/w3color.ts` contains the third-party color parser and stays isolated from first-party
  utility logic.
- Utility modules may depend on public types, the private Canvas resource cache, or vendor code.
  Infrastructure and vendor modules must not import the utility barrel.

The package-root utility names remain stable even when their internal owner changes.

## Coordinate ownership

`stay/coordinates/CoordinateSystem` is the sole owner of runtime viewport state and of
Client ⇄ View ⇄ Content conversion. Client uses browser viewport pixels. View is the logical
Canvas surface after CSS-size normalization. Content is the coordinate space owned by Children
and Shapes. The current immutable `CoordinateFrame` carries one revision and is shared by every
layer in a render pass.

`Canvas` owns surface metrics and backing-store transforms, `Renderer` consumes one frame for
projection and culling, and `EventRuntime` maps each pointer sample set once before conditions or
routing. Root input is hit-tested in View; ordinary Children are hit-tested in Content. Public
pointer `point` remains Content while `movement` is a View-space delta. No renderer, Shape, or
integration example may keep a second authoritative viewport or perform its own inverse mapping.

The public `tools.coordinates` object is the stateless conversion facade over this owner, while
`tools.viewport` is the mutation facade for the same viewport state. Public weak-branded point and
vector types preserve plain `{ x, y }` inputs while preventing known cross-space values from being
mixed. Legacy
`move`/`zoom`/`reset` tools remain destructive geometry operations and must not be used as a
viewport implementation.

## Child placement ownership

`StayInstantChild` owns exactly one local-to-Content placement: affine or projective. Shapes retain
local geometry. Affine rendering composes the Child matrix after the shared Content-to-View frame;
projective rendering rasterizes the finite local domain and consumes the same mapping through the
RenderPlan. Culling maps Shape bounds into Content, while point hits use the placement inverse before
calling Shape `contains()`.

`stay/placements/childPlacement.ts` owns the discriminated runtime value and routes mapping,
movement, equality, and scene placement to the affine/projective primitives. History snapshots and
scene fragments store the resolved placement rather than duplicating semantic fields. Canvas2D mesh
and raster quality are derived from the current output surface and do not become Child state. Layer
remains a paint-pass choice and never owns coordinate placement.

RenderPlan preserves plan-time order and culling, but a Child-owned placement is resolved again at
the actual per-Shape draw boundary. This retains the synchronous callback contract: an earlier Shape
may change a later Child between planning and drawing without leaving a stale affine/projective
classification or projective matrix in either executor. Only an explicit internal projection
resolver creates a fixed RenderItem override.

## Documentation boundary

`README.md` is a concise bilingual landing page. Topic-based documentation lives under `docs/zh/`
and `docs/en/`; both language trees cover the same public contracts but use natural prose rather
than line-by-line translation. API text and examples are not duplicated in the root landing page.

The former monolithic content in `docs/README.zh.md` and `docs/README.en.md` has been replaced by
small compatibility entry points so existing links continue to reach the topic indexes. Public
documentation must use package exports, tests, and repository examples as factual sources instead
of reintroducing another declaration copy in those files.

Runnable behavior belongs in the GitHub Pages example gallery. Each route presents only the live
result and the exact component source rendered by that result. Automated regression coverage stays
with the source and tests; machine-local operator evidence does not belong in the published gallery
or the repository documentation. Maintainer architecture documents explain internal ownership and
must not become a second user-facing API reference.

`scripts/verify-docs.mjs` enforces matching Chinese and English page trees, validates local
Markdown links, and derives documented member names from the selected public TypeScript
declarations that own each API page. It checks documentation structure and API-name drift without
becoming a second TypeScript compiler or a complete Markdown parser.

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
├── events.ts
├── geometry.ts
├── manualActions.ts
├── shapes.ts
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

## Documentation boundary

`README.md` is a concise bilingual landing page. `docs/README.zh.md` and
`docs/README.en.md` are the canonical API documents for their respective languages; API text and
examples are not duplicated in the root landing page.

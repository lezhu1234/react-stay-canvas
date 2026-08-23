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

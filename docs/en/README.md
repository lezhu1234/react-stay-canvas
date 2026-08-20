# react-stay-canvas documentation

[中文](../zh/README.md)

`react-stay-canvas` is a layered Canvas rendering and interaction library for React applications. It organizes drawing, scene objects, hit testing, events, animation, and history into a composable model for editors, annotation tools, diagrams, motion tools, and other interaction-heavy Canvas interfaces.

## Start here

- [Getting started](./getting-started.md): install the package, render a scene, and understand sizing and layout.
- [Core concepts](./core-concepts.md): learn how Canvas layers, Children, Shapes, and StayTools fit together.
- [Interaction and events](./interaction-and-events.md): understand Listeners, selectors, state, ActionEvent, manual actions, and Pointer Sessions.
- [Example gallery](https://lezhu1234.github.io/react-stay-canvas/): run 10 focused examples and 3 integrated workflows, each with its own acceptance handbook.

If this is your first time using the library, work through Getting started before reading Core concepts. The API reference is much easier to use once the scene and event models are familiar.

## Documentation map

| Topic | Status | Covers |
| --- | --- | --- |
| Getting started | Rewritten | Installation, first scene, layout, updates, and removal |
| Core concepts | Rewritten | Rendering model, ownership, layers, and interaction entry points |
| Interaction and events | Rewritten | Listeners, Events, selectors, state, and Pointer Sessions |
| Shapes and animation | In migration | Built-in Shapes, styling, keyframes, and custom Shapes |
| Scenes and tools | In migration | Queries, transforms, history, transfer, and capture |
| API reference | In migration | `StayCanvas`, Children, Shapes, Events, Listeners, and `StayTools` |

Until the migration is complete, material that has not been rewritten remains available in the [legacy English document](../README.en.md). It contains stale APIs and should only be used as a temporary reference. Package exports and repository examples define the current public surface and behavior.

## Sources of truth

- These pages explain concepts, usage, and public behavior.
- Exported TypeScript declarations define API names and signatures.
- The [example gallery](https://lezhu1234.github.io/react-stay-canvas/) provides runnable interactions.
- The [acceptance handbook](../../example/ACCEPTANCE.md) defines manual scenarios, expected results, and required evidence.
- [Event architecture](../EVENT_ARCHITECTURE.md) and [source architecture](../SOURCE_ARCHITECTURE.md) are maintainer documents, not onboarding material.

## Terminology

The documentation keeps public identifiers in English instead of inventing translated names for code concepts.

| Identifier | Meaning in these docs |
| --- | --- |
| Canvas | A stack of equally sized native `<canvas>` layers and the runtime that manages them |
| Child | A queryable, hittable scene object that can be manipulated as one unit |
| Shape | Geometry, drawing, and hit-testing behavior owned by a Child |
| Listener | A handler selected by event, state, and selector |
| Event | A definition that converts DOM input or a programmatic call into an action |
| StayTools | The scene-operation API for one Canvas instance |

## Local verification

```bash
pnpm install --frozen-lockfile
npm ci --prefix test
npm ci --prefix example
pnpm verify
```

`pnpm verify` builds the library, runs the tests, type-checks the examples, and builds the example gallery.

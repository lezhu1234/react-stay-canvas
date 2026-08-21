# react-stay-canvas documentation

[中文](../zh/README.md)

`react-stay-canvas` is a layered Canvas rendering and interaction library for React applications. It organizes drawing, scene objects, hit testing, events, animation, and history into a composable model for editors, annotation tools, diagrams, motion tools, and other interaction-heavy Canvas interfaces.

## Start here

- [Getting started](./getting-started.md): install the package, render a scene, and understand sizing and layout.
- [Core concepts](./core-concepts.md): learn how Canvas layers, Children, Shapes, and StayTools fit together.
- [Interaction and events](./interaction-and-events.md): understand Listeners, selectors, state, ActionEvent, manual actions, and Pointer Sessions.
- [Shapes and animation](./shapes-and-animation.md): use built-in Shapes, compose objects, and build explicit keyframe timelines.
- [Scenes and StayTools](./scene-and-tools.md): query, transform, record, transfer, and render scenes.
- [Current limitations](./known-limitations.md): behavior that the current runtime does not provide reliably.
- [Example gallery](https://lezhu1234.github.io/react-stay-canvas/): explore common capabilities through 10 focused examples and 3 integrated workflows.

If this is your first time using the library, work through Getting started before reading Core concepts. The API reference is much easier to use once the scene and event models are familiar.

## Advanced guide

- [Custom Shapes](./advanced/custom-shapes.md): implement drawing, bounds, hit testing, copies, movement, and updates.

## API reference

- [StayCanvas](./api/stay-canvas.md)
- [Children and Shapes](./api/children-and-shapes.md)
- [Events and Listeners](./api/events-and-listeners.md)
- [StayTools](./api/stay-tools.md)

## Terminology

The documentation keeps public identifiers in English instead of inventing translated names for code concepts.

| Identifier | Meaning in these docs |
| --- | --- |
| Canvas | A stack of equally sized native `<canvas>` layers and the runtime that manages them |
| Child | A queryable, hittable scene object that can be manipulated as one unit |
| Shape | Geometry, drawing, and hit-testing behavior owned by a Child |
| Listener | A handler selected by event, state, and selector |
| Event | A definition that converts matching DOM input into an action; manual actions use a direct dispatch path |
| StayTools | The scene-operation API for one Canvas instance |

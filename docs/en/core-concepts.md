# Core concepts

[Documentation home](./README.md) · [中文](../zh/core-concepts.md)

`react-stay-canvas` does not try to express the Canvas API as a JSX tree. It provides a persistent scene model that can be queried, mutated, rendered, and interacted with over time. React owns component lifetime and surrounding UI; the Canvas runtime owns scene objects, drawing, hit testing, and action routing.

## The model at a glance

```text
React application
└── StayCanvas
    ├── Canvas layer 0
    ├── Canvas layer 1
    ├── ...
    └── scene runtime
        ├── Child
        │   ├── Shape
        │   └── Shape
        ├── Child
        │   └── Shape
        ├── Event definitions
        ├── Listeners
        └── StayTools
```

Three boundaries make the rest of the library easier to understand:

- Layers separate drawing passes and establish broad paint order.
- A Child is a scene object and interaction target.
- A Shape owns geometry and drawing; one Child may contain one or several Shapes.

## `StayCanvas`: the scene boundary

`StayCanvas` connects React to the Canvas runtime. It:

- creates the requested native Canvas layers;
- installs Events and Listeners;
- creates the instance's `StayTools` API;
- optionally recreates the runtime after size changes and always cleans it up when the component is recreated or unmounts.

Its `width` and `height` define the scene coordinate space. `layers` controls the number of overlapping native `<canvas>` elements.

Scene content is not represented by React children. Populate and update it through `StayTools` and Child or Shape methods from `mounted`, Listener callbacks, and application commands.

## Shape: geometry and drawing

A Shape represents a concrete graphic, such as:

- `Rectangle`
- `Circle`
- `Line`
- `StayText`
- `StayImage`

Each Shape stores its geometry, styles, layer, and `zIndex`. It is responsible for:

- drawing itself;
- reporting its bounds and center;
- testing whether a point is inside it;
- moving, zooming, and updating its properties;
- producing intermediate animation states when supported.

A Shape is not an independent selector target. Once appended, it belongs to a Child.

## Child: scene object and interaction unit

A Child gives one or more Shapes a shared:

- `id`;
- `className`;
- selector and query identity;
- hit-test result;
- combined bounding box;
- movement and zoom boundary;
- history identity.

A button may contain a background Rectangle and a text Shape. Put them in the same Child so clicks on either part resolve to the same object and both parts move together.

```tsx
tools.appendChild({
  id: "save-button",
  className: "toolbar-button",
  shape: [
    new Rectangle({
      x: 32,
      y: 32,
      width: 140,
      height: 52,
      fillConfig: { color: { r: 49, g: 95, b: 207, a: 1 } },
    }),
    new StayText({
      x: 102,
      y: 49,
      text: "Save",
      fillConfig: { color: { r: 255, g: 255, b: 255, a: 1 } },
    }),
  ],
})
```

`child.shape` returns the first Shape and is convenient for the common single-Shape case. Use `child.shapeMap` when a Child deliberately contains multiple Shapes.

## Layers and `zIndex`

Paint order has two levels:

1. `layer` chooses the native Canvas on which a Shape is drawn. Higher layers appear above lower layers as a whole.
2. `zIndex` orders Shapes within the same layer.

A Shape on a lower layer cannot cover a Shape on a higher layer, regardless of its `zIndex`.

Every Shape in a multi-Shape Child may use a different layer. A diagram can therefore keep edges on a lower layer and nodes above them while still grouping each node's rectangle and label into one Child.

## `StayTools`: operations for one instance

`StayTools` groups operations on the current scene:

- create and remove Children;
- query Children by id, selector, area, or point;
- switch scene state;
- pan, zoom, and reset the scene;
- record, undo, and redo static content;
- create and advance animated Children;
- import, export, and capture scene content;
- trigger actions or remove Listeners.

It is an instance object, not a global service. Do not share one `StayTools` reference between different `StayCanvas` instances.

## Selectors find Children

Selectors match Child ids and class names:

- `.node` matches Children whose `className` is `node` (state-suffixed values such as `node:active` belong to the same class);
- `#node-a` matches the Child whose id is `node-a`;
- `.node|.label` matches either class;
- `#node-a&.node` matches both an id and its base class;
- `.node&!#node-a` matches nodes except one explicit id.

The same selector language powers query tools and Listener target filters. A selector returns Children, not individual Shapes.

`className` is not a DOM-style whitespace-separated class list. A Child has one base class and may add a colon suffix such as `node:active`; `.node` matches it, while `.node:active` matches the full value.

## State gates Listeners

The runtime has one current state. A Listener can be enabled only in a named state, allowing draw mode and select mode to use different behavior.

Changing state does not modify scene content. It changes which Listeners may handle subsequent actions and resets the state-scoped temporary store. Data that must survive mode changes belongs in the persistent store or application state.

## Events and Listeners separate input from behavior

The event system has two layers:

- An Event definition decides how an action is produced from matching DOM input.
- A Listener receives actions selected by event name, state, and selector, then performs scene or application work.

Manual actions are dispatched directly to Listeners and do not evaluate registered Event definitions. Although the public trigger type includes `"frame"`, the current renderer does not emit that trigger.

Predefined Events cover common clicks, drags, moves, wheels, keyboard input, and history shortcuts. Most applications only configure Listeners. Define or override Events when you need different trigger conditions or a new composed action.

Continuous gestures also have explicit start, continuation, normal end, and cancellation phases. Releases outside the Canvas, window blur, and browser cancellation converge on one terminal path. See [Interaction and events](./interaction-and-events.md) for the detailed contracts.

## Static and animated Children

`appendChild` creates a static `StayInstantChild`. Static Children are suited to editor objects, annotations, and diagram nodes that are mutated directly, and they participate in normal history snapshots.

`createChild` creates a `StayAnimatedChild`. Animated Children are driven by keyframes and explicit time through `progress`; ordinary static history snapshots do not freeze them at an interpolated frame.

Both use the same drawing and Child model, but their lifetimes and update sources differ. Do not simulate animation by repeatedly rebuilding static Children from React state.

## Recommended ownership boundary

- React state: toolbars, panels, selected-item details, routes, and other DOM UI.
- Canvas runtime: scene Children, Shapes, hit testing, and interaction sessions.
- Listeners: translate actions into scene commands and application feedback.
- `StayTools`: execute commands against the current Canvas instance.

This boundary avoids two common failures: rebuilding the Canvas scene from React on every frame, or forcing the Canvas runtime to become the data model for the entire application.

## Related examples

- [Shapes](https://lezhu1234.github.io/react-stay-canvas/#/simple/shapes): built-in Shapes and style updates.
- [Children](https://lezhu1234.github.io/react-stay-canvas/#/simple/children): single- and multi-Shape Child lifetime.
- [Layers](https://lezhu1234.github.io/react-stay-canvas/#/simple/layers): Canvas layers and same-layer `zIndex`.
- [Selectors](https://lezhu1234.github.io/react-stay-canvas/#/simple/selectors): ids, classes, logical expressions, and hit testing.
- [State](https://lezhu1234.github.io/react-stay-canvas/#/simple/state): mode-scoped Listeners, persistent store, and state store.

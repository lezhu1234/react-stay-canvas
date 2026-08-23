# Getting started

[Documentation home](./README.md) · [中文](../zh/getting-started.md)

Create a fixed-size Canvas scene, append a rectangle when the runtime mounts, then update and remove that scene object from React controls.

## Install

```bash
npm install react-stay-canvas
```

`react-stay-canvas` uses React but does not bundle it. Your application must provide the required `react` and `react-dom` versions.

## Render your first scene

```tsx
import { Rectangle, StayCanvas, type StayTools } from "react-stay-canvas"

function mounted(tools: StayTools) {
  tools.appendChild({
    id: "welcome-card",
    className: "card",
    shape: new Rectangle({
      x: 40,
      y: 40,
      width: 160,
      height: 96,
      fillConfig: { color: { r: 219, g: 231, b: 255, a: 1 } },
      strokeConfig: { color: { r: 49, g: 95, b: 207, a: 1 }, lineWidth: 2 },
    }),
  })
}

export function Demo() {
  return <StayCanvas width={440} height={260} mounted={mounted} />
}
```

Three things happen here:

1. `StayCanvas` creates the scene runtime and a stack of native Canvas layers.
2. `mounted` receives the `StayTools` instance after this Canvas is ready.
3. `appendChild` creates a Child whose Rectangle Shape defines its geometry and drawing.

Colors currently use RGBA objects shaped as `{ r, g, b, a }`, with RGB values from 0–255 and `a` from 0–1.

## Canvas size and page layout

`width` and `height` define the actual scene size, not just its CSS presentation. The component creates a wrapper of that size and positions every native `<canvas>` layer on top of the others.

```tsx
<div className="canvas-shell">
  <StayCanvas width={440} height={260} mounted={mounted} />
</div>
```

```css
.canvas-shell {
  width: fit-content;
  max-width: 100%;
  overflow: auto;
}
```

Use the outer layout to control spacing, scrolling, and responsive placement. Axis-aligned CSS scaling may change the displayed size: native pointer coordinates are normalized back into the `width` × `height` scene before event conditions, target hit testing, and Listeners run. Display scaling does not change scene geometry or bitmap resolution; change `width` and `height` and rebuild when the logical drawing resolution must change. Rotation, skew, and mirroring are not supported coordinate transforms.

The `layers` prop controls how many native Canvas elements form the scene. For example, `layers={3}` creates three equally sized, overlapping layers—not three side-by-side scenes.

## Keep and manipulate a Child

`appendChild` returns the new Child. Keep that reference when later controls need to update its Shapes.

```tsx
import { useRef } from "react"
import {
  Rectangle,
  StayCanvas,
  type StayInstantChild,
  type StayTools,
} from "react-stay-canvas"

export function EditableDemo() {
  const toolsRef = useRef<StayTools | null>(null)
  const cardRef = useRef<StayInstantChild<Rectangle> | null>(null)

  const mounted = (tools: StayTools) => {
    toolsRef.current = tools
    cardRef.current = tools.appendChild({
      id: "editable-card",
      className: "card",
      shape: new Rectangle({
        x: 40,
        y: 40,
        width: 160,
        height: 96,
        fillConfig: { color: { r: 219, g: 231, b: 255, a: 1 } },
      }),
    })
  }

  const moveRight = () => {
    cardRef.current?.shape.move(20, 0)
  }

  const remove = () => {
    const card = cardRef.current
    if (!card || !toolsRef.current) return
    toolsRef.current.removeChild(card.id)
    cardRef.current = null
  }

  return (
    <>
      <StayCanvas width={440} height={260} mounted={mounted} />
      <button onClick={moveRight}>Move right</button>
      <button onClick={remove}>Remove</button>
    </>
  )
}
```

Shape methods such as `move`, `update`, and `zoom` notify the owning Child and renderer. You normally do not need to rebuild the entire scene through React state.

## `mounted` and instance lifetime

`StayTools` belongs to the Canvas instance that created it:

- `mounted` runs after the component initializes its first runtime.
- Calling `reCreate()` through the component ref destroys that runtime, creates another one, and calls `mounted` again.
- After the component unmounts, previously saved Child and `StayTools` references must no longer be used.

When a Canvas is recreated, let `mounted` repopulate the scene and replace saved references with those from the new instance.

## Next steps

- Read [Core concepts](./core-concepts.md) to understand why Children, Shapes, and layers are separate.
- Open the [example gallery](https://lezhu1234.github.io/react-stay-canvas/) and start with the Shapes, Children, and Layers examples.
- Continue with [Interaction and events](./interaction-and-events.md) for Listeners, dragging, selectors, and Pointer Sessions.

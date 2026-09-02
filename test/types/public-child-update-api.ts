import {
  Rectangle,
  type StayAnimatedChild,
  type StayInstantChild,
  type StayInstantChildUpdateProps,
} from "react-stay-canvas"

declare const child: StayInstantChild<Rectangle>
declare const animatedChild: StayAnimatedChild<Rectangle>

const replacement = new Rectangle({ x: 20, y: 30, width: 40, height: 50 })
const update: StayInstantChildUpdateProps<Rectangle> = {
  className: "annotation:selected",
  shape: new Map([["body", replacement]]),
  placement: { type: "affine", x: 10, rotation: 15 },
}

const returnedChild: StayInstantChild<Rectangle> = child.update(update)
child.update({ shape: replacement })
child.update({ shape: [replacement] })
child.update({ placement: child.placement })
child.update({ placement: { type: "affine", matrix: { a: 1, b: 0, c: 0, d: 1, e: 5, f: 6 } } })

// @ts-expect-error A Child id is stable after insertion into the Canvas.
child.update({ id: "replacement-id" })
// @ts-expect-error zIndex belongs to Shape.update(...), not Child.update(...).
child.update({ zIndex: 2 })
// @ts-expect-error transitions belong to animated Shapes, not Child.update(...).
child.update({ transition: { durationMs: 200 } })

animatedChild.update({ className: "timeline:selected" })
animatedChild.update({ placement: { type: "affine", x: 10 } })
// @ts-expect-error Animated Shape composition is owned by timeline slices.
animatedChild.update({ shape: replacement })

void returnedChild

import type { EasingFunction } from "../../types/animation"
import type { PointType, Rect } from "../../types/geometry"
import type { SceneSubmission } from "../../types/scene"
import type { AnimatedShapeProps, ShapeDrawProps, ShapeProps } from "../../types/shapes"
import { AnimatedShape } from "../animatedShape"
import { componentIsVisible, copyShape } from "./composition"
import { defaultShapeTransitionRegistry } from "./registry"
import type { ShapeTransitionEffect, ShapeTransitionRegistry, TransitionComponent } from "./types"

export interface SceneTransitionShapeProps extends AnimatedShapeProps {
  readonly mode: ShapeTransitionEffect
  readonly components: readonly TransitionComponent[]
  readonly registry?: ShapeTransitionRegistry
}

type TransitionShapeConstructor = new (props: SceneTransitionShapeProps) => SceneTransitionShape

function unionComponentBounds(components: readonly TransitionComponent[]): Rect {
  const visible = components.filter(componentIsVisible)
  const bounds = (visible.length > 0 ? visible : components).map(({ shape }) => shape.getBound())
  const left = Math.min(...bounds.map(({ x }) => x))
  const top = Math.min(...bounds.map(({ y }) => y))
  const right = Math.max(...bounds.map(({ x, width }) => x + width))
  const bottom = Math.max(...bounds.map(({ y, height }) => y + height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** Native drawable composition sampled by the existing AnimatedShape timeline. */
export class SceneTransitionShape extends AnimatedShape {
  readonly components: readonly TransitionComponent[]
  readonly mode: ShapeTransitionEffect
  readonly registry: ShapeTransitionRegistry

  constructor({ mode, components, registry = defaultShapeTransitionRegistry, ...props }: SceneTransitionShapeProps) {
    const representative = components[components.length - 1].shape
    super({
      layer: representative.layer,
      zIndex: representative.zIndex,
      globalConfig: representative.globalConfig,
      transition: representative.transition,
      shapeStoreValueEquals: representative.shapeStoreValueEquals,
      ...props,
    })
    this.components = components
    this.mode = mode
    this.registry = registry
  }

  private create(components: readonly TransitionComponent[]): SceneTransitionShape {
    const Constructor = this.constructor as TransitionShapeConstructor
    return new Constructor({
      ...this.copyProps(), components, mode: this.mode, registry: this.registry,
    })
  }

  childSameAs(shape: AnimatedShape): boolean {
    return shape instanceof SceneTransitionShape &&
      this.mode === shape.mode && this.registry === shape.registry &&
      this.components.length === shape.components.length &&
      this.components.every((component, index) =>
        component.opacity === shape.components[index].opacity &&
        component.shape.sameAs(shape.components[index].shape))
  }

  commonDraw({ context, ...drawProps }: ShapeDrawProps): void {
    for (const component of this.components) {
      if (!componentIsVisible(component)) continue
      context.save()
      try {
        context.globalAlpha *= component.opacity
        component.shape.draw({ context, ...drawProps, forchDraw: true })
      } finally {
        context.restore()
      }
    }
  }

  override contains(point: PointType): boolean {
    return this.components.some((component) =>
      componentIsVisible(component) && component.shape.contains(point))
  }

  copy(): SceneTransitionShape {
    return this.create(this.components.map(({ shape, opacity }) => ({ shape: copyShape(shape), opacity })))
  }

  fill(): void {}
  stroke(): void {}
  getBound(): Rect { return unionComponentBounds(this.components) }
  override shouldCullByBounds(): boolean {
    return this.components.every(({ shape }) => shape.shouldCullByBounds())
  }
  getTransProps(): string[] { return [] }

  intermediateState(
    beforeShape: AnimatedShape,
    afterShape: AnimatedShape,
    ratio: number,
    transitionType: EasingFunction
  ): SceneTransitionShape {
    const before = beforeShape as SceneTransitionShape
    const after = afterShape as SceneTransitionShape
    if (ratio === 0) return before.copy()
    if (ratio === 1) return after.copy()
    const progress = this.getNumberIntermediateState(0, 1, ratio, transitionType)
    const components = after.registry.sample({ before, after, ratio, progress, transitionType })
    return after.create(components)
  }

  move(offsetX: number, offsetY: number): void {
    for (const { shape } of this.components) shape.move(offsetX, offsetY)
  }

  override shouldFill(): boolean { return this.components.some(componentIsVisible) }
  override shouldStroke(): boolean { return false }

  update(props: ShapeProps): this {
    this.applyUpdate(props)
    return this
  }

  zeroShape(shapeFramesMap: Map<string, AnimatedShape[]> = new Map()): SceneTransitionShape {
    return this.create(this.components.map(({ shape, opacity }) => ({
      shape: shape.zeroShape(shapeFramesMap), opacity,
    })))
  }

  zoom(zoomScale: number): void {
    for (const { shape } of this.components) shape.zoom(zoomScale)
  }
}

// Constructor identity preserves each native shape family's sameAs contract.
const transitionConstructors = new WeakMap<Function, TransitionShapeConstructor>()

function transitionConstructorFor(shape: AnimatedShape): TransitionShapeConstructor {
  const nativeConstructor = shape.constructor
  const registered = transitionConstructors.get(nativeConstructor)
  if (registered) return registered
  class NativeTransitionShape extends SceneTransitionShape {}
  transitionConstructors.set(nativeConstructor, NativeTransitionShape)
  return NativeTransitionShape
}

/** Adopts native geometry. Scene preparation and copy() create runtime-owned copies. */
export function wrapSceneShape(
  shape: AnimatedShape,
  mode: ShapeTransitionEffect,
  registry: ShapeTransitionRegistry = defaultShapeTransitionRegistry
): SceneTransitionShape {
  const Constructor = transitionConstructorFor(shape)
  return new Constructor({ mode, components: [{ shape, opacity: 1 }], registry })
}

export function wrapSceneSubmission(
  submission: SceneSubmission,
  mode: ShapeTransitionEffect,
  registry: ShapeTransitionRegistry = defaultShapeTransitionRegistry
): SceneSubmission {
  return {
    ...submission,
    children: submission.children.map((child) => ({
      ...child,
      slices: child.slices.map((slice) => ({
        ...slice, frames: slice.frames.map((shape) => wrapSceneShape(shape, mode, registry)),
      })),
    })),
  }
}

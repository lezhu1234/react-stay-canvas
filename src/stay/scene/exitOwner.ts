import type { AnimatedShape } from "../../shapes/animatedShape"
import type { InstantShape } from "../../shapes/instantShape"
import type { SceneShapeReference } from "../../types/scene"
import { fitRect } from "../../utils/geometry"
import { exitFitTransition } from "../../shapes/transitions/exitFit"
import { createShapeTransitionRegistry } from "../../shapes/transitions/registry"
import { SceneTransitionShape, type SceneTransitionShapeProps } from "../../shapes/transitions/sceneTransitionShape"

const EXIT_OWNER = "sceneExitOwner"
const exitFitRegistry = createShapeTransitionRegistry([exitFitTransition])

/** References an enclosing surface in the same Child placement coordinate space. */
export function setSceneExitOwner<T extends InstantShape>(shape: T, owner: SceneShapeReference): T {
  shape.shapeStore.set(EXIT_OWNER, { ...owner })
  return shape
}

export function sceneExitOwner(shape: InstantShape): SceneShapeReference | undefined {
  return shape.shapeStore.get(EXIT_OWNER)
}

export type SceneShapeLookup = (reference: SceneShapeReference) => AnimatedShape | undefined
export type SceneExitShapeFactory = (source: AnimatedShape, zeroShape: () => AnimatedShape) => AnimatedShape
export type SceneShapeIndex = Map<string, Map<string, AnimatedShape>>

/** Completes only the explicit enclosing-surface chains needed by this projection. */
export function includeSceneExitOwners(shapes: SceneShapeIndex, findSource: SceneShapeLookup): void {
  shapes.forEach((members) => members.forEach((source) => {
    let reference = sceneExitOwner(source)
    while (reference) {
      const owner = findSource(reference)
      if (!owner) return
      const ownerShapes = shapes.get(reference.childId) ?? new Map<string, AnimatedShape>()
      ownerShapes.set(reference.shapeName, owner)
      shapes.set(reference.childId, ownerShapes)
      reference = sceneExitOwner(owner)
    }
  }))
}

/** The timeline owns time; this only chooses the native geometric endpoint. */
export function createSceneExitShape(
  source: AnimatedShape,
  zeroShape: () => AnimatedShape,
  findSource: SceneShapeLookup,
  findTarget: SceneShapeLookup,
): AnimatedShape {
  const endpoint = zeroShape()
  const owner = survivingExitOwner(source, findSource, findTarget)
  if (!owner) return endpoint
  const bounds = owner.source.getBound()
  const fit = fitRect(bounds, owner.target.getBound())
  endpoint.zoom(fit.scale)
  endpoint.move(fit.rect.x - bounds.x * fit.scale, fit.rect.y - bounds.y * fit.scale)
  endpoint.transition = { ...endpoint.transition, type: owner.target.transition.type }
  setSceneExitOwner(endpoint, owner.reference)
  return exitFitEndpoint(endpoint)
}

function exitFitEndpoint(endpoint: AnimatedShape): AnimatedShape {
  if (!(endpoint instanceof SceneTransitionShape)) return endpoint
  const Constructor = endpoint.constructor as new (props: SceneTransitionShapeProps) => SceneTransitionShape
  return new Constructor({
    ...endpoint.copyProps(),
    components: endpoint.components,
    mode: "scene-exit-fit",
    registry: exitFitRegistry,
  })
}

function survivingExitOwner(source: AnimatedShape, findSource: SceneShapeLookup, findTarget: SceneShapeLookup) {
  let reference = sceneExitOwner(source)
  while (reference) {
    const previous = findSource(reference)
    if (!previous) return
    const target = findTarget(reference)
    if (target && positiveArea(previous) && positiveArea(target)) return { source: previous, target, reference }
    reference = sceneExitOwner(previous)
  }
}

function positiveArea(shape: AnimatedShape): boolean {
  const bounds = shape.getBound()
  return bounds.width > 0 && bounds.height > 0
}

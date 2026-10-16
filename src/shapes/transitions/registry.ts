import { crossfadeTransition } from "./crossfade"
import { morphTransition } from "./morph"
import { textGlyphTransition } from "./textGlyph"
import type { ShapeTransitionModule, ShapeTransitionRegistry, ShapeTransitionSample } from "./types"

/** Ordered, immutable registration: the first matching module owns a sample. */
export function createShapeTransitionRegistry(
  modules: readonly ShapeTransitionModule[]
): ShapeTransitionRegistry {
  const ids = new Set<string>()
  const registered = Object.freeze(modules.map((module) => {
    if (ids.has(module.id)) throw new Error(`Duplicate shape transition module id: ${module.id}`)
    if (module.contractVersion !== 1) throw new Error(`Unsupported shape transition module contract: ${module.id}`)
    ids.add(module.id)
    return Object.freeze({ ...module })
  }))
  return Object.freeze({
    modules: registered,
    sample(sample: ShapeTransitionSample) {
      const module = registered.find((candidate) => candidate.matches(sample))
      if (!module) throw new Error("No registered shape transition module matches this state pair")
      return module.sample(sample)
    },
  })
}

export const defaultShapeTransitionRegistry = createShapeTransitionRegistry([
  crossfadeTransition, textGlyphTransition, morphTransition,
])

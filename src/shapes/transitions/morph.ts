import { morphTarget, primaryComponentIndex, sampleNativeShape } from "./composition"
import type { ShapeTransitionModule } from "./types"

export const morphTransition = Object.freeze<ShapeTransitionModule>({
  id: "morph",
  contractVersion: 1,
  matches: ({ after }) => after.mode === "morph",
  sample: (sample) => {
    const { before, progress } = sample
    const target = morphTarget(sample)
    const primaryIndex = primaryComponentIndex(before.components)
    return before.components.map(({ shape, opacity }, index) => ({
      shape: sampleNativeShape(shape, target, sample),
      opacity: opacity * (1 - progress) + (index === primaryIndex ? progress : 0),
    }))
  },
})

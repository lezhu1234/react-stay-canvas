import { sampleNativeShape } from "./composition"
import type { ShapeTransitionModule } from "./types"

/** A fading composition keeps every visible component and its native geometry. */
export const exitFitTransition = Object.freeze<ShapeTransitionModule>({
  id: "scene-exit-fit",
  contractVersion: 1,
  matches: ({ after }) => after.mode === "scene-exit-fit",
  sample: (sample) => sample.before.components.map(({ shape, opacity }, index) => ({
    shape: sampleNativeShape(shape, sample.after.components[index].shape, sample),
    opacity,
  })),
})

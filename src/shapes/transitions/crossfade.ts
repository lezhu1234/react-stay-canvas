import { copyShape } from "./composition"
import type { ShapeTransitionModule } from "./types"

export const crossfadeTransition = Object.freeze<ShapeTransitionModule>({
  id: "crossfade",
  contractVersion: 1,
  matches: ({ after }) => after.mode === "crossfade",
  sample: ({ before, after, progress }) => [
    ...before.components.map(({ shape, opacity }) => ({
      shape: copyShape(shape), opacity: opacity * (1 - progress),
    })),
    ...after.components.map(({ shape, opacity }) => ({
      shape: copyShape(shape), opacity: opacity * progress,
    })),
  ],
})

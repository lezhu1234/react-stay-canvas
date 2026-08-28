// Runtime mappings and backend executors remain internal. Public callers own
// only the projective placement matrix and domain.
// @ts-expect-error FiniteProjectiveMapping is intentionally not exported by the package.
import type { FiniteProjectiveMapping } from "react-stay-canvas"
// @ts-expect-error ProjectiveRenderProjection is intentionally not exported.
import type { ProjectiveRenderProjection } from "react-stay-canvas"
// @ts-expect-error WebGL RenderPlan execution remains an internal backend slice.
import { executeWebGLRenderPlan } from "react-stay-canvas"
// @ts-expect-error WebGL affine batching remains an internal backend detail.
import { rasterizeWebGLAffineBatch } from "react-stay-canvas"

export type InternalProjectiveTypes =
  FiniteProjectiveMapping | ProjectiveRenderProjection

export const internalWebGLExecutor = executeWebGLRenderPlan
export const internalWebGLAffineBatch = rasterizeWebGLAffineBatch

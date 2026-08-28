// Runtime mappings remain internal. Public callers own only the projective
// placement matrix and domain.
// @ts-expect-error FiniteProjectiveMapping is intentionally not exported by the package.
import type { FiniteProjectiveMapping } from "react-stay-canvas"
// @ts-expect-error ProjectiveRenderProjection is intentionally not exported.
import type { ProjectiveRenderProjection } from "react-stay-canvas"

export type InternalProjectiveTypes =
  FiniteProjectiveMapping | ProjectiveRenderProjection

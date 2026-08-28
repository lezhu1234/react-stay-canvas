// The projective model remains internal until a renderer proves its public contract.
// @ts-expect-error ProjectiveMatrix2D is intentionally not exported by the package.
import type { ProjectiveMatrix2D } from "react-stay-canvas"
// @ts-expect-error FiniteProjectiveMapping is intentionally not exported by the package.
import type { FiniteProjectiveMapping } from "react-stay-canvas"
// @ts-expect-error ProjectiveRenderProjection is intentionally not exported.
import type { ProjectiveRenderProjection } from "react-stay-canvas"

export type InternalProjectiveTypes =
  ProjectiveMatrix2D | FiniteProjectiveMapping | ProjectiveRenderProjection

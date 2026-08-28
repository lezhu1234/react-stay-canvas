import {
  Rectangle,
  type ChildPlacement,
  type ChildPlacementSnapshot,
  type ProjectiveMatrix2D,
  type StayInstantChild,
  type StayTools,
} from "react-stay-canvas"

declare const tools: StayTools
declare const child: StayInstantChild

const projectiveMatrix: ProjectiveMatrix2D = {
  m00: 1, m01: 0, m02: 20,
  m10: 0, m11: 1, m12: 10,
  m20: 0.002, m21: 0, m22: 1,
}
const affine: ChildPlacement = { type: "affine", x: 20, rotation: 15 }
const projective: ChildPlacement = {
  type: "projective",
  matrix: projectiveMatrix,
  domain: { x: 0, y: 0, width: 100, height: 80 },
}

tools.appendChild({
  className: "affine",
  shape: new Rectangle({ x: 0, y: 0, width: 20, height: 10 }),
  placement: affine,
})
tools.appendChild({
  className: "projective",
  shape: new Rectangle({ x: 0, y: 0, width: 100, height: 80 }),
  placement: projective,
})
child.setPlacement(projective)
const snapshot: ChildPlacementSnapshot = child.placement

// @ts-expect-error A projective placement requires an explicit finite domain.
child.setPlacement({ type: "projective", matrix: projectiveMatrix })
// @ts-expect-error Affine and projective fields cannot be combined.
child.setPlacement({ type: "affine", matrix: projectiveMatrix, domain: { x: 0, y: 0, width: 1, height: 1 } })
// @ts-expect-error The unpublished transform compatibility name was removed.
child.setTransform({ x: 10 })
// @ts-expect-error The unpublished transform getter was removed.
child.transform

void snapshot

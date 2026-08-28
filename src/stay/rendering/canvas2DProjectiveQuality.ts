import type { FiniteProjectiveMapping } from "../transforms/projective2D"
import type { ProjectiveMesh } from "./renderPlan"

interface Canvas2DProjectiveQualityProps {
  readonly mapping: FiniteProjectiveMapping
  readonly outputWidth: number
  readonly outputHeight: number
  readonly contentScaleX: number
  readonly contentScaleY: number
}

export interface Canvas2DProjectiveQuality {
  readonly mesh: ProjectiveMesh
  readonly rasterScale: number
}

const MAX_MESH_EDGE_PIXELS = 24

function positive(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be finite and greater than 0`)
  }
  return value
}

/**
 * @internal Resolves a bounded Canvas2D approximation from the current output
 * surface. Raster dimensions never exceed that surface, while the uniform mesh
 * keeps projected triangle edges at roughly 24 output pixels or less.
 */
export function resolveCanvas2DProjectiveQuality({
  mapping,
  outputWidth,
  outputHeight,
  contentScaleX,
  contentScaleY,
}: Canvas2DProjectiveQualityProps): Canvas2DProjectiveQuality {
  const width = positive(outputWidth, "projective output width")
  const height = positive(outputHeight, "projective output height")
  const scaleX = positive(Math.abs(contentScaleX), "projective Content scale X")
  const scaleY = positive(Math.abs(contentScaleY), "projective Content scale Y")
  const projectedWidth = Math.min(width, mapping.contentBounds.width * scaleX)
  const projectedHeight = Math.min(height, mapping.contentBounds.height * scaleY)
  const domain = mapping.localDomain
  const desiredRasterScale = Math.max(
    projectedWidth / domain.width,
    projectedHeight / domain.height
  )
  const boundedRasterScale = Math.min(
    desiredRasterScale,
    width / domain.width,
    height / domain.height
  )
  return {
    mesh: {
      columns: Math.max(1, Math.ceil(projectedWidth / MAX_MESH_EDGE_PIXELS)),
      rows: Math.max(1, Math.ceil(projectedHeight / MAX_MESH_EDGE_PIXELS)),
    },
    rasterScale: positive(boundedRasterScale, "projective raster scale"),
  }
}


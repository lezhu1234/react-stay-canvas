import type { InstantShape } from "../../shapes/instantShape"
import type { DrawCanvasContext } from "../../types/canvas"
import type { FiniteProjectiveMapping } from "../transforms/projective2D"

export interface ProjectiveRasterSpec {
  readonly scale: number
  readonly width: number
  readonly height: number
}

interface ProjectiveRasterProps {
  readonly targetCanvas: HTMLCanvasElement | OffscreenCanvas
  readonly shape: InstantShape
  readonly mapping: FiniteProjectiveMapping
  readonly spec: ProjectiveRasterSpec
  readonly now: number
  readonly width: number
  readonly height: number
  readonly forceDraw?: boolean
}

export function positiveInteger(value: number, name: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`)
  }
  return value
}

export function positiveFinite(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be finite and greater than 0`)
  }
  return value
}

export function resolveProjectiveRasterSpec(
  mapping: FiniteProjectiveMapping,
  rasterScale: number
): ProjectiveRasterSpec {
  const scale = positiveFinite(rasterScale, "projective raster scale")
  return {
    scale,
    width: positiveInteger(
      Math.ceil(mapping.localDomain.width * scale),
      "projective raster width"
    ),
    height: positiveInteger(
      Math.ceil(mapping.localDomain.height * scale),
      "projective raster height"
    ),
  }
}

export function assertProjectiveShapeCanRasterize(shape: InstantShape) {
  // Destination-dependent composition cannot be reproduced inside an isolated
  // Shape raster. Both Canvas2D and WebGL share this compatibility boundary.
  if (shape.globalConfig.gco !== "source-over") {
    throw new RangeError(
      "projective rendering currently supports source-over Shapes"
    )
  }
}

function createRasterSurface(
  targetCanvas: HTMLCanvasElement | OffscreenCanvas,
  width: number,
  height: number
) {
  let canvas: HTMLCanvasElement | OffscreenCanvas
  if ("ownerDocument" in targetCanvas && targetCanvas.ownerDocument) {
    canvas = targetCanvas.ownerDocument.createElement("canvas")
  } else if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(width, height)
  } else {
    throw new Error("projective rendering requires a raster canvas")
  }
  canvas.width = width
  canvas.height = height
  if (canvas.width !== width || canvas.height !== height) {
    throw new RangeError("projective raster dimensions are unsupported")
  }
  const context = canvas.getContext("2d") as DrawCanvasContext | null
  if (!context) {
    throw new Error("Unable to get projective raster 2D context")
  }
  return { canvas, context }
}

export function rasterizeProjectiveShape({
  targetCanvas,
  shape,
  mapping,
  spec,
  now,
  width,
  height,
  forceDraw,
}: ProjectiveRasterProps) {
  assertProjectiveShapeCanRasterize(shape)
  const surface = createRasterSurface(targetCanvas, spec.width, spec.height)
  const { localDomain } = mapping

  surface.context.save()
  try {
    surface.context.setTransform(
      spec.scale,
      0,
      0,
      spec.scale,
      -localDomain.x * spec.scale,
      -localDomain.y * spec.scale
    )
    shape.draw({
      context: surface.context,
      now,
      width,
      height,
      forchDraw: forceDraw,
    })
  } finally {
    surface.context.restore()
  }
  return surface.canvas
}

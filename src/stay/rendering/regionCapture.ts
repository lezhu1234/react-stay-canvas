import type { DrawCanvasContext } from "../../types/canvas"
import type { RegionToTargetCanvasProps } from "../../types/children"
import type { Area } from "../../types/geometry"
import { fitRect } from "../../utils/geometry"
import { executeCanvas2DRenderPlan } from "./canvas2DExecutor"
import { resolveCanvas2DProjectiveQuality } from "./canvas2DProjectiveQuality"
import { createLayerRenderPlan } from "./renderPlan"

function prepareRegionContext(
  context: DrawCanvasContext,
  area: Area,
  targetSize: { width: number; height: number }
) {
  const { rect, scale } = fitRect(area, { x: 0, y: 0, ...targetSize })
  context.beginPath()
  context.rect(rect.x, rect.y, rect.width, rect.height)
  context.clip()
  context.translate(rect.x, rect.y)
  context.scale(scale, scale)
  context.translate(-area.x, -area.y)
}

/** Uses the same native projection and drawing pass for DOM and worker output. */
export function renderRegionToSurface<T extends HTMLCanvasElement | OffscreenCanvas>(
  surface: T,
  { area, targetSize = { width: area.width, height: area.height }, children, progress }: RegionToTargetCanvasProps,
  canvas: { width: number; height: number; layerCount: number },
  now = Date.now()
): T {
  surface.width = targetSize.width
  surface.height = targetSize.height
  const context = surface.getContext("2d") as DrawCanvasContext | null
  if (!context) throw new Error("Unable to get capture 2D context")

  const restoreProjections: Array<() => void> = []
  try {
    if (progress !== undefined) {
      children.forEach((child) => {
        restoreProjections.push(child.beginCurrentTimeProjection({ time: progress }))
      })
    }
    const items = Array.from({ length: canvas.layerCount }, (_, layerIndex) =>
      createLayerRenderPlan(children, layerIndex).items).flat()
    context.save()
    try {
      prepareRegionContext(context, area, targetSize)
      executeCanvas2DRenderPlan({
        context, items, getNow: () => now,
        width: canvas.width, height: canvas.height, forceDraw: true,
        getProjectiveQuality: ({ projection }) => {
          if (!projection) throw new Error("projective quality requires a projective RenderItem")
          return resolveCanvas2DProjectiveQuality({
            mapping: projection.mapping,
            outputWidth: surface.width, outputHeight: surface.height,
            contentScaleX: targetSize.width / area.width,
            contentScaleY: targetSize.height / area.height,
          })
        },
      })
    } finally {
      context.restore()
    }
    return surface
  } finally {
    restoreProjections.reverse().forEach((restore) => restore())
  }
}

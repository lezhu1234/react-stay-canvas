import type { StayAnimatedChild } from "../stay/children/stayAnimatedChild"

export function parseLayer(layers: any[] | number, layer: number | undefined) {
  const count = typeof layers === "number" ? layers : layers.length
  const resolvedLayer = layer ?? count - 1
  const normalizedLayer = resolvedLayer < 0 ? count + resolvedLayer : resolvedLayer

  if (normalizedLayer < 0 || normalizedLayer >= count) {
    throw new Error("layer is out of range")
  }
  return normalizedLayer
}

export function isStayAnimatedChild(child: any): child is StayAnimatedChild {
  return child != null && (child as StayAnimatedChild).setCurrentTime !== undefined
}

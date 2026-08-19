import type { StayAnimatedChild } from "../stay/children/stayAnimatedChild"

export function parseLayer(layers: any[], layer: number | undefined) {
  const resolvedLayer = layer ?? layers.length - 1
  const normalizedLayer = resolvedLayer < 0 ? layers.length + resolvedLayer : resolvedLayer

  if (normalizedLayer < 0 || normalizedLayer >= layers.length) {
    throw new Error("layer is out of range")
  }
  return normalizedLayer
}

export function isStayAnimatedChild(child: any): child is StayAnimatedChild {
  return child != null && (child as StayAnimatedChild).setCurrentTime !== undefined
}

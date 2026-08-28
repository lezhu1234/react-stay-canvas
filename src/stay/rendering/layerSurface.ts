export function resizeLayerSurface(
  element: HTMLCanvasElement,
  width: number,
  height: number
) {
  const dpr = window.devicePixelRatio || 1
  element.width = Math.round(width * dpr)
  element.height = Math.round(height * dpr)
  element.style.width = `${width}px`
  element.style.height = `${height}px`
}

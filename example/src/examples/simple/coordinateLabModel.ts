import type { Coordinate, Rect, ViewportState } from "react-stay-canvas"

export const LAB_SHAPE: Readonly<Rect> = {
  x: 145,
  y: 155,
  width: 190,
  height: 120,
}

export type CoordinateProbe = {
  client: Coordinate
  view: Coordinate
  content: Coordinate
  viewSize: { width: number; height: number }
  surface: {
    left: number
    top: number
    width: number
    height: number
    scaleX: number
    scaleY: number
  }
}

export type ShapeProjection = {
  client: Rect
  view: Rect
  content: Rect
}

export function contentAtView(view: Coordinate, viewport: Readonly<ViewportState>) {
  return {
    x: (view.x - viewport.x) / viewport.scale,
    y: (view.y - viewport.y) / viewport.scale,
  }
}

export function visibleContentRange(
  probe: CoordinateProbe,
  viewport: Readonly<ViewportState>,
): Rect {
  return {
    x: -viewport.x / viewport.scale,
    y: -viewport.y / viewport.scale,
    width: probe.viewSize.width / viewport.scale,
    height: probe.viewSize.height / viewport.scale,
  }
}

export function contentReferenceRange(probe: CoordinateProbe): Rect {
  return {
    x: -probe.viewSize.width,
    y: -probe.viewSize.height,
    width: probe.viewSize.width * 3,
    height: probe.viewSize.height * 3,
  }
}

export function containsRect(outer: Readonly<Rect>, inner: Readonly<Rect>) {
  return inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
}

export function projectShape(
  probe: CoordinateProbe,
  viewport: Readonly<ViewportState>,
  content: Readonly<Rect> = LAB_SHAPE,
): ShapeProjection {
  const view = {
    x: content.x * viewport.scale + viewport.x,
    y: content.y * viewport.scale + viewport.y,
    width: content.width * viewport.scale,
    height: content.height * viewport.scale,
  }
  return {
    content: { ...content },
    view,
    client: {
      x: probe.surface.left + view.x / probe.surface.scaleX,
      y: probe.surface.top + view.y / probe.surface.scaleY,
      width: view.width / probe.surface.scaleX,
      height: view.height / probe.surface.scaleY,
    },
  }
}

export const formatPoint = ({ x, y }: Coordinate) => `${Math.round(x)}, ${Math.round(y)}`

export const formatRect = ({ x, y, width, height }: Rect) =>
  `${Math.round(x)}, ${Math.round(y)} / ${Math.round(width)}×${Math.round(height)}`

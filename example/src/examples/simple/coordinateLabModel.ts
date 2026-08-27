import type {
  ClientPoint,
  ContentPoint,
  Coordinate,
  Rect,
  ViewPoint,
  ViewportState,
} from "react-stay-canvas"

export const LAB_SHAPE: Readonly<Rect> = {
  x: 145,
  y: 155,
  width: 190,
  height: 120,
}

export const LAB_CONTENT_BOUNDS: Readonly<Rect> = {
  x: 0,
  y: 0,
  width: 480,
  height: 360,
}

export type LineSegment = {
  x1: number
  y1: number
  x2: number
  y2: number
}

const RECT_CORNERS = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
] as const

export type CoordinateProbe = {
  client: ClientPoint
  view: ViewPoint
  content: ContentPoint
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

export type RectProjection = {
  client: Rect
  view: Rect
  content: Rect
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

export function clientReferenceRange(probe: CoordinateProbe, includedRect?: Readonly<Rect>): Rect {
  const horizontalPadding = probe.surface.width * 0.25
  const topPadding = probe.surface.height
  const bottomPadding = probe.surface.height * 0.1
  const x = probe.surface.left - horizontalPadding
  const y = probe.surface.top - topPadding
  const baseRight = probe.surface.left + probe.surface.width + horizontalPadding
  const baseBottom = probe.surface.top + probe.surface.height + bottomPadding
  const includedPadding = Math.min(probe.surface.width, probe.surface.height) * 0.05
  const right = includedRect
    ? Math.max(baseRight, includedRect.x + includedRect.width + includedPadding)
    : baseRight
  const bottom = includedRect
    ? Math.max(baseBottom, includedRect.y + includedRect.height + includedPadding)
    : baseBottom
  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  }
}

export function containsRect(outer: Readonly<Rect>, inner: Readonly<Rect>) {
  return inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
}

export function correspondingRectCorners(from: Readonly<Rect>, to: Readonly<Rect>) {
  return RECT_CORNERS.map((corner) => ({
    from: {
      x: from.x + from.width * corner.x,
      y: from.y + from.height * corner.y,
    },
    to: {
      x: to.x + to.width * corner.x,
      y: to.y + to.height * corner.y,
    },
  }))
}

export function projectRectToRange(
  value: Readonly<Rect>,
  range: Readonly<Rect>,
  target: Readonly<{ width: number; height: number }>,
): Rect {
  return {
    x: (value.x - range.x) / Math.max(1, range.width) * target.width,
    y: (value.y - range.y) / Math.max(1, range.height) * target.height,
    width: value.width / Math.max(1, range.width) * target.width,
    height: value.height / Math.max(1, range.height) * target.height,
  }
}

export function projectPointToRange(
  value: Readonly<Coordinate>,
  range: Readonly<Rect>,
  target: Readonly<{ width: number; height: number }>,
): Coordinate {
  return {
    x: (value.x - range.x) / Math.max(1, range.width) * target.width,
    y: (value.y - range.y) / Math.max(1, range.height) * target.height,
  }
}

export function projectClientPlane(
  probe: CoordinateProbe,
  viewport: Readonly<ViewportState>,
  clientRange: Readonly<Rect>,
  target: Readonly<{ width: number; height: number }>,
) {
  const shapeProjection = projectContentRect(probe, viewport)
  const boundsProjection = projectContentRect(probe, viewport, LAB_CONTENT_BOUNDS)
  return {
    canvasDom: projectRectToRange({
      x: probe.surface.left,
      y: probe.surface.top,
      width: probe.surface.width,
      height: probe.surface.height,
    }, clientRange, target),
    contentBounds: projectRectToRange(boundsProjection.client, clientRange, target),
    point: projectPointToRange(probe.client, clientRange, target),
    shape: projectRectToRange(shapeProjection.client, clientRange, target),
  }
}

export function clippedRectEdges(rect: Readonly<Rect>, clip: Readonly<Rect>) {
  const left = Math.max(rect.x, clip.x)
  const top = Math.max(rect.y, clip.y)
  const right = Math.min(rect.x + rect.width, clip.x + clip.width)
  const bottom = Math.min(rect.y + rect.height, clip.y + clip.height)
  if (right <= left || bottom <= top) return [undefined, undefined, undefined, undefined]

  const horizontal = (y: number): LineSegment => ({ x1: left, y1: y, x2: right, y2: y })
  const vertical = (x: number): LineSegment => ({ x1: x, y1: top, x2: x, y2: bottom })
  return [
    rect.y >= clip.y && rect.y <= clip.y + clip.height ? horizontal(rect.y) : undefined,
    rect.x + rect.width >= clip.x && rect.x + rect.width <= clip.x + clip.width
      ? vertical(rect.x + rect.width)
      : undefined,
    rect.y + rect.height >= clip.y && rect.y + rect.height <= clip.y + clip.height
      ? horizontal(rect.y + rect.height)
      : undefined,
    rect.x >= clip.x && rect.x <= clip.x + clip.width ? vertical(rect.x) : undefined,
  ]
}

export function projectContentRect(
  probe: CoordinateProbe,
  viewport: Readonly<ViewportState>,
  content: Readonly<Rect> = LAB_SHAPE,
): RectProjection {
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

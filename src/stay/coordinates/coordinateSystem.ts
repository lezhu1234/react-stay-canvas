import type {
  ClientPoint,
  ContentRect,
  ContentPoint,
  ContentVector,
  CoordinateSpace,
  SpaceRect,
  SpacePoint,
  SpaceVector,
  ViewPoint,
  ViewVector,
} from "../../types/coordinates"
import type { Coordinate } from "../../types/geometry"
import type { ViewportOptions, ViewportState } from "../../types/tools"
import { fitRect } from "../../utils/geometry"

export type SurfaceMetrics = Readonly<{
  logicalWidth: number
  logicalHeight: number
  backingWidth: number
  backingHeight: number
  clientRect: Readonly<{
    left: number
    top: number
    width: number
    height: number
  }>
}>

export type CoordinateFrame = Readonly<{
  revision: number
  viewport: Readonly<ViewportState>
  viewBounds: SpaceRect<"view">
  visibleContentArea: SpaceRect<"content">
  contentToView: Readonly<{
    offsetX: number
    offsetY: number
    scale: number
  }>
}>

export type PointerSamples = Readonly<{
  start: Readonly<{ clientX: number; clientY: number }>
  previous: Readonly<{ clientX: number; clientY: number }>
  current: Readonly<{ clientX: number; clientY: number }>
}>

export type PointerCoordinates = Readonly<{
  client: ClientPoint
  view: ViewPoint
  content: ContentPoint
  viewMovement: ViewVector
  viewOffsetFromStart: ViewVector
}>

const asPoint = <S extends CoordinateSpace>(point: Coordinate) => point as SpacePoint<S>
const asVector = <S extends CoordinateSpace>(vector: Coordinate) => vector as SpaceVector<S>
const asRect = <S extends CoordinateSpace>(rect: SpaceRect<S>) => rect

function finite(value: number, name: string) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`)
  return value
}

export class CoordinateSystem {
  readonly #minScale: number
  readonly #maxScale: number
  #viewport: ViewportState = { x: 0, y: 0, scale: 1 }
  #revision = 0
  #cachedFrame?: CoordinateFrame
  #cachedWidth?: number
  #cachedHeight?: number

  constructor({ minScale = 0.1, maxScale = 10 }: ViewportOptions = {}) {
    finite(minScale, "viewport.minScale")
    finite(maxScale, "viewport.maxScale")
    if (minScale <= 0) throw new RangeError("viewport.minScale must be greater than 0")
    if (maxScale < minScale) {
      throw new RangeError("viewport.maxScale must be greater than or equal to minScale")
    }
    this.#minScale = minScale
    this.#maxScale = maxScale
    this.#viewport = { ...this.#viewport, scale: this.#clampScale(1) }
  }

  getViewport(): Readonly<ViewportState> {
    return { ...this.#viewport }
  }

  getFrame(metrics: SurfaceMetrics): CoordinateFrame {
    if (
      this.#cachedFrame &&
      this.#cachedFrame.revision === this.#revision &&
      this.#cachedWidth === metrics.logicalWidth &&
      this.#cachedHeight === metrics.logicalHeight
    ) {
      return this.#cachedFrame
    }

    const viewport = this.getViewport()
    this.#cachedWidth = metrics.logicalWidth
    this.#cachedHeight = metrics.logicalHeight
    this.#cachedFrame = {
      revision: this.#revision,
      viewport,
      viewBounds: asRect<"view">({
        x: 0,
        y: 0,
        width: metrics.logicalWidth,
        height: metrics.logicalHeight,
      }),
      visibleContentArea: asRect<"content">({
        x: -viewport.x / viewport.scale,
        y: -viewport.y / viewport.scale,
        width: metrics.logicalWidth / viewport.scale,
        height: metrics.logicalHeight / viewport.scale,
      }),
      contentToView: {
        offsetX: viewport.x,
        offsetY: viewport.y,
        scale: viewport.scale,
      },
    }
    return this.#cachedFrame
  }

  mapPointer(
    samples: PointerSamples,
    metrics: SurfaceMetrics,
    frame = this.getFrame(metrics)
  ): PointerCoordinates {
    const client = asPoint<"client">({
      x: samples.current.clientX,
      y: samples.current.clientY,
    })
    const view = this.clientToView(client, metrics)
    const previousView = this.clientToView(
      asPoint<"client">({
        x: samples.previous.clientX,
        y: samples.previous.clientY,
      }),
      metrics
    )
    const startView = this.clientToView(
      asPoint<"client">({
        x: samples.start.clientX,
        y: samples.start.clientY,
      }),
      metrics
    )

    return {
      client,
      view,
      content: this.viewToContent(view, frame),
      viewMovement: asVector<"view">({
        x: view.x - previousView.x,
        y: view.y - previousView.y,
      }),
      viewOffsetFromStart: asVector<"view">({
        x: view.x - startView.x,
        y: view.y - startView.y,
      }),
    }
  }

  clientToView(point: ClientPoint, metrics: SurfaceMetrics): ViewPoint {
    const { clientRect } = metrics
    const scaleX = clientRect.width > 0 ? metrics.logicalWidth / clientRect.width : 1
    const scaleY = clientRect.height > 0 ? metrics.logicalHeight / clientRect.height : 1
    return asPoint<"view">({
      x: (point.x - clientRect.left) * scaleX,
      y: (point.y - clientRect.top) * scaleY,
    })
  }

  viewToClient(point: ViewPoint, metrics: SurfaceMetrics): ClientPoint {
    const { clientRect } = metrics
    const scaleX = clientRect.width > 0 && metrics.logicalWidth > 0
      ? clientRect.width / metrics.logicalWidth
      : 1
    const scaleY = clientRect.height > 0 && metrics.logicalHeight > 0
      ? clientRect.height / metrics.logicalHeight
      : 1
    return asPoint<"client">({
      x: clientRect.left + point.x * scaleX,
      y: clientRect.top + point.y * scaleY,
    })
  }

  viewToContent(point: ViewPoint, frame: CoordinateFrame): ContentPoint {
    const { offsetX, offsetY, scale } = frame.contentToView
    return asPoint<"content">({
      x: (point.x - offsetX) / scale,
      y: (point.y - offsetY) / scale,
    })
  }

  contentToView(point: ContentPoint, frame: CoordinateFrame): ViewPoint {
    const { offsetX, offsetY, scale } = frame.contentToView
    return asPoint<"view">({
      x: point.x * scale + offsetX,
      y: point.y * scale + offsetY,
    })
  }

  viewVectorToContent(
    vector: ViewVector,
    frame: CoordinateFrame
  ): ContentVector {
    return asVector<"content">({
      x: vector.x / frame.contentToView.scale,
      y: vector.y / frame.contentToView.scale,
    })
  }

  contentVectorToView(
    vector: ContentVector,
    frame: CoordinateFrame
  ): ViewVector {
    return asVector<"view">({
      x: vector.x * frame.contentToView.scale,
      y: vector.y * frame.contentToView.scale,
    })
  }

  clientToContent(
    point: ClientPoint,
    metrics: SurfaceMetrics,
    frame = this.getFrame(metrics)
  ): ContentPoint {
    return this.viewToContent(this.clientToView(point, metrics), frame)
  }

  contentToClient(
    point: ContentPoint,
    metrics: SurfaceMetrics,
    frame = this.getFrame(metrics)
  ): ClientPoint {
    return this.viewToClient(this.contentToView(point, frame), metrics)
  }

  viewCenterToContent(
    metrics: SurfaceMetrics,
    frame = this.getFrame(metrics)
  ): ContentPoint {
    return this.viewToContent(
      asPoint<"view">({
        x: metrics.logicalWidth / 2,
        y: metrics.logicalHeight / 2,
      }),
      frame
    )
  }

  panBy(delta: ViewVector): Readonly<ViewportState> {
    const x = this.#viewport.x + finite(delta.x, "viewport pan x")
    const y = this.#viewport.y + finite(delta.y, "viewport pan y")
    return this.#replace({ ...this.#viewport, x, y })
  }

  zoomBy(factor: number, anchor: ContentPoint): Readonly<ViewportState> {
    finite(factor, "viewport zoom factor")
    if (factor <= 0) throw new RangeError("viewport zoom factor must be greater than 0")

    const scale = this.#clampScale(this.#viewport.scale * factor)
    const x = this.#viewport.x + anchor.x * (this.#viewport.scale - scale)
    const y = this.#viewport.y + anchor.y * (this.#viewport.scale - scale)
    return this.#replace({ x, y, scale })
  }

  fit(
    contentBounds: ContentRect,
    metrics: SurfaceMetrics,
    padding = 0
  ): Readonly<ViewportState> {
    finite(padding, "viewport fit padding")
    if (padding < 0) throw new RangeError("viewport fit padding cannot be negative")

    const target = {
      x: padding,
      y: padding,
      width: metrics.logicalWidth - padding * 2,
      height: metrics.logicalHeight - padding * 2,
    }
    const requested = fitRect(contentBounds, target)
    const scale = this.#clampScale(requested.scale)
    const contentCenterX = contentBounds.x + contentBounds.width / 2
    const contentCenterY = contentBounds.y + contentBounds.height / 2
    const viewCenterX = metrics.logicalWidth / 2
    const viewCenterY = metrics.logicalHeight / 2

    return this.#replace({
      x: viewCenterX - contentCenterX * scale,
      y: viewCenterY - contentCenterY * scale,
      scale,
    })
  }

  reset(): Readonly<ViewportState> {
    return this.#replace({ x: 0, y: 0, scale: this.#clampScale(1) })
  }

  restore(viewport: ViewportState): Readonly<ViewportState> {
    finite(viewport.x, "viewport.x")
    finite(viewport.y, "viewport.y")
    finite(viewport.scale, "viewport.scale")
    if (viewport.scale <= 0) throw new RangeError("viewport.scale must be greater than 0")
    return this.#replace({ ...viewport, scale: this.#clampScale(viewport.scale) })
  }

  #clampScale(scale: number) {
    return Math.min(this.#maxScale, Math.max(this.#minScale, scale))
  }

  #replace(viewport: ViewportState): Readonly<ViewportState> {
    if (
      viewport.x === this.#viewport.x &&
      viewport.y === this.#viewport.y &&
      viewport.scale === this.#viewport.scale
    ) {
      return this.getViewport()
    }

    this.#viewport = viewport
    this.#revision++
    this.#cachedFrame = undefined
    return this.getViewport()
  }
}

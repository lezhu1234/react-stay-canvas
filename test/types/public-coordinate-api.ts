import type {
  ClientPoint,
  ContentRect,
  ContentPoint,
  Coordinate,
  Rectangle,
  StayTools,
  ViewPoint,
  ViewRect,
  ViewVector,
} from "react-stay-canvas"
import { fitRect, unionRects } from "react-stay-canvas"

declare const tools: StayTools
declare const coordinate: Coordinate

const client = tools.coordinates.contentToClient(coordinate)
const view = tools.coordinates.clientToView(client)
const content = tools.coordinates.viewToContent(view)
const viewMovement = tools.coordinates.contentVectorToView(coordinate)
const contentBounds: ContentRect = { x: 10, y: 20, width: 100, height: 50 }
declare const viewBounds: ViewRect
declare const rectangle: Rectangle

client.x += 1
view.y += 1
content.x += 1

tools.viewport.panBy(coordinate)
tools.viewport.panBy(viewMovement)
tools.viewport.zoomBy(2, coordinate)
tools.viewport.zoomBy(2, content)
tools.viewport.fit(contentBounds, { padding: 24 })
tools.viewport.fit(unionRects([contentBounds])!)
tools.viewport.fit(fitRect(viewBounds, contentBounds).rect)

const clientPoint: ClientPoint = client
const viewPoint: ViewPoint = view
const contentPoint: ContentPoint = content
const viewVector: ViewVector = viewMovement

// @ts-expect-error Branded View points cannot be used as Content zoom anchors.
tools.viewport.zoomBy(2, viewPoint)
// @ts-expect-error Branded Content points cannot be used as View movement.
tools.viewport.panBy(contentPoint)
// @ts-expect-error Points and vectors remain distinct within one space.
tools.viewport.panBy(viewPoint)
// @ts-expect-error Client and Content points are not interchangeable.
tools.coordinates.contentToView(clientPoint)
// @ts-expect-error Content hit testing cannot consume a known View point.
tools.getContainPointChildren({ selector: ".shape", point: viewPoint })
// @ts-expect-error View bounds cannot be fitted as Content bounds.
tools.viewport.fit(viewBounds)
// @ts-expect-error unionRects preserves the known View rectangle space.
tools.viewport.fit(unionRects([viewBounds])!)
// @ts-expect-error fitRect preserves the known target rectangle space.
tools.viewport.fit(fitRect(contentBounds, viewBounds).rect)
// @ts-expect-error Rectangle prototype methods are not preserved by a plain union result.
unionRects([rectangle])!.getCenterPoint()
// @ts-expect-error Rectangle prototype methods are not preserved by a plain fit result.
fitRect(contentBounds, rectangle).rect.getCenterPoint()

void viewVector

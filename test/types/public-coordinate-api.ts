import type {
  ClientPoint,
  ContentPoint,
  Coordinate,
  StayTools,
  ViewPoint,
  ViewVector,
} from "react-stay-canvas"

declare const tools: StayTools
declare const coordinate: Coordinate

const client = tools.coordinates.contentToClient(coordinate)
const view = tools.coordinates.clientToView(client)
const content = tools.coordinates.viewToContent(view)
const viewMovement = tools.coordinates.contentVectorToView(coordinate)

client.x += 1
view.y += 1
content.x += 1

tools.viewport.panBy(coordinate)
tools.viewport.panBy(viewMovement)
tools.viewport.zoomBy(2, coordinate)
tools.viewport.zoomBy(2, content)

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

void viewVector

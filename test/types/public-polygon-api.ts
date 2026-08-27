import { Polygon, type PolygonAttr } from "react-stay-canvas"

const points = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 20, y: 30 },
]

const attributes: PolygonAttr = {
  points,
  fillRule: "evenodd",
  fillConfig: { color: { r: 40, g: 120, b: 220, a: 1 } },
  strokeConfig: { color: { r: 10, g: 20, b: 30, a: 1 }, lineWidth: 2 },
}

const polygon = new Polygon(attributes)
polygon.update({ points, fillRule: "nonzero" })

const contains: boolean = polygon.contains({ x: 20, y: 10 })
const area: number = polygon.area

// @ts-expect-error Polygon fill rules follow the CanvasFillRule contract.
new Polygon({ points, fillRule: "winding" })

void contains
void area

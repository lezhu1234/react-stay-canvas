export interface PointType {
  x: number
  y: number
}

export interface Coordinate {
  x: number
  y: number
}

export interface Area {
  x: number
  y: number
  width: number
  height: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export interface ExtraTransform {
  zoom: number
  zoomCenter: { x: number; y: number }
  offsetX: number
  offsetY: number
}

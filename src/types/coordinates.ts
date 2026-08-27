import type { Coordinate, Rect } from "./geometry"
import type { RectSpaceBrand } from "./coordinateBrands"

declare const coordinateSpace: unique symbol
declare const coordinateKind: unique symbol

export type CoordinateSpace = "client" | "view" | "content"

type SpaceCoordinate<
  Space extends CoordinateSpace,
  Kind extends "point" | "vector",
> = Coordinate & {
  readonly [coordinateSpace]?: Space
  readonly [coordinateKind]?: Kind
}

export type SpacePoint<Space extends CoordinateSpace> = SpaceCoordinate<
  Space,
  "point"
>

export type SpaceVector<Space extends CoordinateSpace> = SpaceCoordinate<
  Space,
  "vector"
>

export type SpaceRect<Space extends CoordinateSpace> = Rect & RectSpaceBrand<Space>

export type ClientPoint = SpacePoint<"client">
export type ViewPoint = SpacePoint<"view">
export type ContentPoint = SpacePoint<"content">
export type ViewVector = SpaceVector<"view">
export type ContentVector = SpaceVector<"content">
export type ViewRect = SpaceRect<"view">
export type ContentRect = SpaceRect<"content">

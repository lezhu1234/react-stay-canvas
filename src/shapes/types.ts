import { Shape } from "./shape"

export type RectangleDrawTypesProps = string

export interface ShapeConstructor {
  new (...args: any[]): Shape
}

export type ShapeSubclass<T extends ShapeConstructor> = T & {
  prototype: Shape
}

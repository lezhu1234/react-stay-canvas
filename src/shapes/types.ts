import { InstantShape } from "./instantShape"

export type RectangleDrawTypesProps = string

export interface ShapeConstructor {
  new (...args: any[]): InstantShape
}

export type ShapeSubclass<T extends ShapeConstructor> = T & {
  prototype: InstantShape
}

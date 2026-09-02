declare const rectCoordinateSpace: unique symbol

export type RectSpaceBrand<Space> = {
  readonly [rectCoordinateSpace]?: Space
}

export type PreserveRectSpace<Input, Fallback> =
  typeof rectCoordinateSpace extends keyof Input
    ? Input extends RectSpaceBrand<infer Space>
      ? Fallback & RectSpaceBrand<Space>
      : Fallback
    : Fallback

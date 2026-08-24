const baselineOffsets: Record<CanvasTextBaseline, [ascent: number, descent: number]> = {
  top: [0, 12],
  hanging: [2, 10],
  middle: [6, 6],
  alphabetic: [10, 2],
  ideographic: [11, 1],
  bottom: [12, 0],
}

export function createTextMeasureContext(width: number) {
  const context = {
    textAlign: "start" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
    measureText: () => {
      const [fontBoundingBoxAscent, fontBoundingBoxDescent] = baselineOffsets[context.textBaseline]
      return { width, fontBoundingBoxAscent, fontBoundingBoxDescent }
    },
  }
  return context
}

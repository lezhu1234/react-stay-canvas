import { StayText } from "../text"
import { morphTarget, primaryComponentIndex, sampleNativeShape } from "./composition"
import type { ShapeTransitionModule, ShapeTransitionPair, TransitionComponent } from "./types"

function glyphSame(before: StayText, after: StayText): boolean {
  return before.text === after.text &&
    before.font.fontFamily === after.font.fontFamily &&
    before.font.fontWeight === after.font.fontWeight &&
    before.font.italic === after.font.italic &&
    before.font.underline === after.font.underline &&
    before.font.strikethrough === after.font.strikethrough &&
    before.textAlign === after.textAlign && before.textBaseline === after.textBaseline
}

function matchesTextGlyph({ before, after }: ShapeTransitionPair): boolean {
  if (after.mode !== "morph") return false
  const target = after.components[primaryComponentIndex(after.components)].shape
  if (!(target instanceof StayText)) return false
  return before.components.every(({ shape }) => shape instanceof StayText) &&
    before.components.some(({ shape }) => !glyphSame(shape as StayText, target))
}

function withGlyph(sampled: StayText, glyph: StayText): StayText {
  return sampled.copy().update({
    text: glyph.text,
    font: {
      fontFamily: glyph.font.fontFamily,
      fontWeight: glyph.font.fontWeight,
      italic: glyph.font.italic,
      underline: glyph.font.underline,
      strikethrough: glyph.font.strikethrough,
    },
    textAlign: glyph.textAlign,
    textBaseline: glyph.textBaseline,
  })
}

/** Keep discrete glyph styles while native interpolation moves and recolors them. */
export const textGlyphTransition = Object.freeze<ShapeTransitionModule>({
  id: "text-glyph",
  contractVersion: 1,
  matches: matchesTextGlyph,
  sample: (sample) => {
    const { before, progress } = sample
    const target = morphTarget(sample) as StayText
    const primaryIndex = primaryComponentIndex(before.components)
    return before.components.flatMap(({ shape, opacity }, index): TransitionComponent[] => {
      const source = shape as StayText
      const sampled = sampleNativeShape(source, target, sample) as StayText
      const sourceOpacity = opacity * (1 - progress)
      const targetOpacity = index === primaryIndex ? progress : 0
      if (glyphSame(source, target)) {
        return [{ shape: withGlyph(sampled, target), opacity: sourceOpacity + targetOpacity }]
      }
      const components = [{ shape: withGlyph(sampled, source), opacity: sourceOpacity }]
      if (targetOpacity > 0) components.push({ shape: withGlyph(sampled, target), opacity: targetOpacity })
      return components
    })
  },
})

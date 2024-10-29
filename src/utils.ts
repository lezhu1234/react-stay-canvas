import { Line, Point, Shape } from "./shapes"
import { NumberInRangeZeroOne, NumericString, Positive, ShapeConfig } from "./types"
import { SUPPORT_OPRATOR } from "./userConstants"
import { EasingFunction, EasingFunctionMap, Effects, Font, StayChildTransitions } from "./userTypes"
import { RGB, RGBA } from "./w3color"

export type InfixExpressionParserProps<T> = {
  selector: string
  fullSet: T[]
  elemntEqualFunc: (a: T, b: T) => boolean
  selectorConvertFunc: (selector: string) => T[]
}

export function uuid4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)
  )
}
export function assert(condition: any, message: string = "") {
  if (!condition) {
    throw new Error(message)
  }
}
export function infixExpressionParser<T>({
  selector,
  fullSet,
  elemntEqualFunc,
  selectorConvertFunc,
}: InfixExpressionParserProps<T>): T[] {
  type OpratorInfoType = {
    priority: number
    number: number
    func: (...args: T[][]) => T[]
  }

  const opratorInfo = {
    [SUPPORT_OPRATOR.LEFT_BRACKET]: {
      priority: 0,
    },
    [SUPPORT_OPRATOR.AND]: {
      priority: 1,
      number: 2,
      func: (...args: T[][]) => {
        return args[0].filter((v1) => args[1].find((v2) => elemntEqualFunc(v1, v2)))
      },
    },
    [SUPPORT_OPRATOR.OR]: {
      priority: 2,
      number: 2,
      func: (...args: T[][]) => {
        return [...new Set([...args[0], ...args[1]])]
      },
    },
    [SUPPORT_OPRATOR.NOT]: {
      priority: 3,
      number: 1,
      func: (...args: T[][]) => {
        return fullSet.filter((v1) => !args[0].find((v2) => elemntEqualFunc(v1, v2)))
      },
    },
    [SUPPORT_OPRATOR.RIGHT_BRACKET]: {
      priority: -1,
    },
  }

  type NewOmit<T, K extends PropertyKey> = {
    [P in keyof T as Exclude<P, K>]: T[P]
  }

  type oprator = NewOmit<keyof typeof opratorInfo, "(" | ")">
  type opratorWithBracket = keyof typeof opratorInfo

  type OprateConditionCallbackProps = () => boolean
  type BreakCallbackProps = (opratorChar: string) => boolean

  const doOpration = (oprateConditionCallback: OprateConditionCallbackProps) => {
    while (oprateConditionCallback()) {
      const opratorChar = opratorStack.pop()
      const selectorChildList: T[][] = []
      while (
        selectorChildList.length < (opratorInfo[opratorChar as oprator] as OpratorInfoType).number
      ) {
        selectorChildList.push(selectedChildrenStack.pop()!)
      }

      selectedChildrenStack.push(
        (opratorInfo[opratorChar as oprator] as OpratorInfoType).func(...selectorChildList)
      )
    }
  }

  const opratorStack = [] as opratorWithBracket[]
  const selectedChildrenStack = [] as T[][]
  let index = 0
  let lastIndex = 0
  while (index < selector.length) {
    const char = selector[index]
    if (char in opratorInfo) {
      if (lastIndex < index) {
        selectedChildrenStack.push(selectorConvertFunc(selector.slice(lastIndex, index)))
      }
      lastIndex = index
      const opratorNeedPop = () => {
        return char === ")"
          ? opratorStack[opratorStack.length - 1] !== "("
          : opratorStack.length > 0 &&
              opratorInfo[opratorStack[opratorStack.length - 1]].priority >
                opratorInfo[char as opratorWithBracket].priority
      }

      doOpration(opratorNeedPop)
      if (char === ")") {
        assert(opratorStack.pop()! === "(")
      } else {
        opratorStack.push(char as opratorWithBracket)
      }
      lastIndex++
    }
    index++
  }

  if (lastIndex < index) {
    selectedChildrenStack.push(selectorConvertFunc(selector.slice(lastIndex, index)))
  }

  doOpration(() => opratorStack.length > 0)
  return selectedChildrenStack.length > 0 ? selectedChildrenStack[0] : []
}

export function parseLayer(layers: any[], layer: number | undefined) {
  if (layer === undefined) {
    layer = layers.length - 1
  }
  if (layer < 0) {
    layer = layers.length + layer
  }
  if (layer < 0 || layer >= layers.length) {
    throw new Error("layer is out of range")
  }
  return layer
}

export function getCornersByCenterLine(centerLine: Line, width: number) {
  const l = centerLine.len()
  const r = width / 2

  const x1 = centerLine.x1 - (r * (centerLine.y2 - centerLine.y1)) / l
  const y1 = centerLine.y1 + (r * (centerLine.x2 - centerLine.x1)) / l

  const x2 = 2 * centerLine.x1 - x1
  const y2 = 2 * centerLine.y1 - y1

  const midllePoint = new Point(
    (centerLine.x1 + centerLine.x2) / 2,
    (centerLine.y1 + centerLine.y2) / 2
  )
  const x3 = 2 * midllePoint.x - x1
  const y3 = 2 * midllePoint.y - y1

  const x4 = 2 * midllePoint.x - x2
  const y4 = 2 * midllePoint.y - y2

  return [new Point(x1, y1), new Point(x2, y2), new Point(x3, y3), new Point(x4, y4)]
}

export function numberAlmostEqual(a: number, b: number, epsilon = 0.0001): boolean {
  return Math.abs(a - b) < epsilon
}

export function easeInSine(x: number): number {
  return 1 - Math.cos((x * Math.PI) / 2)
}

export function easeOutSine(x: number): number {
  return Math.sin((x * Math.PI) / 2)
}

export function easeInOutSine(x: number): number {
  return -(Math.cos(Math.PI * x) - 1) / 2
}

export function easeInQuad(x: number): number {
  return x * x
}

export function easeOutQuad(x: number): number {
  return 1 - (1 - x) * (1 - x)
}

export function easeInOutQuad(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2
}

export function easeInCubic(x: number): number {
  return x * x * x
}

export function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3)
}

export function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

export function easeInQuart(x: number): number {
  return x * x * x * x
}

export function easeOutQuart(x: number): number {
  return 1 - Math.pow(1 - x, 4)
}

export function easeInOutQuart(x: number): number {
  return x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2
}

export function easeInQuint(x: number): number {
  return x * x * x * x * x
}

export function easeOutQuint(x: number): number {
  return 1 - Math.pow(1 - x, 5)
}

export function easeInOutQuint(x: number): number {
  return x < 0.5 ? 16 * x * x * x * x * x : 1 - Math.pow(-2 * x + 2, 5) / 2
}

export function easeInExpo(x: number): number {
  return x === 0 ? 0 : Math.pow(2, 10 * x - 10)
}

export function easeOutExpo(x: number): number {
  return x === 1 ? 1 : 1 - Math.pow(2, -10 * x)
}

export function easeInOutExpo(x: number): number {
  return x === 0
    ? 0
    : x === 1
    ? 1
    : x < 0.5
    ? Math.pow(2, 20 * x - 10) / 2
    : (2 - Math.pow(2, -20 * x + 10)) / 2
}

export function easeInCirc(x: number): number {
  return 1 - Math.sqrt(1 - Math.pow(x, 2))
}

export function easeOutCirc(x: number): number {
  return Math.sqrt(1 - Math.pow(x - 1, 2))
}

export function easeInOutCirc(x: number): number {
  return x < 0.5
    ? (1 - Math.sqrt(1 - Math.pow(2 * x, 2))) / 2
    : (Math.sqrt(1 - Math.pow(-2 * x + 2, 2)) + 1) / 2
}

export function easeInBack(x: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return c3 * x * x * x - c1 * x * x
}

export function easeOutBack(x: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

export function easeInOutBack(x: number): number {
  const c1 = 1.70158
  const c2 = c1 * 1.525
  return x < 0.5
    ? (Math.pow(2 * x, 2) * ((c2 + 1) * 2 * x - c2)) / 2
    : (Math.pow(2 * x - 2, 2) * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2
}

export function easeInElastic(x: number): number {
  const c4 = (2 * Math.PI) / 3
  return x === 0 ? 0 : x === 1 ? 1 : -Math.pow(2, 10 * x - 10) * Math.sin((x * 10 - 10.75) * c4)
}

export function easeOutElastic(x: number): number {
  const c4 = (2 * Math.PI) / 3
  return x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1
}

export function easeInOutElastic(x: number): number {
  const c5 = (2 * Math.PI) / 4.5
  return x === 0
    ? 0
    : x === 1
    ? 1
    : x < 0.5
    ? -(Math.pow(2, 20 * x - 10) * Math.sin((20 * x - 11.125) * c5)) / 2
    : (Math.pow(2, -20 * x + 10) * Math.sin((20 * x - 11.125) * c5)) / 2 + 1
}

export function easeInBounce(x: number): number {
  return 1 - easeOutBounce(1 - x)
}

export function easeOutBounce(x: number): number {
  const n1 = 7.5625
  const d1 = 2.75
  if (x < 1 / d1) {
    return n1 * x * x
  } else if (x < 2 / d1) {
    return n1 * (x -= 1.5 / d1) * x + 0.75
  } else if (x < 2.5 / d1) {
    return n1 * (x -= 2.25 / d1) * x + 0.9375
  } else {
    return n1 * (x -= 2.625 / d1) * x + 0.984375
  }
}
export function linear(x: number): number {
  return x
}
export function easeInOutBounce(x: number): number {
  return x < 0.5 ? (1 - easeOutBounce(1 - 2 * x)) / 2 : (1 + easeOutBounce(2 * x - 1)) / 2
}

export const easingFunctions: EasingFunctionMap = {
  linear,
  easeInSine,
  easeOutSine,
  easeInOutSine,
  easeInQuad,
  easeOutQuad,
  easeInOutQuad,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
  easeInQuart,
  easeOutQuart,
  easeInOutQuart,
  easeInQuint,
  easeOutQuint,
  easeInOutQuint,
  easeInExpo,
  easeOutExpo,
  easeInOutExpo,
  easeInCirc,
  easeOutCirc,
  easeInOutCirc,
  easeInBack,
  easeOutBack,
  easeInOutBack,
  easeInElastic,
  easeOutElastic,
  easeInOutElastic,
  easeInBounce,
  easeOutBounce,
  easeInOutBounce,
}

export function applyEasing(easingName: EasingFunction, x: number): number {
  const easingFunction = easingFunctions[easingName]
  if (!easingFunction) {
    throw new Error(`Unknown easing function: ${easingName}`)
  }
  return easingFunction(x)
}

export function isRGB(value: unknown): value is RGB {
  return (
    typeof value === "object" &&
    value !== null &&
    "r" in value &&
    "g" in value &&
    "b" in value &&
    typeof (value as RGB).r === "number" &&
    typeof (value as RGB).g === "number" &&
    typeof (value as RGB).b === "number"
  )
}

export function isRGBA(value: unknown): value is RGBA {
  return (
    typeof value === "object" &&
    value !== null &&
    "r" in value &&
    "g" in value &&
    "b" in value &&
    "a" in value &&
    typeof (value as RGBA).r === "number" &&
    typeof (value as RGBA).g === "number" &&
    typeof (value as RGBA).b === "number" &&
    typeof (value as RGBA).a === "number"
  )
}
export function validateNumericString(value: string | number): NumericString {
  if (/^[+-]?\d+$/.test(value.toString())) {
    return value as NumericString
  }
  throw new Error("Invalid numeric string")
}
export function ensurePositive<T extends number>(value: T): Positive<T> {
  if (value <= 0) {
    throw new Error("Value must be positive")
  }
  return value as Positive<T>
}

export function ensureNotNegative<T extends number>(value: T): number {
  if (value < 0) {
    throw new Error("Value must be non-negative")
  }
  return value as number
}

export function ensureInRangeZeroOne<T extends number>(value: T): number {
  if (value < 0 || value > 1) {
    throw new Error("Value must be in range [0, 1]")
  }
  return value as number
}

export function isRelativeNumericString<T extends NumericString>(value: T) {
  return typeof value === "string" && (value.startsWith("+") || value.startsWith("-"))
}

export function getShapeByConfig<Q extends Shape>(config: ShapeConfig, shape: Q) {
  const { offsetX, offsetY, scale, opacity } = config
  const center = shape.getCenterPoint()

  let ox = validateNumericString(offsetX ?? 0)
  let oy = validateNumericString(offsetY ?? 0)
  const s = ensureNotNegative(scale ?? 1)
  const o = ensureInRangeZeroOne(opacity ?? 1) // 0 for hidden and 1 for visible

  if (!isRelativeNumericString(ox)) {
    ox = Number(ox)
    ox = ox - center.x
  }
  if (!isRelativeNumericString(oy)) {
    oy = Number(oy)
    oy = oy - center.y
  }

  ox = Number(ox)
  oy = Number(oy)

  shape.move(ox, oy)
  shape.zoom(
    shape._zoom(((s ?? 1) - 1) * -1000, {
      x: center.x + ox,
      y: center.y + oy,
    })
  )

  if (isRGBA(shape.color)) {
    const color: RGBA = { ...shape.color, a: o }
    shape.update({ props: { color } })
  }

  return shape
}

export function getShapeByEffect<T extends Shape>(
  effects: Effects[] | ShapeConfig,
  shape: T,
  type: "enter" | "leave"
) {
  if (!Array.isArray(effects)) {
    return getShapeByConfig(effects, shape)
  }
  let offsetX: number = 0,
    offsetY: number = 0,
    scale = 1,
    opacity = 1
  effects.forEach((effect) => {
    switch (effect) {
      case "left10px":
        offsetX -= 10
        break
      case "right10px":
        offsetX += 10
        break
      case "up10px":
        offsetY -= 10
        break
      case "down10px":
        offsetY += 10
        break
      case "fade100%":
        opacity = 0
        break
      case "zoomIn100%":
        scale = 2
        break
      case "zoomOut100%":
        scale = 0
        break
    }
  })

  return getShapeByConfig(
    {
      offsetX: (offsetX >= 0 ? "+" + offsetX : offsetX.toString()) as NumericString,
      offsetY: (offsetY >= 0 ? "+" + offsetY : offsetY.toString()) as NumericString,
      scale,
      opacity,
    },
    shape
  )
}

export function getDefaultFont(font?: Font): Required<Font> {
  return {
    size: 16,
    fontFamily: "monospace",
    fontWeight: 400,
    italic: false,
    backgroundColor: { r: 0, g: 0, b: 0, a: 0 },
    strikethrough: false,
    underline: false,
    ...font,
  }
}

export function getRGBAStr(color?: string | RGB | RGBA): string {
  if (typeof color === "string") {
    return color
  }
  if (isRGBA(color)) {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`
  }
  if (isRGB(color)) {
    return `rgba(${color.r}, ${color.g}, ${color.b}, 1)`
  }
  return `rgba(0,0,0,0)`
}

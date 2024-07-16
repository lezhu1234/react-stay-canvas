import { Line, Point } from "./shapes"
import { SUPPORT_OPRATOR } from "./userConstants"

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

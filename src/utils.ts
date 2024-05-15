import { SUPPORT_OPRATOR } from "./userConstants"

export type InfixExpressionParserProps<T> = {
  selector: string
  fullSet: T[]
  elemntEqualFunc: (a: T, b: T) => boolean
  selectorConvertFunc: (selector: string) => T[]
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
        return args[0].filter((v1) =>
          args[1].find((v2) => elemntEqualFunc(v1, v2))
        )
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
        return fullSet.filter(
          (v1) => !args[0].find((v2) => elemntEqualFunc(v1, v2))
        )
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

  const doOpration = (
    oprateConditionCallback: OprateConditionCallbackProps
  ) => {
    while (oprateConditionCallback()) {
      const opratorChar = opratorStack.pop()
      const selectorChildList: T[][] = []
      while (
        selectorChildList.length <
        (opratorInfo[opratorChar as oprator] as OpratorInfoType).number
      ) {
        selectorChildList.push(selectedChildrenStack.pop()!)
      }

      selectedChildrenStack.push(
        (opratorInfo[opratorChar as oprator] as OpratorInfoType).func(
          ...selectorChildList
        )
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
        selectedChildrenStack.push(
          selectorConvertFunc(selector.slice(lastIndex, index))
        )
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
    selectedChildrenStack.push(
      selectorConvertFunc(selector.slice(lastIndex, index))
    )
  }

  doOpration(() => opratorStack.length > 0)
  return selectedChildrenStack.length > 0 ? selectedChildrenStack[0] : []
}

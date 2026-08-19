import { SUPPORT_OPRATOR } from "../userConstants"
import { assert } from "./assertions"

export type InfixExpressionParserProps<T> = {
  selector: string
  fullSet: T[]
  elemntEqualFunc: (a: T, b: T) => boolean
  selectorConvertFunc: (selector: string) => T[]
}

type OperatorInfo<T> = {
  priority: number
  operandCount: number
  apply: (...operands: T[][]) => T[]
}

export function infixExpressionParser<T>({
  selector,
  fullSet,
  elemntEqualFunc,
  selectorConvertFunc,
}: InfixExpressionParserProps<T>): T[] {
  const operators = {
    [SUPPORT_OPRATOR.LEFT_BRACKET]: { priority: 0 },
    [SUPPORT_OPRATOR.AND]: {
      priority: 1,
      operandCount: 2,
      apply: (...operands: T[][]) =>
        operands[0].filter((left) =>
          operands[1].find((right) => elemntEqualFunc(left, right))
        ),
    },
    [SUPPORT_OPRATOR.OR]: {
      priority: 2,
      operandCount: 2,
      apply: (...operands: T[][]) => [...new Set([...operands[0], ...operands[1]])],
    },
    [SUPPORT_OPRATOR.NOT]: {
      priority: 3,
      operandCount: 1,
      apply: (...operands: T[][]) =>
        fullSet.filter((item) => !operands[0].find((operand) => elemntEqualFunc(item, operand))),
    },
    [SUPPORT_OPRATOR.RIGHT_BRACKET]: { priority: -1 },
  }

  type Operator = Exclude<keyof typeof operators, "(" | ")">
  type OperatorWithBracket = keyof typeof operators

  const operatorStack: OperatorWithBracket[] = []
  const resultStack: T[][] = []

  const applyOperators = (shouldApply: () => boolean) => {
    while (shouldApply()) {
      const operator = operatorStack.pop() as Operator
      const { operandCount, apply } = operators[operator] as OperatorInfo<T>
      const operands: T[][] = []
      while (operands.length < operandCount) {
        operands.push(resultStack.pop()!)
      }
      resultStack.push(apply(...operands))
    }
  }

  let index = 0
  let valueStart = 0
  while (index < selector.length) {
    const character = selector[index]
    if (character in operators) {
      if (valueStart < index) {
        resultStack.push(selectorConvertFunc(selector.slice(valueStart, index)))
      }
      valueStart = index

      const shouldApply = () =>
        character === SUPPORT_OPRATOR.RIGHT_BRACKET
          ? operatorStack[operatorStack.length - 1] !== SUPPORT_OPRATOR.LEFT_BRACKET
          : operatorStack.length > 0 &&
            operators[operatorStack[operatorStack.length - 1]].priority >
              operators[character as OperatorWithBracket].priority

      applyOperators(shouldApply)
      if (character === SUPPORT_OPRATOR.RIGHT_BRACKET) {
        assert(operatorStack.pop() === SUPPORT_OPRATOR.LEFT_BRACKET)
      } else {
        operatorStack.push(character as OperatorWithBracket)
      }
      valueStart++
    }
    index++
  }

  if (valueStart < index) {
    resultStack.push(selectorConvertFunc(selector.slice(valueStart, index)))
  }

  applyOperators(() => operatorStack.length > 0)
  return resultStack[0] ?? []
}

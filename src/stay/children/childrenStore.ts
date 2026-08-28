import { infixExpressionParser } from "../../utils/selectors"
import type { ChildIdentity } from "./runtimeContracts"

type ChildSelector<TChild> = (child: TChild) => boolean

// Owns the child map and all lookup / selector queries. Extracted from Stay so
// "children storage" is one focused concern. Rendering side-effects (marking a
// removed child's layers dirty) stay with the caller, since they belong to the
// renderer, not the store.
export class ChildrenStore<TChild extends ChildIdentity> {
  #children = new Map<string, TChild>()

  add(child: TChild) {
    this.#children.set(child.id, child)
  }

  get(id: string): TChild | undefined {
    return this.#children.get(id)
  }

  // The raw map (read-mostly). Callers iterate via `.values()` / `.forEach`.
  get map(): Map<string, TChild> {
    return this.#children
  }

  values(): TChild[] {
    return [...this.#children.values()]
  }

  has(id: string): boolean {
    return this.#children.has(id)
  }

  // Removes and returns the child so the caller can dirty its layers.
  delete(id: string): TChild | undefined {
    const child = this.#children.get(id)
    if (child) this.#children.delete(id)
    return child
  }

  filter(predicate: ChildSelector<TChild>): TChild[] {
    return this.values().filter(predicate)
  }

  findByClassName(className: string): TChild[] {
    return this.filter(
      (child) => child.className.split(":")[0] === className || child.className === className
    )
  }

  findBySimpleSelector(selector: string): TChild[] {
    if (selector.startsWith(".")) {
      return this.findByClassName(selector.slice(1))
    } else if (selector.startsWith("#")) {
      const child = this.get(selector.slice(1))
      return child ? [child] : []
    }
    throw new Error("selector must start with . or #")
  }

  bySelector(selector?: string | ChildSelector<TChild>): TChild[] {
    const fullSet = this.values()
    if (!selector) {
      return fullSet
    }
    return typeof selector === "function"
      ? fullSet.filter((child) => selector(child))
      : infixExpressionParser<TChild>({
          selector,
          fullSet,
          elemntEqualFunc: (a, b) => a.id === b.id,
          selectorConvertFunc: (s) => this.findBySimpleSelector(s),
        })
  }
}

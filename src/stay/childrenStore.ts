import { SelectorFunc } from "../userTypes"
import { infixExpressionParser } from "../utils"
import { StayInstantChild } from "./child/stayInstantChild"

// Owns the child map and all lookup / selector queries. Extracted from Stay so
// "children storage" is one focused concern. Rendering side-effects (marking a
// removed child's layers dirty) stay with the caller, since they belong to the
// renderer, not the store.
export class ChildrenStore {
  #children = new Map<string, StayInstantChild>()

  add(child: StayInstantChild) {
    this.#children.set(child.id, child)
  }

  get(id: string): StayInstantChild | undefined {
    return this.#children.get(id)
  }

  // The raw map (read-mostly). Callers iterate via `.values()` / `.forEach`.
  get map(): Map<string, StayInstantChild> {
    return this.#children
  }

  values(): StayInstantChild[] {
    return [...this.#children.values()]
  }

  has(id: string): boolean {
    return this.#children.has(id)
  }

  // Removes and returns the child so the caller can dirty its layers.
  delete(id: string): StayInstantChild | undefined {
    const child = this.#children.get(id)
    if (child) this.#children.delete(id)
    return child
  }

  filter(predicate: (child: StayInstantChild) => boolean): StayInstantChild[] {
    return this.values().filter(predicate)
  }

  findByClassName(className: string): StayInstantChild[] {
    return this.filter(
      (child) => child.className.split(":")[0] === className || child.className === className
    )
  }

  findBySimpleSelector(selector: string): StayInstantChild[] {
    if (selector.startsWith(".")) {
      return this.findByClassName(selector.slice(1))
    } else if (selector.startsWith("#")) {
      const child = this.get(selector.slice(1))
      return child ? [child] : []
    }
    throw new Error("selector must start with . or #")
  }

  bySelector(selector?: string | SelectorFunc): StayInstantChild[] {
    const fullSet = this.values()
    if (!selector) {
      return fullSet
    }
    return typeof selector === "function"
      ? fullSet.filter((child) => selector(child))
      : infixExpressionParser<StayInstantChild>({
          selector,
          fullSet,
          elemntEqualFunc: (a, b) => a.id === b.id,
          selectorConvertFunc: (s) => this.findBySimpleSelector(s),
        })
  }

  // Deep-ish clone (each child copied) — used for history snapshots.
  clone(): Map<string, StayInstantChild> {
    const cloned = new Map<string, StayInstantChild>()
    this.#children.forEach((child, id) => cloned.set(id, child.copy()))
    return cloned
  }
}

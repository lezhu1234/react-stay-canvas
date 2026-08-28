import type { StayHistoryChildSnapshot } from "./historySnapshot"
import type { StackItem } from "./types"

// Owns the undo/redo history *state*: the step stack + cursor (stackIndex), the
// last static snapshot (the baseline undo/redo diff against), and the set of
// children mutated since that snapshot. The undo/redo/log operations stay in
// stayTools because they coordinate children, layers, and Canvas state. History
// owns only its values and receives snapshots without depending on the store.
export class History {
  stack: StackItem<StayHistoryChildSnapshot>[] = []
  stackIndex = 0
  historyChildren: Map<string, StayHistoryChildSnapshot>
  unLogedChildrenIds = new Set<string>()

  constructor(
    private readonly captureChildren: () => Map<string, StayHistoryChildSnapshot>
  ) {
    this.historyChildren = captureChildren()
  }

  // Push a step at the cursor, dropping any redo tail, then advance the cursor.
  pushToStack(steps: StackItem<StayHistoryChildSnapshot>) {
    while (this.stack.length > this.stackIndex) this.stack.pop()
    this.stack.push(steps)
    this.stackIndex++
  }

  // Re-baseline: the current children become the diff baseline, and the
  // mutated-since set is cleared.
  snapshot() {
    this.historyChildren = this.captureChildren()
    this.unLogedChildrenIds.clear()
  }

  reset() {
    this.stack = []
    this.stackIndex = 0
    this.snapshot()
  }
}

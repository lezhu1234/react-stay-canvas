import { StayInstantChild } from "./child/stayInstantChild"
import { StackItem } from "./types"

// Owns the undo/redo history *state*: the step stack + cursor (stackIndex), the
// last snapshot of children (the baseline undo/redo diff against), and the set
// of children mutated since that snapshot. Extracted from Stay so "history" is
// one concern. The undo/redo/log *operations* stay in stayTools — they drive
// children/layers/state and are reworked by the mode-merge later; this just
// holds the state they read and write. Clones children via an injected provider
// so History doesn't depend on the children store directly.
export class History {
  stack: StackItem[] = []
  stackIndex = 0
  historyChildren: Map<string, StayInstantChild>
  unLogedChildrenIds = new Set<string>()

  constructor(private readonly getClonedChildren: () => Map<string, StayInstantChild>) {
    this.historyChildren = getClonedChildren()
  }

  // Push a step at the cursor, dropping any redo tail, then advance the cursor.
  pushToStack(steps: StackItem) {
    while (this.stack.length > this.stackIndex) this.stack.pop()
    this.stack.push(steps)
    this.stackIndex++
  }

  // Re-baseline: the current children become the diff baseline, and the
  // mutated-since set is cleared.
  snapshot() {
    this.historyChildren = this.getClonedChildren()
    this.unLogedChildrenIds.clear()
  }
}

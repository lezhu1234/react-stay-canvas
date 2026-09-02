import type { StayHistoryChildSnapshot } from "./historySnapshot"
import type { HistoryAdapter } from "../types/history"
import type { StackItem } from "./types"

type CapturedExternalState<TSnapshot> = { value: TSnapshot }

// Owns the undo/redo stack, cursor, and the scene/external-state baselines that
// the next explicit log transaction commits against. Canvas mutation remains
// in stayTools; application state is accessed only through the optional adapter.
export class History<TExternalSnapshot = unknown> {
  stack: StackItem<StayHistoryChildSnapshot, TExternalSnapshot>[] = []
  stackIndex = 0
  historyChildren: Map<string, StayHistoryChildSnapshot>
  unLogedChildrenIds = new Set<string>()
  private externalBaseline?: CapturedExternalState<TExternalSnapshot>
  private restoringExternalState = false

  constructor(
    private readonly captureChildren: () => Map<string, StayHistoryChildSnapshot>,
    private readonly adapter?: HistoryAdapter<TExternalSnapshot>
  ) {
    this.historyChildren = captureChildren()
    this.externalBaseline = this.captureExternalState()
  }

  assertOperationAllowed() {
    if (this.restoringExternalState) {
      throw new Error("History operations cannot run while historyAdapter.restore() is active")
    }
  }

  commit(state: string, steps: StackItem<StayHistoryChildSnapshot>["steps"]) {
    this.assertOperationAllowed()
    const after = this.captureExternalState()

    // Without an adapter, preserve the existing no-op behavior: an equivalent
    // scene snapshot must not create an entry or discard the redo tail.
    if (steps.length === 0 && !after) {
      this.snapshot()
      return
    }

    const item: StackItem<StayHistoryChildSnapshot, TExternalSnapshot> = {
      state,
      steps,
      external: after && this.externalBaseline
        ? { before: this.externalBaseline.value, after: after.value }
        : undefined,
    }

    while (this.stack.length > this.stackIndex) this.stack.pop()
    this.stack.push(item)
    this.stackIndex++
    this.snapshot(after)
  }

  peekUndo() {
    this.assertOperationAllowed()
    return this.stackIndex > 0 ? this.stack[this.stackIndex - 1] : undefined
  }

  peekRedo() {
    this.assertOperationAllowed()
    return this.stackIndex < this.stack.length ? this.stack[this.stackIndex] : undefined
  }

  restoreExternal(
    item: StackItem<StayHistoryChildSnapshot, TExternalSnapshot>,
    direction: "undo" | "redo"
  ): CapturedExternalState<TExternalSnapshot> | undefined {
    if (!item.external || !this.adapter) return
    const value = direction === "undo" ? item.external.before : item.external.after
    this.restoringExternalState = true
    try {
      this.adapter.restore(value)
    } finally {
      this.restoringExternalState = false
    }
    return { value }
  }

  completeUndo(externalState?: CapturedExternalState<TExternalSnapshot>) {
    this.stackIndex--
    this.snapshot(externalState)
  }

  completeRedo(externalState?: CapturedExternalState<TExternalSnapshot>) {
    this.stackIndex++
    this.snapshot(externalState)
  }

  snapshot(externalState = this.captureExternalState()) {
    this.historyChildren = this.captureChildren()
    this.unLogedChildrenIds.clear()
    this.externalBaseline = externalState
  }

  reset() {
    this.assertOperationAllowed()
    const externalState = this.captureExternalState()
    this.stack = []
    this.stackIndex = 0
    this.snapshot(externalState)
  }

  private captureExternalState(): CapturedExternalState<TExternalSnapshot> | undefined {
    return this.adapter ? { value: this.adapter.capture() } : undefined
  }
}

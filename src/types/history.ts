/**
 * Bridges application-owned state into the Canvas history transaction.
 *
 * `capture` must return an owned snapshot. The library stores that value as-is
 * and passes it back to `restore` during undo and redo.
 */
export interface HistoryAdapter<TSnapshot> {
  capture: () => TSnapshot
  restore: (snapshot: TSnapshot) => void
}

import { StayCanvas, type HistoryAdapter, type StayCanvasProps } from "react-stay-canvas"

type EditorSnapshot = {
  page: number
  labels: string[]
}

const adapter: HistoryAdapter<EditorSnapshot> = {
  capture: () => ({ page: 1, labels: [] }),
  restore: (snapshot) => {
    snapshot.page.toFixed()
    snapshot.labels.map((label) => label.toUpperCase())
  },
}

const props: StayCanvasProps<string, EditorSnapshot> = { historyAdapter: adapter }
const inferred = <StayCanvas historyAdapter={adapter} />

// @ts-expect-error capture and restore must agree on one snapshot type.
const invalid: HistoryAdapter<EditorSnapshot> = { capture: () => 1, restore: () => {} }

void props
void inferred
void invalid

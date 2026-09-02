import type { StayTools } from "react-stay-canvas"

declare const tools: StayTools

const undoAvailable: boolean = tools.canUndo()
const redoAvailable: boolean = tools.canRedo()

// @ts-expect-error Availability queries do not accept operation arguments.
tools.canUndo("scene")
// @ts-expect-error Availability queries return booleans, not history entries.
const undoEntry: object = tools.canRedo()

void undoAvailable
void redoAvailable
void undoEntry

// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { createStage, md } from "./helpers/stage"

// Dimension 5 (State management): listeners are gated by the current state.

describe("state machine", () => {
  it("a state-scoped listener only fires in that state", () => {
    const { stage, top } = createStage()
    let fired = 0
    stage.addEventListener({
      name: "drawOnly",
      state: "draw",
      event: "mousedown",
      callback: () => {
        fired++
      },
    })

    // default state -> should NOT fire
    top.dispatchEvent(md(30, 30))
    expect(fired).toBe(0)

    // switch into "draw" -> should fire
    stage.tools.switchState("draw")
    top.dispatchEvent(md(30, 30))
    expect(fired).toBe(1)
  })

  it("switchState clears the stateStore", () => {
    const { stage, top } = createStage()
    const seen: any[] = []
    stage.addEventListener({
      name: "probe",
      state: "all-state",
      event: "mousedown",
      callback: ({ stateStore }) => {
        seen.push(stateStore.get("k"))
        stateStore.set("k", "v")
      },
    })

    top.dispatchEvent(md(10, 10)) // k undefined, then set to "v"
    top.dispatchEvent(md(10, 10)) // k still "v" (same state)
    stage.tools.switchState("other") // clears stateStore
    top.dispatchEvent(md(10, 10)) // k undefined again

    expect(seen).toEqual([undefined, "v", undefined])
  })
})

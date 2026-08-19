import { describe, expect, it } from "vitest"
import { PressedInputState } from "../src/stay/events/input/pressedInputState"

describe("PressedInputState", () => {
  it("keeps snapshots stable and clears the owned pressed state", () => {
    const state = new PressedInputState()
    state.press("Control")
    const beforeClear = state.snapshot()

    state.clear()

    expect([...beforeClear]).toEqual(["Control"])
    expect([...state.snapshot()]).toEqual([])
  })
})

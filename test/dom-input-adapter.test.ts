// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { KEYBOARRD_EVENTS, MOUSE_EVENTS } from "react-stay-canvas"
import type { EventInput } from "../src/stay/events/contracts"
import { DomInputAdapter } from "../src/stay/events/input/domInputAdapter"
import { PressedInputState } from "../src/stay/events/input/pressedInputState"

describe("DomInputAdapter", () => {
  it("normalizes DOM events and snapshots pressed input after each transition", () => {
    const target = document.createElement("canvas")
    const state = new PressedInputState()
    const inputs: EventInput[] = []
    const adapter = new DomInputAdapter(target, true, state, (input) => {
      inputs.push(input)
    })

    adapter.bind()
    adapter.bind()

    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Control" }))
    target.dispatchEvent(new MouseEvent("mousedown", { button: 2 }))
    target.dispatchEvent(new MouseEvent("mouseup", { button: 2 }))
    target.dispatchEvent(new KeyboardEvent("keyup", { key: "Control" }))

    expect(inputs.map(({ rawAction }) => rawAction?.trigger)).toEqual([
      KEYBOARRD_EVENTS.KEY_DOWN,
      MOUSE_EVENTS.MOUSE_DOWN,
      MOUSE_EVENTS.MOUSE_UP,
      KEYBOARRD_EVENTS.KEY_UP,
    ])
    expect([...inputs[0].pressedKeys]).toEqual(["Control"])
    expect([...inputs[1].pressedKeys]).toEqual(["Control", "mouse2"])
    expect([...inputs[2].pressedKeys]).toEqual(["Control"])
    expect([...inputs[3].pressedKeys]).toEqual([])
  })

  it("maps every stateless DOM input and preserves dragover drop eligibility", () => {
    const target = document.createElement("canvas")
    const triggers: string[] = []
    const adapter = new DomInputAdapter(
      target,
      false,
      new PressedInputState(),
      ({ rawAction }) => triggers.push(rawAction!.trigger)
    )
    const inputs: Array<[string, string]> = [
      ["mousemove", MOUSE_EVENTS.MOUSE_MOVE],
      ["mouseover", MOUSE_EVENTS.MOUSE_OVER],
      ["click", MOUSE_EVENTS.CLICK],
      ["dblclick", MOUSE_EVENTS.DB_CLICK],
      ["contextmenu", MOUSE_EVENTS.CONTEXT_MENU],
      ["dragstart", MOUSE_EVENTS.DRAG_START],
      ["dragend", MOUSE_EVENTS.DRAG_END],
      ["drop", MOUSE_EVENTS.DROP],
      ["wheel", MOUSE_EVENTS.WHEEL],
      ["mouseenter", MOUSE_EVENTS.MOUSE_ENTER],
      ["mouseleave", MOUSE_EVENTS.MOUSE_LEAVE],
    ]

    adapter.bind()
    inputs.forEach(([type]) => target.dispatchEvent(new Event(type)))
    const dragover = new Event("dragover", { cancelable: true })
    target.dispatchEvent(dragover)

    expect(triggers).toEqual([
      ...inputs.map(([, trigger]) => trigger),
      MOUSE_EVENTS.DRAG_OVER,
    ])
    expect(dragover.defaultPrevented).toBe(true)
  })

  it("unbinds every listener on destroy", () => {
    const target = document.createElement("canvas")
    let calls = 0
    const adapter = new DomInputAdapter(
      target,
      true,
      new PressedInputState(),
      () => calls++
    )

    adapter.bind()
    target.dispatchEvent(new Event("click"))
    adapter.destroy()
    adapter.destroy()
    target.dispatchEvent(new Event("click"))

    expect(calls).toBe(1)
  })
})

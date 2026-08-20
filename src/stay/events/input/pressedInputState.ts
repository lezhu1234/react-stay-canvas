const MOUSE_BUTTON_MASKS = [1, 4, 2, 8, 16]

export function isMouseButtonPressed(buttons: number, button: number) {
  const mask = MOUSE_BUTTON_MASKS[button]
  return mask !== undefined && (buttons & mask) !== 0
}

export class PressedInputState {
  private readonly keys = new Set<string>()

  press(key: string) {
    this.keys.add(key)
  }

  release(key: string) {
    this.keys.delete(key)
  }

  has(key: string) {
    return this.keys.has(key)
  }

  syncMouseButtons(buttons: number) {
    MOUSE_BUTTON_MASKS.forEach((_, button) => {
      const key = `mouse${button}`
      if (isMouseButtonPressed(buttons, button)) this.keys.add(key)
      else this.keys.delete(key)
    })
  }

  clearMouseButtons() {
    this.keys.forEach((key) => {
      if (key.startsWith("mouse")) this.keys.delete(key)
    })
  }

  snapshot(): ReadonlySet<string> {
    return new Set(this.keys)
  }

  clear() {
    this.keys.clear()
  }
}

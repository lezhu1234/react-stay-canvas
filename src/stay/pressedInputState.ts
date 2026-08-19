export class PressedInputState {
  private readonly keys = new Set<string>()

  press(key: string) {
    this.keys.add(key)
  }

  release(key: string) {
    this.keys.delete(key)
  }

  snapshot(): ReadonlySet<string> {
    return new Set(this.keys)
  }

  clear() {
    this.keys.clear()
  }
}

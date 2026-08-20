export type PointerEventInitForTest = MouseEventInit & {
  pointerId?: number
  pointerType?: string
  isPrimary?: boolean
}

export class TestPointerEvent extends MouseEvent {
  readonly pointerId: number
  readonly pointerType: string
  readonly isPrimary: boolean

  constructor(type: string, init: PointerEventInitForTest = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? "mouse"
    this.isPrimary = init.isPrimary ?? true
  }
}

export function installPointerEvents() {
  const previousWindowPointerEvent = (window as any).PointerEvent
  const previousGlobalPointerEvent = (globalThis as any).PointerEvent
  ;(window as any).PointerEvent = TestPointerEvent
  ;(globalThis as any).PointerEvent = TestPointerEvent

  return () => {
    ;(window as any).PointerEvent = previousWindowPointerEvent
    ;(globalThis as any).PointerEvent = previousGlobalPointerEvent
  }
}

export const pointer = (type: string, x: number, y: number, init: PointerEventInitForTest = {}) =>
  new TestPointerEvent(type, {
    bubbles: true,
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    ...init,
  })

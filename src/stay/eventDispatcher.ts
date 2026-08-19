import Canvas from "../canvas"
import {
  click,
  contextmenu,
  dblclick,
  dragend,
  dragover,
  dragstart,
  drop,
  keydown,
  keyup,
  mousedown,
  mouseenter,
  mouseleave,
  mousemove,
  mouseover,
  mouseup,
  wheel,
} from "../rawEvents"
import { EventRuntime } from "./eventRuntime"

export class EventDispatcher<EventName extends string> {
  currentPressedKeys: { [key: string]: boolean } = {}

  constructor(
    private readonly root: Canvas,
    private readonly passive: boolean,
    private readonly runtime: EventRuntime<EventName>
  ) {}

  pressKey(key: string) {
    this.currentPressedKeys[key] = true
  }

  releaseKey(key: string) {
    this.currentPressedKeys[key] = false
  }

  fireEvent(
    e: KeyboardEvent | MouseEvent | WheelEvent | DragEvent | Event,
    trigger: string
  ) {
    const pressedKeys = new Set(
      Object.keys(this.currentPressedKeys).filter((key) => this.currentPressedKeys[key])
    )
    this.runtime.handleInput({ originEvent: e, trigger, pressedKeys })
  }

  // Bind the DOM events on the top layer to fireEvent / pressKey / releaseKey.
  initEvents() {
    const topLayer = this.root.layers[this.root.layers.length - 1]
    const fire = this.fireEvent.bind(this)
    const press = this.pressKey.bind(this)
    const release = this.releaseKey.bind(this)

    topLayer.onkeyup = (e: KeyboardEvent) => keyup(fire, release, e)
    topLayer.onkeydown = (e: KeyboardEvent) => keydown(fire, press, e)
    topLayer.onmouseup = (e: MouseEvent) => mouseup(fire, release, e)
    topLayer.onmousedown = (e: MouseEvent) => mousedown(fire, press, e)
    topLayer.onmousemove = (e: MouseEvent) => mousemove(fire, e)
    topLayer.onmouseover = (e: MouseEvent) => mouseover(fire, e)
    topLayer.onclick = (e: MouseEvent) => click(fire, e)
    topLayer.ondblclick = (e: MouseEvent) => dblclick(fire, e)
    topLayer.oncontextmenu = (e: MouseEvent) => contextmenu(fire, e)
    topLayer.ondragover = (e) => dragover(fire, e)
    topLayer.addEventListener("dragstart", (e: DragEvent) => dragstart(fire, e), false)
    topLayer.ondragend = (e: DragEvent) => dragend(fire, e)
    topLayer.ondrop = (e: DragEvent) => drop(fire, e)
    topLayer.addEventListener("wheel", (e: WheelEvent) => wheel(fire, e), { passive: this.passive })
    topLayer.onmouseenter = (e: MouseEvent) => mouseenter(fire, e)
    topLayer.onmouseleave = (e: MouseEvent) => mouseleave(fire, e)
  }
}

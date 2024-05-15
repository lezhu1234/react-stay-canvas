import Canvas from "../canvas"
import { StayTools } from "../userTypes"
import Stay from "./stayTools"

type Args<T> = T extends (...args: infer R) => any ? R : never
export default class StayStage {
  #stay: Stay
  tools: StayTools
  constructor(
    drawCanvas: HTMLCanvasElement,
    mainCanvas: HTMLCanvasElement,
    width: number,
    height: number
  ) {
    this.#stay = new Stay(new Canvas(drawCanvas, mainCanvas, width, height))
    this.tools = this.#stay.getTools()
  }

  addEventListener(...args: Args<typeof Stay.prototype.addEventListener>) {
    return this.#stay.addEventListener(...args)
  }

  backward() {
    return this.#stay.tools.backward()
  }

  deleteEvent(...args: Args<typeof Stay.prototype.deleteEvent>) {
    return this.#stay.deleteEvent(...args)
  }

  draw(...args: Args<typeof Stay.prototype.draw>) {
    return this.#stay.draw(...args)
  }

  forward() {
    return this.#stay.tools.forward()
  }

  move(...args: Args<typeof Stay.prototype.tools.move>) {
    return this.#stay.tools.move(...args)
  }

  moveStart() {
    return this.#stay.tools.moveStart()
  }

  registerEvent(...args: Args<typeof Stay.prototype.registerEvent>) {
    return this.#stay.registerEvent(...args)
  }

  triggerAction(...args: Args<typeof Stay.prototype.tools.triggerAction>) {
    return this.#stay.tools.triggerAction(...args)
  }

  zoom(...args: Args<typeof Stay.prototype.tools.zoom>) {
    return this.#stay.tools.zoom(...args)
  }
}

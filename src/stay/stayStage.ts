import Canvas from "../canvas"
import { ContextLayerSetFunction } from "../types"
import { StayMode, StayTools } from "../userTypes"
import Stay from "./stay"

type Args<T> = T extends (...args: infer R) => any ? R : never
export default class StayStage {
  #stay: Stay<string>
  tools: StayTools
  constructor(
    canvasLayers: HTMLCanvasElement[],
    contextLayerSetFunctionList: ContextLayerSetFunction[],
    width: number,
    height: number,
    passive: boolean,
    mode: StayMode = "instant"
  ) {
    this.#stay = new Stay(
      new Canvas(canvasLayers, contextLayerSetFunctionList, width, height),
      passive,
      mode
    )
    this.tools = this.#stay.getTools()
  }

  addEventListener(...args: Args<typeof Stay.prototype.addEventListener>) {
    return this.#stay.addEventListener(...args)
  }

  backward() {
    return this.#stay.tools.undo()
  }

  clearEventListeners(...args: Args<typeof Stay.prototype.clearEventListeners>) {
    return this.#stay.clearEventListeners(...args)
  }

  clearEvents(...args: Args<typeof Stay.prototype.clearEvents>) {
    return this.#stay.clearEvents(...args)
  }

  deleteEvent(...args: Args<typeof Stay.prototype.deleteEvent>) {
    return this.#stay.deleteEvent(...args)
  }

  draw(...args: Args<typeof Stay.prototype.draw>) {
    return this.#stay.draw(...args)
  }

  refresh() {
    return this.#stay.draw({
      forceDraw: true,
      now: Date.now(),
    })
  }

  redo() {
    return this.#stay.tools.redo()
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

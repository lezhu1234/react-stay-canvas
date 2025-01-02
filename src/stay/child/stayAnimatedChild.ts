import { AnimatedShape } from "../../shapes/animatedShape"
import { StayAnimatedChildProps } from "../../userTypes"
import { parseLayer, uuid4 } from "../../utils"
import { StayInstantChild } from "./stayInstantChild"
import { Canvas } from "../../canvas"

export class StayAnimatedChild<T extends AnimatedShape> {
  shapeMap: Map<string, T[]>
  canvas: Canvas
  id: any
  className: string
  constructor({ id, className, canvas }: StayAnimatedChildProps<T>) {
    this.id = id ?? uuid4()
    this.className = className
    this.canvas = canvas
    this.shapeMap = new Map<string, T[]>()
  }

  appendKeyFrame(name: string, shape: T) {
    const shapeFrames: T[] = this.shapeMap.get(name) ?? []
    shapeFrames.push(shape)
    this.shapeMap.set(name, shapeFrames)
  }
}

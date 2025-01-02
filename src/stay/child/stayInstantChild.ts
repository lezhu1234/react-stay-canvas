import { InstantShape } from "../../shapes/instantShape"
import {
  Area,
  Coordinate,
  PointType,
  Rect,
  StayInstantChildProps,
  StayInstantChildUpdateProps,
} from "../../userTypes"
import { parseLayer, uuid4 } from "../../utils"
import { StepProps } from "../types"

import { Canvas } from "../../canvas"

export class StayInstantChild<T extends InstantShape = InstantShape> {
  className: string
  id: string

  private shape: T | Map<string, T> | T[]
  shapeMap: Map<string, T>
  canvas: Canvas
  private updatedLayers = new Set<number>()

  //   history
  constructor({ id, className, shape, canvas }: StayInstantChildProps<T>) {
    this.id = id ?? uuid4()
    this.shape = shape
    this.className = className
    this.shapeMap = this.assignShapes(shape)
    this.canvas = canvas
  }

  getShape() {
    return this.shape
  }

  getBound(): Rect {
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity
    this.shapeMap.forEach((shape) => {
      const { x, y, width, height } = shape.getBound()
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x + width)
      bottom = Math.max(bottom, y + height)
    })
    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    }
  }

  move(offsetX: number, offsetY: number) {
    this.shapeMap.forEach((shape) => {
      shape.move(...shape._move(offsetX, offsetY))
    })
  }

  zoom(deltaY: number, center: PointType) {
    this.shapeMap.forEach((shape) => {
      shape.zoom(shape._zoom(deltaY, center))
    })
  }

  moveInit() {
    this.shapeMap.forEach((shape) => {
      shape.moveInit()
    })
  }

  assignShapes(shape: T | T[] | Map<string, T>): Map<string, T> {
    const convertToShapeMap = (shape: T | T[] | Map<string, T>) => {
      if (shape instanceof Map) {
        return shape
      }

      const shapeMap = new Map<string, T>()

      if (!Array.isArray(shape)) {
        shape = [shape]
      }

      shape.forEach((s, i) => {
        shapeMap.set(i.toString()!, s)
      })
      return shapeMap
    }
    const shapeMap = convertToShapeMap(shape)

    shapeMap.forEach((shape) => {
      shape.parent = this
      shape.layer = parseLayer(this.canvas.layers, shape.layer)
    })

    return shapeMap
  }

  containsPointer(point: Coordinate): boolean {
    return this.shapeMap.values().some((shape) => shape.contains(point))
  }

  getUpdatedLayers(): Set<number> {
    return this.updatedLayers
  }

  inArea(area: Area) {
    return this.shapeMap.values().some((shape) => {
      const center = shape.getCenterPoint()

      return (
        center.x >= area.x &&
        center.x <= area.x + area.width &&
        center.y >= area.y &&
        center.y <= area.y + area.height
      )
    })
  }

  getLayers(): Set<number> {
    const layers = new Set<number>()
    this.shapeMap.forEach((shape) => layers.add(shape.layer))
    return layers
  }

  copyShapeMap(): Map<string, T> {
    const shapeMap = new Map<string, T>()
    this.shapeMap.forEach((shape, name) => {
      shapeMap.set(name, shape.copy() as T)
    })
    return shapeMap
  }

  static diff<T extends InstantShape>(
    history: StayInstantChild<T> | undefined,
    now: StayInstantChild<T> | undefined
  ): StepProps | undefined {
    if (now && !history) {
      return {
        action: "append",
        child: {
          id: now.id,
          className: now.className,
          shape: now.copyShapeMap(),
        },
      }
    }
    if (history && !now) {
      return {
        action: "remove",
        child: {
          id: history.id,
          className: history.className,
          shape: history.copyShapeMap(),
        },
      }
    }
    if (history && now) {
      if (history.id !== now.id) {
        throw new Error("history id and now id must be the same")
      }
      return {
        action: "update",
        child: {
          id: now.id,
          className: now.className,
          shape: now.copyShapeMap(),
          beforeName: history.className,
          beforeShape: history.copyShapeMap(),
        },
      }
    }
  }

  onChildShapeChange(shape: T) {
    shape.layer = parseLayer(this.canvas.layers, shape.layer)
    this.updatedLayers.add(shape.layer)
  }

  layerDraw(layer: number) {
    this.updatedLayers.delete(layer)
  }

  copy(): StayInstantChild<T> {
    return new StayInstantChild({ ...this, shape: this.copyShapeMap() })
  }

  getShapes(layer: number): T[] {
    const shapes: T[] = []
    this.shapeMap.forEach((shape) => {
      if (shape.layer === layer) {
        shapes.push(shape)
      }
    })
    return shapes
  }

  update({ id, className, shape }: StayInstantChildUpdateProps<T>) {
    this.id = id ?? this.id
    this.className = className ?? this.className
    this.shapeMap = shape ? this.assignShapes(shape) : this.shapeMap
    this.shape = shape ?? this.shape
  }
}

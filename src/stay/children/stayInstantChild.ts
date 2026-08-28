import { InstantShape } from "../../shapes/instantShape"
import type {
  StayInstantChildProps,
  StayInstantChildUpdateProps,
} from "../../types/children"
import type { ContentPoint } from "../../types/coordinates"
import type { Area, PointType, Rect } from "../../types/geometry"
import type {
  ChildPlacement,
  ChildPlacementSnapshot,
  Matrix2D,
} from "../../types/transform"
import { uuid4 } from "../../utils/identifiers"
import { parseLayer } from "../../utils/stage"
import { mapVector } from "../transforms/affine2D"
import {
  childPlacementEquals,
  copyChildPlacement,
  placementShapeBound,
  placementToContentPoint,
  placementToLocalPoint,
  resolveChildPlacement,
  restoreChildPlacement,
  scaleProjectivePlacement,
  translateProjectivePlacement,
  type ChildPlacementRuntime,
} from "../placements/childPlacement"
import { SetShapeChildCurrentTime } from "../types"

import { Canvas } from "../../canvas"

export class StayInstantChild<T extends InstantShape = InstantShape> {
  className: string
  id: string

  shapeMap: Map<string, T>
  canvas: Canvas
  readonly #onChange?: (childId: string) => void
  #placement: ChildPlacementRuntime
  #moveStartPlacement?: Extract<ChildPlacementSnapshot, { type: "projective" }>
  protected updatedLayers = new Set<number>()

  //   history
  constructor({
    id,
    className,
    shape,
    placement,
    canvas,
    onShapeChange,
  }: StayInstantChildProps<T>) {
    this.id = id ?? uuid4()
    this.className = className
    this.canvas = canvas
    this.#onChange = onShapeChange
    this.#placement = resolveChildPlacement(placement)
    this.shapeMap = this.assignShapes(shape)
  }

  // The child's shape. A child is almost always a single shape, so this returns
  // it typed as T, derived from shapeMap — meaning it's never a Map/array (fixes
  // the old footgun where `child.shape` came back as a Map after undo/import).
  // Rare multi-shape children should read `shapeMap` directly.
  get shape(): T {
    return this.shapeMap.values().next().value as T
  }

  getShape(): T {
    return this.shape
  }

  get placement(): ChildPlacementSnapshot {
    return copyChildPlacement(this.#placement.snapshot)
  }

  /** @internal Returns the affine matrix used by an affine RenderItem. */
  getAffinePlacementMatrix(): Readonly<Matrix2D> {
    if (this.#placement.type !== "affine") {
      throw new Error("projective Child requires a projective RenderItem")
    }
    return this.#placement.snapshot.matrix
  }

  /** @internal Returns the projective mapping owned by this Child, if any. */
  getProjectiveMapping() {
    return this.#placement.type === "projective"
      ? this.#placement.mapping
      : undefined
  }

  setPlacement(placement: ChildPlacement) {
    this.replacePlacement(resolveChildPlacement(placement), true)
    return this
  }

  toContentPoint(point: PointType): ContentPoint | undefined {
    return placementToContentPoint(this.#placement, point)
  }

  toLocalPoint(point: ContentPoint): PointType | undefined {
    return placementToLocalPoint(this.#placement, point)
  }

  private toLocalVector(vector: PointType): PointType {
    if (this.#placement.type !== "affine") {
      throw new Error("projective placement does not have a uniform local vector")
    }
    return mapVector(this.#placement.inverse, vector)
  }

  getShapeBound(shape: T): Rect {
    return placementShapeBound(this.#placement, shape.getBound())
  }

  getBound(): Rect {
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity
    this.shapeMap.forEach((shape) => {
      const { x, y, width, height } = this.getShapeBound(shape)
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
    if (this.#placement.type === "projective") {
      const start = this.#moveStartPlacement ?? this.#placement.snapshot
      this.replacePlacement(
        restoreChildPlacement(translateProjectivePlacement(start, offsetX, offsetY)),
        true
      )
      return
    }
    const localOffset = this.toLocalVector({ x: offsetX, y: offsetY })
    this.shapeMap.forEach((shape) => {
      shape.move(...shape.applyMove(localOffset.x, localOffset.y))
    })
  }

  zoom(deltaY: number, center: PointType) {
    if (this.#placement.type === "projective") {
      this.replacePlacement(
        restoreChildPlacement(scaleProjectivePlacement(
          this.#placement.snapshot,
          1 + deltaY * -0.001,
          center
        )),
        true
      )
      return
    }
    const localCenter = this.toLocalPoint(center)!
    this.shapeMap.forEach((shape) => {
      shape.zoom(shape._zoom(deltaY, localCenter))
    })
  }

  moveInit() {
    if (this.#placement.type === "projective") {
      this.#moveStartPlacement = copyChildPlacement(
        this.#placement.snapshot
      ) as Extract<ChildPlacementSnapshot, { type: "projective" }>
      return
    }
    this.#moveStartPlacement = undefined
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
      // Mark the shape's layer dirty so an appended (or replaced) child paints on
      // the next draw — without this, appendChild alone never renders until the
      // shape is later mutated. See onChildShapeChange for the per-update path.
      this.updatedLayers.add(shape.layer)
    })

    return shapeMap
  }

  containsPointer(point: ContentPoint): boolean {
    const localPoint = this.toLocalPoint(point)
    if (!localPoint) return false
    for (const shape of this.shapeMap.values()) {
      if (shape.contains(localPoint)) return true
    }
    return false
  }

  getUpdatedLayers(): Set<number> {
    return this.updatedLayers
  }

  inArea(area: Area) {
    for (const shape of this.shapeMap.values()) {
      const center = this.toContentPoint(shape.getCenterPoint())
      if (!center) continue

      if (
        center.x >= area.x &&
        center.x <= area.x + area.width &&
        center.y >= area.y &&
        center.y <= area.y + area.height
      ) {
        return true
      }
    }
    return false
  }

  getLayers(): Set<number> {
    const layers = new Set<number>()
    this.shapeMap.forEach((shape) => layers.add(shape.layer))
    return layers
  }

  onChildShapeChange(shape: T, previousLayer: number) {
    shape.layer = parseLayer(this.canvas.layers, shape.layer)
    this.updatedLayers.add(previousLayer)
    this.updatedLayers.add(shape.layer)
    this.#onChange?.(this.id)
  }

  layerDraw(layer: number) {
    this.updatedLayers.delete(layer)
  }

  // Whether this child is tracked by undo/redo history. Static children are;
  // timeline children are NOT (a history snapshot would freeze an interpolated
  // frame). Overridden by StayAnimatedChild — kept as polymorphism so callers
  // never branch on the child's concrete type.
  get participatesInHistory(): boolean {
    return true
  }

  // Advance this child to a point in time. A static child has no timeline, so
  // this is a no-op; StayAnimatedChild overrides it with the real interpolation.
  // Polymorphic so callers can tick every child uniformly.
  setCurrentTime(_props: SetShapeChildCurrentTime): void {}

  /** @internal Projects this Child and returns the matching restoration step. */
  beginCurrentTimeProjection(props: SetShapeChildCurrentTime): () => void {
    this.setCurrentTime(props)
    return () => {}
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

  /**
   * @internal Replaces the child's shape(s) wholesale. This is an internal
   * primitive used by undo/redo (which force-repaint separately) and does NOT
   * go through the normal per-shape dirty-tracking. Consumers should mutate the
   * shape instead — `child.shape.update({ ... })` — which repaints correctly.
   */
  update({ id, className, shape, placement }: StayInstantChildUpdateProps<T>) {
    this.id = id ?? this.id
    this.className = className ?? this.className
    this.shapeMap = shape ? this.assignShapes(shape) : this.shapeMap
    if (placement) {
      this.replacePlacement(restoreChildPlacement(placement), false)
    }
    // `shape` is now a getter derived from shapeMap — nothing else to assign.
  }

  private replacePlacement(placement: ChildPlacementRuntime, notify: boolean) {
    const before = this.#placement.snapshot
    const after = placement.snapshot
    if (childPlacementEquals(before, after)) return
    this.#placement = placement
    this.getLayers().forEach((layer) => this.updatedLayers.add(layer))
    if (notify) this.#onChange?.(this.id)
  }
}

import { Canvas } from "../canvas"
import { InstantShape } from "../shapes/instantShape"
import type { DrawReturn, StayDrawProps } from "../types/tools"
import { hasIntersection } from "../utils/geometry"
import { StayInstantChild } from "./children/stayInstantChild"
import { CoordinateSystem } from "./coordinates/coordinateSystem"

interface DrawLayer {
  forceUpdate: boolean
}

// Owns the render loop, per-layer dirty tracking, the layer draw pass, and the
// nextTick queue. Extracted from Stay so "rendering" is one focused concern.
// Reads the children to paint via an injected provider (the non-root children).
export class Renderer {
  #frameId: number | undefined
  #layers: DrawLayer[]
  #nextTick: (() => void)[] = []
  #running = false
  #lastRenderedCoordinateRevision = -1

  constructor(
    private readonly root: Canvas,
    private readonly getRenderChildren: () => StayInstantChild[],
    private readonly coordinates: CoordinateSystem
  ) {
    this.#layers = root.layers.map(() => ({ forceUpdate: false }))
  }

  forceUpdateLayer(layerIndex: number) {
    this.#layers[layerIndex].forceUpdate = true
  }

  // Force every layer to repaint on the next draw — the honest replacement for
  // the old dead `draw({ forceDraw })` flag. Used by refresh()/progress().
  forceUpdateAllLayers() {
    this.root.layers.forEach((_, i) => this.forceUpdateLayer(i))
  }

  nextTick(fn: () => void) {
    this.#nextTick.push(fn)
  }

  // Repaints only the layers flagged dirty (own forceUpdate, or a child's
  // updatedLayers), clearing + redrawing each such layer's own canvas.
  draw({ now = Date.now(), beforeDrawCallback, afterDrawCallback }: StayDrawProps): DrawReturn {
    interface ChildLayer {
      updateCurrentLayer: boolean
    }

    beforeDrawCallback?.()

    const frame = this.coordinates.getFrame(this.root.getSurfaceMetrics())
    const viewportChanged = frame.revision !== this.#lastRenderedCoordinateRevision
    const childrenInlayer: ChildLayer[] = this.#layers.map((layer) => {
      const childInLayer = { updateCurrentLayer: viewportChanged || layer.forceUpdate }
      layer.forceUpdate = false
      return childInLayer
    })

    const children = this.getRenderChildren()

    children.forEach((child) => {
      child.getUpdatedLayers().forEach((layer) => {
        childrenInlayer[layer].updateCurrentLayer = true
      })
    })

    const updatedLayers: number[] = []
    const updatedChilds: {
      child: StayInstantChild
      shapes: InstantShape[]
    }[] = []

    try {
      for (let layerIndex = 0; layerIndex < childrenInlayer.length; layerIndex++) {
        const { updateCurrentLayer } = childrenInlayer[layerIndex]

        if (!updateCurrentLayer) {
          continue
        }

        updatedLayers.push(layerIndex)

        this.root.withLayerFrame(layerIndex, frame.contentToView, (context) => {
          let layerDrawShapes: InstantShape[] = []

          for (let i = 0; i < children.length; i++) {
            const child = children[i]
            const shapes = child.getShapes(layerIndex)
            layerDrawShapes.push(...shapes)
            child.layerDraw(layerIndex)
            if (shapes.length > 0) {
              updatedChilds.push({ child, shapes })
            }
          }

          layerDrawShapes = layerDrawShapes
            .filter((shape) => hasIntersection(shape.getBound(), frame.visibleContentArea))
            .sort((s1, s2) => s1.zIndex - s2.zIndex)

          layerDrawShapes.forEach((shape) => {
            shape.draw({
              context,
              now,
              width: this.root.width,
              height: this.root.height,
            })
          })
        })
      }
      this.#lastRenderedCoordinateRevision = frame.revision
    } catch (error) {
      this.forceUpdateAllLayers()
      throw error
    }

    if (afterDrawCallback) {
      afterDrawCallback(this.root)
    }

    this.#drainNextTick()

    return { updatedLayers, updatedChilds }
  }

  // The continuous render loop. Incremental: draw() only repaints dirty layers,
  // so an idle frame paints nothing.
  start() {
    if (this.#running) return

    this.#running = true
    this.#runFrame()
  }

  stop() {
    this.#running = false
    if (this.#frameId !== undefined) {
      window.cancelAnimationFrame(this.#frameId)
      this.#frameId = undefined
    }
    this.#nextTick = []
  }

  #runFrame() {
    if (!this.#running) return

    this.#frameId = undefined
    this.draw({ now: Date.now() })
    if (!this.#running) return

    this.#frameId = window.requestAnimationFrame(() => this.#runFrame())
  }

  #drainNextTick() {
    try {
      requestIdleCallback(
        (idle) => {
          while (this.#nextTick.length > 0 && (idle.timeRemaining() > 0 || idle.didTimeout)) {
            const fn = this.#nextTick.shift()
            if (fn) fn()
          }
        },
        { timeout: 1000 }
      )
    } catch (e) {
      while (this.#nextTick.length > 0) {
        const fn = this.#nextTick.shift()
        if (fn) fn()
      }
    }
  }
}

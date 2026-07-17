import { Canvas } from "../canvas"
import { InstantShape } from "../shapes/instantShape"
import { DrawReturn, StayDrawProps } from "../userTypes"
import { StayInstantChild } from "./child/stayInstantChild"

interface DrawLayer {
  forceUpdate: boolean
}

// Owns the render loop, per-layer dirty tracking, the layer draw pass, and the
// nextTick queue. Extracted from Stay so "rendering" is one focused concern.
// Reads the children to paint via an injected provider (the non-root children).
export class Renderer {
  #layers: DrawLayer[]
  #nextTick: (() => void)[] = []
  #rafId: number | null = null
  #stopped = false

  constructor(
    private readonly root: Canvas,
    private readonly getRenderChildren: () => StayInstantChild[]
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

    const childrenInlayer: ChildLayer[] = this.#layers.map((layer) => {
      const childInLayer = { updateCurrentLayer: layer.forceUpdate }
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

    if (beforeDrawCallback) {
      beforeDrawCallback()
    }

    for (let layerIndex = 0; layerIndex < childrenInlayer.length; layerIndex++) {
      const { updateCurrentLayer } = childrenInlayer[layerIndex]

      if (!updateCurrentLayer) {
        continue
      }

      updatedLayers.push(layerIndex)

      const context = this.root.contexts[layerIndex]
      this.root.clear(context)

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

      layerDrawShapes = layerDrawShapes.sort((s1, s2) => s1.zIndex - s2.zIndex)

      layerDrawShapes.forEach((shape) => {
        shape.draw({
          context,
          now,
          width: this.root.width,
          height: this.root.height,
        })
      })
    }

    if (afterDrawCallback) {
      afterDrawCallback(this.root)
    }

    this.#drainNextTick()

    return { updatedLayers, updatedChilds }
  }

  // The continuous render loop. Incremental: draw() only repaints dirty layers,
  // so an idle frame paints nothing. Stops rescheduling once stop() is called.
  start() {
    if (this.#stopped) return
    this.draw({ now: Date.now() })
    this.#rafId = window.requestAnimationFrame(() => this.start())
  }

  // Halt the loop and cancel any pending frame. After this, start() is a no-op
  // (so a torn-down Stay can't keep painting — see Stay.destroy()).
  stop() {
    this.#stopped = true
    if (this.#rafId !== null) {
      window.cancelAnimationFrame(this.#rafId)
      this.#rafId = null
    }
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

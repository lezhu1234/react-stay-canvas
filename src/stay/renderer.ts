import { Canvas } from "../canvas"
import type { DrawReturn, StayDrawProps } from "../types/tools"
import {
  isStayInstantChild,
  isStayWebGLChild,
  type StayChild,
  stayChildLayers,
} from "./children/stayChild"
import {
  CoordinateSystem,
  type CoordinateFrame,
} from "./coordinates/coordinateSystem"
import { executeCanvas2DRenderPlan } from "./rendering/canvas2DExecutor"
import { resolveCanvas2DProjectiveQuality } from "./rendering/canvas2DProjectiveQuality"
import { createLayerRenderPlan } from "./rendering/renderPlan"
import { ChildLayerScheduler } from "./rendering/childLayerScheduler"

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
  readonly #childLayers = new ChildLayerScheduler(stayChildLayers)

  constructor(
    private readonly root: Canvas,
    private readonly getRenderChildren: () => StayChild[],
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
    beforeDrawCallback?.()

    const frame = this.coordinates.getFrame(this.root.getSurfaceMetrics())
    const viewportChanged = frame.revision !== this.#lastRenderedCoordinateRevision
    const dirtyLayers = this.#layers.map((layer, layerIndex) => {
      const dirty = layer.forceUpdate || (
        viewportChanged && this.root.getLayerBackend(layerIndex) === "canvas2d"
      )
      layer.forceUpdate = false
      return dirty
    })

    const children = this.getRenderChildren()

    this.#childLayers.collectDirtyLayers(children, dirtyLayers)

    const updatedLayers: number[] = []
    const updatedChilds: DrawReturn["updatedChilds"] = []

    try {
      for (let layerIndex = 0; layerIndex < dirtyLayers.length; layerIndex++) {
        if (!dirtyLayers[layerIndex] || !this.root.isLayerDrawable(layerIndex)) {
          continue
        }

        updatedLayers.push(layerIndex)
        if (this.root.getLayerBackend(layerIndex) === "webgl2") {
          const canvas2DChild = children
            .filter(isStayInstantChild)
            .find((child) => stayChildLayers.occupiedLayers(child).has(layerIndex))
          if (canvas2DChild) {
            throw new Error(`Canvas2D Child ${canvas2DChild.id} cannot target layer ${layerIndex}`)
          }
          const meshes = children
            .filter(isStayWebGLChild)
            .filter((child) => child.layer === layerIndex)
            .flatMap((child) => [...child.meshes])
          this.root.renderWebGL2Layer(layerIndex, meshes)
        } else {
          const webGLChild = children
            .filter(isStayWebGLChild)
            .find((child) => child.layer === layerIndex)
          if (webGLChild) {
            throw new Error(`WebGL Child ${webGLChild.id} cannot target layer ${layerIndex}`)
          }
          const plan = createLayerRenderPlan(
            children.filter(isStayInstantChild),
            layerIndex,
            frame.visibleContentArea
          )
          updatedChilds.push(...plan.updatedChildren)
          this.#drawCanvas2DLayer(layerIndex, frame, plan.items, now)
        }
        this.#childLayers.acknowledgeLayer(children, layerIndex)
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

  #drawCanvas2DLayer(
    layerIndex: number,
    frame: CoordinateFrame,
    items: ReturnType<typeof createLayerRenderPlan>["items"],
    now: number
  ) {
    const quality = (mapping: Parameters<typeof resolveCanvas2DProjectiveQuality>[0]["mapping"]) => {
      const layer = this.root.layers[layerIndex]
      return resolveCanvas2DProjectiveQuality({
        mapping,
        outputWidth: layer.width,
        outputHeight: layer.height,
        contentScaleX:
          layer.width / this.root.width * frame.contentToView.scale,
        contentScaleY:
          layer.height / this.root.height * frame.contentToView.scale,
      })
    }

    this.root.withLayerFrame(layerIndex, frame.contentToView, (context) => {
      executeCanvas2DRenderPlan({
        context,
        items,
        getNow: () => now,
        width: this.root.width,
        height: this.root.height,
        getProjectiveQuality: ({ projection }) => {
          if (!projection) {
            throw new Error("projective quality requires a projective RenderItem")
          }
          return quality(projection.mapping)
        },
      })
    })
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
    try {
      this.draw({ now: Date.now() })
    } catch (error) {
      // A failed frame has no scheduled successor. Keep the lifecycle state
      // honest so an explicit invalidation such as WebGL context restoration
      // can start a fresh loop after the error has propagated.
      this.#running = false
      throw error
    }
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

"use client"
import React, {
  forwardRef,
  Ref,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react"

import type { CanvasSurfaceMetrics } from "./types/canvas"
import type {
  CanvasWorkerHandle,
  WorkerStayCanvasComponent,
  WorkerStayCanvasProps,
  WorkerStayCanvasRef,
} from "./types/worker"
import {
  createCanvasWorkerClient,
  type CanvasWorkerClient,
} from "./stay/worker/client"

interface MountedWorkerCanvas<Input, Notice> {
  readonly client: CanvasWorkerClient<Input, Notice>
  readonly layers: HTMLCanvasElement[]
  width: number
  height: number
}

function layerCountOf(layers: number) {
  if (!Number.isInteger(layers) || layers < 1) {
    throw new RangeError("layers must be a positive integer")
  }
  return layers
}

function backingSize(width: number, height: number) {
  const dpr = globalThis.devicePixelRatio || 1
  return {
    width: Math.round(width * dpr),
    height: Math.round(height * dpr),
  }
}

function styleLayer(layer: HTMLCanvasElement, width: number, height: number) {
  layer.style.position = "absolute"
  layer.style.display = "block"
  layer.style.outline = "none"
  layer.style.left = "0"
  layer.style.top = "0"
  layer.style.width = `${width}px`
  layer.style.height = `${height}px`
}

function createTransferredLayers(
  container: HTMLDivElement,
  layerCount: number,
  width: number,
  height: number
) {
  const size = backingSize(width, height)
  const layers: HTMLCanvasElement[] = []
  const offscreenLayers: OffscreenCanvas[] = []

  try {
    for (let index = 0; index < layerCount; index++) {
      const layer = document.createElement("canvas")
      layer.tabIndex = 1
      layer.width = size.width
      layer.height = size.height
      styleLayer(layer, width, height)
      container.appendChild(layer)
      layers.push(layer)
      offscreenLayers.push(layer.transferControlToOffscreen())
    }
    return { layers, offscreenLayers }
  } catch (error) {
    layers.forEach((layer) => layer.remove())
    throw error
  }
}

export function readWorkerSurfaceMetrics(
  topLayer: HTMLCanvasElement,
  logicalWidth: number,
  logicalHeight: number
): CanvasSurfaceMetrics {
  const rect = topLayer.getBoundingClientRect()
  const size = backingSize(logicalWidth, logicalHeight)
  return {
    logicalWidth,
    logicalHeight,
    backingWidth: size.width,
    backingHeight: size.height,
    clientRect: {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    },
  }
}

const WorkerStayCanvasImpl = forwardRef(
  <Input, Notice>(
    {
      runtime,
      width = 500,
      height = 500,
      layers = 2,
      className = "",
      passive = true,
      focusOnInit = true,
      viewport,
      mounted,
      onNotice,
      onState,
      onError,
      onInput,
    }: WorkerStayCanvasProps<Input, Notice>,
    ref: Ref<WorkerStayCanvasRef>
  ) => {
    const layerCount = layerCountOf(layers)
    const createWorker = useRef(runtime.createWorker)
    const container = useRef<HTMLDivElement>(null)
    const mountedCanvas = useRef<MountedWorkerCanvas<Input, Notice>>()
    const callbacks = useRef({ mounted, onNotice, onState, onError, onInput })
    callbacks.current = { mounted, onNotice, onState, onError, onInput }
    const activeSize = width > 0 && height > 0

    useImperativeHandle(ref, () => ({
      focus() {
        const current = mountedCanvas.current
        current?.layers[current.layers.length - 1]?.focus()
      },
    }), [])

    useEffect(() => {
      const host = container.current
      if (!host || !activeSize) return

      let active = true
      let worker: Worker | undefined
      let createdLayers: HTMLCanvasElement[] = []
      let current: MountedWorkerCanvas<Input, Notice> | undefined
      try {
        const transferred = createTransferredLayers(
          host,
          layerCount,
          width,
          height
        )
        const topLayer = transferred.layers[transferred.layers.length - 1]
        createdLayers = transferred.layers
        worker = createWorker.current()
        const client = createCanvasWorkerClient<Input, Notice>({
          worker,
          layers: transferred.layers,
          offscreenLayers: transferred.offscreenLayers,
          metrics: () => {
            const size = current && mountedCanvas.current === current
              ? current
              : { width, height }
            return readWorkerSurfaceMetrics(topLayer, size.width, size.height)
          },
          viewport,
          passive,
          onInput: (event) => callbacks.current.onInput?.(event),
          onNotice: (notice) => callbacks.current.onNotice?.(notice),
          onState: (state) => callbacks.current.onState?.(state),
          onError: (error) => callbacks.current.onError?.(error),
        })
        current = {
          client,
          layers: transferred.layers,
          width,
          height,
        }
        mountedCanvas.current = current
        void client.ready.then(() => {
          if (!active || mountedCanvas.current !== current) return
          callbacks.current.mounted?.(client as CanvasWorkerHandle<Input>)
          if (focusOnInit) topLayer.focus()
        }).catch(() => {
          // The client reports initialization failures through onError.
        })
      } catch (error) {
        worker?.terminate()
        createdLayers.forEach((layer) => layer.remove())
        const normalized = error instanceof Error ? error : new Error(String(error))
        callbacks.current.onError?.(normalized)
      }

      return () => {
        active = false
        if (!current) return
        if (mountedCanvas.current === current) mountedCanvas.current = undefined
        current.layers.forEach((layer) => layer.remove())
        void current.client.destroy().catch((error) => {
          callbacks.current.onError?.(
            error instanceof Error ? error : new Error(String(error))
          )
        })
      }
    }, [activeSize, layerCount, passive])

    useEffect(() => {
      const current = mountedCanvas.current
      if (!current || !activeSize) return
      if (current.width === width && current.height === height) return

      current.client.cancelPointerSession("resize")
      current.layers.forEach((layer) => styleLayer(layer, width, height))
      current.width = width
      current.height = height
      const topLayer = current.layers[current.layers.length - 1]
      current.client.notifySurface(
        readWorkerSurfaceMetrics(topLayer, width, height)
      )
    }, [activeSize, width, height])

    return (
      <div
        ref={container}
        className={className}
        style={{
          display: "flex",
          position: "relative",
          justifyContent: "center",
          alignItems: "center",
          width: `${width}px`,
          height: `${height}px`,
        }}
      />
    )
  }
)

const WorkerStayCanvas = WorkerStayCanvasImpl as WorkerStayCanvasComponent

export default WorkerStayCanvas

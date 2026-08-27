// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { Rectangle } from "react-stay-canvas"

import { createStage, md, mm, mu } from "./helpers/stage"

function displayLayers(
  layers: HTMLCanvasElement[],
  rect: { left: number; top: number; width: number; height: number },
) {
  const bound = {
    ...rect,
    x: rect.left,
    y: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => ({}),
  }
  layers.forEach((layer) => {
    layer.getBoundingClientRect = () => bound
  })
}

describe("CSS-scaled Canvas coordinates", () => {
  it("normalizes an upscaled pointer before conditions and Child routing", () => {
    const { stage, layers, top } = createStage({ width: 1100, height: 733 })
    displayLayers(layers, { left: 100, top: 50, width: 1375, height: 916.25 })
    const child = stage.tools.appendChild({
      className: "scaled-target",
      shape: new Rectangle({ x: 950, y: 390, width: 30, height: 30 }),
    })
    const condition = vi.fn(() => true)
    const observed = vi.fn()
    stage.registerEvent({
      name: "scaled-pointer",
      trigger: "mousedown",
      conditionCallback: ({ e }) => condition(e.point),
    })
    stage.addEventListener({
      name: "scaled-target-listener",
      event: "scaled-pointer",
      selector: ".scaled-target",
      callback: ({ e }) => observed(e),
    })

    top.dispatchEvent(md(1300, 550))

    expect(condition).toHaveBeenCalledWith({ x: 960, y: 400 })
    expect(observed).toHaveBeenCalledOnce()
    expect(observed.mock.calls[0][0]).toMatchObject({
      point: { x: 960, y: 400 },
      target: child,
      x: 960,
      y: 400,
    })
  })

  it("normalizes each axis independently when the display is stretched", () => {
    const { stage, layers, top } = createStage({ width: 1000, height: 500 })
    displayLayers(layers, { left: 20, top: 30, width: 500, height: 1000 })
    stage.tools.appendChild({
      className: "stretched-target",
      shape: new Rectangle({ x: 490, y: 90, width: 30, height: 30 }),
    })
    const observed = vi.fn()
    stage.addEventListener({
      name: "stretched-target-listener",
      event: "mousedown",
      selector: ".stretched-target",
      callback: ({ e }) => observed(e.point),
    })

    top.dispatchEvent(md(270, 230))

    expect(observed).toHaveBeenCalledWith({ x: 500, y: 100 })
  })

  it("uses View distances for click pairing and retained drag targets", () => {
    const { stage, layers, top } = createStage({ width: 1000, height: 500 })
    displayLayers(layers, { left: 40, top: 20, width: 2000, height: 1000 })
    const child = stage.tools.appendChild({
      className: "gesture-target",
      shape: new Rectangle({ x: 880, y: 90, width: 80, height: 80 }),
    })
    const clicks = vi.fn()
    const drags = vi.fn()
    stage.addEventListener({
      name: "scaled-click-listener",
      event: "click",
      selector: ".gesture-target",
      callback: ({ e }) => clicks(e),
    })
    stage.addEventListener({
      name: "scaled-drag-listener",
      event: "drag",
      selector: ".gesture-target",
      callback: ({ e }) => drags(e),
    })

    top.dispatchEvent(md(1840, 220))
    top.dispatchEvent(mu(1855, 220))
    expect(clicks).toHaveBeenCalledOnce()
    expect(clicks.mock.calls[0][0]).toMatchObject({
      point: { x: 907.5, y: 100 },
      target: child,
    })

    top.dispatchEvent(md(1840, 220))
    top.dispatchEvent(mm(1870, 220))
    expect(drags).toHaveBeenCalledOnce()
    expect(drags.mock.calls[0][0]).toMatchObject({
      point: { x: 915, y: 100 },
      target: child,
    })
  })

  it("routes through the viewport while keeping public points in Content space", () => {
    const { stage, layers, top } = createStage({ width: 500, height: 300 })
    displayLayers(layers, { left: 20, top: 30, width: 1000, height: 600 })
    const child = stage.tools.appendChild({
      className: "viewport-target",
      shape: new Rectangle({ x: 100, y: 80, width: 40, height: 30 }),
    })
    const observed = vi.fn()
    stage.addEventListener({
      name: "viewport-target-listener",
      event: "mousedown",
      selector: ".viewport-target",
      callback: ({ e }) => observed(e),
    })
    stage.tools.viewport.restore({ x: 50, y: -20, scale: 2 })

    // Content (110, 90) -> View (270, 160) -> Client (560, 350).
    top.dispatchEvent(md(560, 350))

    expect(observed).toHaveBeenCalledOnce()
    expect(observed.mock.calls[0][0]).toMatchObject({
      point: { x: 110, y: 90 },
      movement: { x: 0, y: 0 },
      target: child,
    })
    expect(stage.tools.coordinates.clientToView({ x: 560, y: 350 }))
      .toEqual({ x: 270, y: 160 })
    expect(stage.tools.coordinates.viewToContent({ x: 270, y: 160 }))
      .toEqual({ x: 110, y: 90 })
    expect(stage.tools.coordinates.clientToContent({ x: 560, y: 350 }))
      .toEqual({ x: 110, y: 90 })
    expect(stage.tools.coordinates.contentToView({ x: 110, y: 90 }))
      .toEqual({ x: 270, y: 160 })
    expect(stage.tools.coordinates.viewToClient({ x: 270, y: 160 }))
      .toEqual({ x: 560, y: 350 })
    expect(stage.tools.coordinates.contentToClient({ x: 110, y: 90 }))
      .toEqual({ x: 560, y: 350 })
    expect(stage.tools.coordinates.viewVectorToContent({ x: 20, y: -10 }))
      .toEqual({ x: 10, y: -5 })
    expect(stage.tools.coordinates.contentVectorToView({ x: 10, y: -5 }))
      .toEqual({ x: 20, y: -10 })
    expect(stage.tools.viewport.toClientPoint({ x: 110, y: 90 }))
      .toEqual(stage.tools.coordinates.contentToClient({ x: 110, y: 90 }))
  })

  it("keeps root listeners in View even when Content is outside the scene origin", () => {
    const { stage, layers, top } = createStage({ width: 500, height: 300 })
    displayLayers(layers, { left: 0, top: 0, width: 500, height: 300 })
    const observed = vi.fn()
    stage.addEventListener({
      name: "viewport-root-listener",
      event: "mousedown",
      selector: ".stay-canvas",
      callback: ({ e }) => observed(e.point),
    })
    stage.tools.viewport.restore({ x: 200, y: 100, scale: 1 })

    top.dispatchEvent(md(50, 50))

    expect(observed).toHaveBeenCalledWith({ x: -150, y: -50 })
  })

  it("keeps drag activation and movement in View units at non-identity zoom", () => {
    const { stage, layers, top } = createStage({ width: 500, height: 300 })
    displayLayers(layers, { left: 0, top: 0, width: 500, height: 300 })
    stage.tools.appendChild({
      className: "zoomed-gesture-target",
      shape: new Rectangle({ x: 100, y: 80, width: 40, height: 30 }),
    })
    stage.tools.viewport.restore({ x: 20, y: 10, scale: 2 })
    const drags = vi.fn()
    stage.addEventListener({
      name: "zoomed-gesture-listener",
      event: "drag",
      selector: ".zoomed-gesture-target",
      callback: ({ e }) => drags(e),
    })

    top.dispatchEvent(md(240, 190))
    top.dispatchEvent(mm(251, 190))

    expect(drags).toHaveBeenCalledOnce()
    expect(drags.mock.calls[0][0]).toMatchObject({
      movement: { x: 11, y: 0 },
      point: { x: 115.5, y: 90 },
    })
  })

  it("shares one coordinate frame even when an earlier listener changes viewport", () => {
    const { stage, top } = createStage({ width: 500, height: 300 })
    const child = stage.tools.appendChild({
      className: "stable-frame-target",
      shape: new Rectangle({ x: 100, y: 80, width: 40, height: 30 }),
    })
    const observed = vi.fn()
    stage.addEventListener({
      name: "viewport-mutator",
      event: "mousedown",
      selector: ".stay-canvas",
      callback: ({ tools }) => { tools.viewport.panBy({ x: 300, y: 0 }) },
    })
    stage.addEventListener({
      name: "stable-frame-target-listener",
      event: "mousedown",
      selector: ".stable-frame-target",
      callback: ({ e, tools }) => observed({
        e,
        currentContent: tools.coordinates.clientToContent({ x: 110, y: 90 }),
      }),
    })

    top.dispatchEvent(md(110, 90))

    expect(observed).toHaveBeenCalledOnce()
    expect(observed.mock.calls[0][0]).toMatchObject({
      e: {
        point: { x: 110, y: 90 },
        target: child,
      },
      currentContent: { x: -190, y: 90 },
    })
    expect(Object.keys(observed.mock.calls[0][0].e)).not.toEqual(
      expect.arrayContaining(["client", "view", "content", "coordinates", "coordinateFrame"]),
    )
    expect(stage.tools.viewport.get().x).toBe(300)
  })
})

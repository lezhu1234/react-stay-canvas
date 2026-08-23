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

  it("uses logical distances for click pairing and retained drag targets", () => {
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
})

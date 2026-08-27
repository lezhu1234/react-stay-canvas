// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"

import { MOUSE_EVENTS, Rectangle } from "react-stay-canvas"
import { createStage, md } from "./helpers/stage"

const blue = { r: 20, g: 90, b: 220, a: 1 }

function closePoint(point: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(point.x).toBeCloseTo(expected.x)
  expect(point.y).toBeCloseTo(expected.y)
}

describe("Child Transform2D", () => {
  it("maps one Child between local and Content coordinates without mutating Shape geometry", () => {
    const { stage } = createStage({ width: 240, height: 180, layers: 1 })
    const shape = new Rectangle({
      x: 0,
      y: 0,
      width: 20,
      height: 10,
      fillConfig: { color: blue },
    })
    const child = stage.tools.appendChild({
      className: "plane",
      shape,
      transform: { x: 100, y: 50, rotation: 90 },
    })

    closePoint(child.toContentPoint({ x: 0, y: 0 }), { x: 100, y: 50 })
    closePoint(child.toContentPoint({ x: 20, y: 0 }), { x: 100, y: 70 })
    closePoint(child.toLocalPoint({ x: 95, y: 60 }), { x: 10, y: 5 })
    expect(child.getBound()).toEqual({ x: 90, y: 50, width: 10, height: 20 })
    expect(child.containsPointer({ x: 95, y: 60 })).toBe(true)
    expect(child.containsPointer({ x: 105, y: 60 })).toBe(false)
    expect(shape).toMatchObject({ x: 0, y: 0, width: 20, height: 10 })

    stage.draw({ now: 0 })
    expect(stage.root.contexts[0].getImageData(95, 60, 1, 1).data[3]).toBeGreaterThan(0)
    stage.tools.viewport.restore({ x: 10, y: 5, scale: 1.5 })
    stage.draw({ now: 1 })
    expect(stage.root.contexts[0].getImageData(153, 95, 1, 1).data[3]).toBeGreaterThan(0)
    stage.destroy()
  })

  it("uses the documented semantic order and exposes only matrix snapshots", () => {
    const { stage } = createStage({ layers: 1 })
    const child = stage.tools.appendChild({
      className: "plane",
      shape: new Rectangle({ x: 0, y: 0, width: 20, height: 10 }),
      transform: { x: 30, y: 40, rotation: 90, scaleX: 2, origin: { x: 10, y: 5 } },
    })

    closePoint(child.toContentPoint({ x: 10, y: 5 }), { x: 40, y: 45 })
    closePoint(child.toContentPoint({ x: 20, y: 5 }), { x: 40, y: 65 })

    const snapshot = child.transform as { e: number }
    snapshot.e = 999
    closePoint(child.toContentPoint({ x: 10, y: 5 }), { x: 40, y: 45 })

    child.setTransform({ rotation: 90 })
    closePoint(child.toContentPoint({ x: 10, y: 5 }), { x: -5, y: 10 })
    stage.destroy()
  })

  it("routes real pointer targets through the inverse Child transform", () => {
    const { stage, top } = createStage({ width: 240, height: 180 })
    const callback = vi.fn()
    const child = stage.tools.appendChild({
      className: "plane",
      shape: new Rectangle({ x: 0, y: 0, width: 30, height: 20 }),
      transform: { x: 80, y: 40, rotation: 30, skewX: -12 },
    })
    stage.registerEvent({
      name: "press",
      trigger: MOUSE_EVENTS.MOUSE_DOWN,
      withTarget: ".plane",
    })
    stage.addEventListener({ name: "target", selector: ".plane", event: "press", callback })

    const hit = child.toContentPoint({ x: 15, y: 10 })
    stage.tools.viewport.restore({ x: 12, y: -6, scale: 1.4 })
    top.dispatchEvent(md(hit.x * 1.4 + 12, hit.y * 1.4 - 6))

    expect(callback).toHaveBeenCalledOnce()
    expect(callback.mock.calls[0][0].e.target).toBe(child)
    expect(stage.tools.getContainPointChildren({ selector: ".plane", point: hit })).toEqual([child])
    expect(stage.tools.getChildrenByArea({ x: hit.x - 1, y: hit.y - 1, width: 2, height: 2 }))
      .toEqual([child])
    stage.destroy()
  })

  it("interprets destructive movement in Content coordinates for transformed Children", () => {
    const { stage } = createStage({ layers: 1 })
    const child = stage.tools.appendChild({
      className: "plane",
      shape: new Rectangle({ x: 0, y: 0, width: 20, height: 10 }),
      transform: { rotation: 90 },
    })
    const before = child.toContentPoint(child.shape.getCenterPoint())

    child.moveInit()
    child.move(30, -12)

    const after = child.toContentPoint(child.shape.getCenterPoint())
    closePoint(after, { x: before.x + 30, y: before.y - 12 })
    stage.destroy()
  })

  it("records Transform changes in history without changing Shape snapshots", () => {
    const { stage } = createStage({ layers: 1 })
    const child = stage.tools.appendChild({
      className: "plane",
      shape: new Rectangle({ x: 10, y: 20, width: 30, height: 40 }),
    })
    stage.tools.log()

    child.setTransform({ x: 60, y: 25, rotation: 15 })
    const changed = child.transform
    stage.tools.log()
    stage.tools.undo()

    expect(child.transform).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
    expect(child.shape).toMatchObject({ x: 10, y: 20, width: 30, height: 40 })
    stage.tools.redo()
    expect(child.transform).toEqual(changed)
    stage.destroy()
  })

  it("applies one static transform to an Animated Child projection", () => {
    const { stage } = createStage({ width: 180, height: 140, layers: 1 })
    const child = stage.tools.createChild({
      className: "animated-plane",
      transform: { x: 70, y: 35, rotation: 90 },
    })
    child.appendDefaultFrame(new Rectangle({
      x: 0,
      y: 0,
      width: 20,
      height: 10,
      fillConfig: { color: blue },
      transition: { durationMs: 0, delayMs: 0 },
    }))

    stage.tools.progress({ timeMs: 0 })

    expect(child.shape).toMatchObject({ x: 0, y: 0, width: 20, height: 10 })
    expect(child.containsPointer({ x: 65, y: 45 })).toBe(true)
    expect(stage.root.contexts[0].getImageData(65, 45, 1, 1).data[3]).toBeGreaterThan(0)
    stage.destroy()
  })

  it("preserves transformed visual geometry across scaled scene import and region capture", async () => {
    const source = createStage({ width: 200, height: 200, layers: 1 })
    const child = source.stage.tools.appendChild({
      className: "plane",
      shape: new Rectangle({
        x: 10,
        y: 20,
        width: 30,
        height: 20,
        fillConfig: { color: blue },
      }),
      transform: { x: 45, y: 10, rotation: 25, scaleY: 0.8 },
    })
    const scene = source.stage.tools.exportChildren({
      children: [child],
      area: { x: 0, y: 0, width: 100, height: 100 },
    })
    expect(scene.children[0].transform).toEqual(child.transform)

    const target = createStage({ width: 400, height: 400, layers: 1 })
    target.stage.tools.importChildren(scene, { x: 100, y: 50, width: 200, height: 200 })
    const imported = target.stage.tools.getChildBySelector(".plane")!
    const sourcePoint = child.toContentPoint({ x: 25, y: 30 })
    const importedLocalPoint = { x: 150, y: 110 }
    closePoint(imported.toContentPoint(importedLocalPoint), {
      x: sourcePoint.x * 2 + 100,
      y: sourcePoint.y * 2 + 50,
    })

    const snapshot = await source.stage.tools.regionToTargetCanvas({
      area: { x: 0, y: 0, width: 120, height: 120 },
      children: [child],
    })
    const visiblePoint = child.toContentPoint({ x: 25, y: 30 })
    expect(snapshot.getContext("2d")?.getImageData(
      Math.round(visiblePoint.x),
      Math.round(visiblePoint.y),
      1,
      1,
    ).data[3]).toBeGreaterThan(0)

    source.stage.destroy()
    target.stage.destroy()
  })

  it("rejects non-invertible semantic and raw transforms", () => {
    const { stage } = createStage({ layers: 1 })
    expect(() => stage.tools.appendChild({
      className: "invalid",
      shape: new Rectangle({ x: 0, y: 0, width: 10, height: 10 }),
      transform: { scaleX: 0 },
    })).toThrow("transform matrix must be invertible")
    expect(() => stage.tools.appendChild({
      className: "invalid",
      shape: new Rectangle({ x: 0, y: 0, width: 10, height: 10 }),
      transform: { matrix: { a: 1, b: 0, c: 1, d: 0, e: 0, f: 0 } },
    })).toThrow("transform matrix must be invertible")
    expect(() => stage.tools.appendChild({
      className: "invalid",
      shape: new Rectangle({ x: 0, y: 0, width: 10, height: 10 }),
      transform: { x: Number.NaN },
    })).toThrow("transform.x must be finite")
    expect(() => stage.tools.appendChild({
      className: "invalid",
      shape: new Rectangle({ x: 0, y: 0, width: 10, height: 10 }),
      transform: {
        matrix: { a: Number.MIN_VALUE, b: 0, c: 0, d: 1, e: 0, f: 0 },
      },
    })).toThrow("transform matrix must be invertible")
    stage.destroy()
  })
})

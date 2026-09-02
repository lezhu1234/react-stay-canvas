// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"

import { MOUSE_EVENTS, Rectangle } from "react-stay-canvas"
import { createStage, md } from "./helpers/stage"

const blue = { r: 20, g: 90, b: 220, a: 1 }

function closePoint(point: { x: number; y: number } | undefined, expected: { x: number; y: number }) {
  expect(point).toBeDefined()
  if (!point) return
  expect(point.x).toBeCloseTo(expected.x)
  expect(point.y).toBeCloseTo(expected.y)
}

describe("Child placement", () => {
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
      placement: { type: "affine", x: 100, y: 50, rotation: 90 },
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

  it("uses one projective placement for mapping, rendering, hit testing, bounds, and history", () => {
    const { stage } = createStage({ width: 160, height: 120, layers: 1 })
    const matrix = {
      m00: 1, m01: 0, m02: 20,
      m10: 0, m11: 1, m12: 20,
      m20: 0.005, m21: 0, m22: 1,
    }
    const child = stage.tools.appendChild({
      className: "projective-plane",
      shape: new Rectangle({
        x: 0,
        y: 0,
        width: 80,
        height: 60,
        fillConfig: { color: blue },
      }),
      placement: {
        type: "projective",
        matrix,
        domain: { x: 0, y: 0, width: 80, height: 60 },
      },
    })
    stage.tools.log()

    const content = child.toContentPoint({ x: 40, y: 30 })
    closePoint(content, { x: 50, y: 50 / 1.2 })
    expect(content && child.toLocalPoint(content)).toMatchObject({ x: 40, y: 30 })
    expect(child.toContentPoint({ x: 81, y: 30 })).toBeUndefined()
    expect(child.containsPointer(content!)).toBe(true)
    expect(child.getBound()).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number),
    })

    stage.draw({ now: 0 })
    expect(stage.root.contexts[0].getImageData(
      Math.round(content!.x),
      Math.round(content!.y),
      1,
      1
    ).data[3]).toBeGreaterThan(0)

    child.setPlacement({ type: "affine", x: 90, y: 30 })
    stage.tools.log()
    stage.tools.undo()
    expect(child.placement).toEqual({
      type: "projective",
      matrix,
      domain: { x: 0, y: 0, width: 80, height: 60 },
    })
    stage.tools.redo()
    expect(child.placement).toEqual({
      type: "affine",
      matrix: { a: 1, b: 0, c: 0, d: 1, e: 90, f: 30 },
    })
    stage.destroy()
  })

  it("resolves later Child placement changes at the synchronous draw boundary", () => {
    const { stage } = createStage({ width: 180, height: 150, layers: 1 })
    const affineToProjective = stage.tools.appendChild({
      className: "affine-to-projective",
      shape: new Rectangle({
        x: 0, y: 0, width: 20, height: 20, zIndex: 1,
        fillConfig: { color: blue },
      }),
      placement: { type: "affine", x: 140, y: 10 },
    })
    const projectiveToAffine = stage.tools.appendChild({
      className: "projective-to-affine",
      shape: new Rectangle({
        x: 0, y: 0, width: 20, height: 20, zIndex: 2,
        fillConfig: { color: blue },
      }),
      placement: {
        type: "projective",
        matrix: {
          m00: 1, m01: 0, m02: 20,
          m10: 0, m11: 1, m12: 60,
          m20: 0.002, m21: 0, m22: 1,
        },
        domain: { x: 0, y: 0, width: 20, height: 20 },
      },
    })
    const projectiveToProjective = stage.tools.appendChild({
      className: "projective-to-projective",
      shape: new Rectangle({
        x: 0, y: 0, width: 20, height: 20, zIndex: 3,
        fillConfig: { color: blue },
      }),
      placement: {
        type: "projective",
        matrix: {
          m00: 1, m01: 0, m02: 20,
          m10: 0, m11: 1, m12: 110,
          m20: 0.002, m21: 0, m22: 1,
        },
        domain: { x: 0, y: 0, width: 20, height: 20 },
      },
    })
    stage.tools.appendChild({
      className: "mutator",
      shape: new Rectangle({
        x: 0, y: 0, width: 2, height: 2, zIndex: 0,
        stateDrawFuncMap: {
          default: {
            afterDraw: () => {
              affineToProjective.setPlacement({
                type: "projective",
                matrix: {
                  m00: 1, m01: 0, m02: 20,
                  m10: 0, m11: 1, m12: 10,
                  m20: 0.002, m21: 0, m22: 1,
                },
                domain: { x: 0, y: 0, width: 20, height: 20 },
              })
              projectiveToAffine.setPlacement({ type: "affine", x: 100, y: 60 })
              projectiveToProjective.setPlacement({
                type: "projective",
                matrix: {
                  m00: 1, m01: 0, m02: 100,
                  m10: 0, m11: 1, m12: 110,
                  m20: 0.002, m21: 0, m22: 1,
                },
                domain: { x: 0, y: 0, width: 20, height: 20 },
              })
            },
          },
        },
      }),
    })

    stage.draw({ now: 0 })
    const context = stage.root.contexts[0]
    expect(context.getImageData(25, 15, 1, 1).data[3]).toBeGreaterThan(0)
    expect(context.getImageData(105, 65, 1, 1).data[3]).toBeGreaterThan(0)
    expect(context.getImageData(105, 115, 1, 1).data[3]).toBeGreaterThan(0)
    expect(context.getImageData(145, 15, 1, 1).data[3]).toBe(0)
    expect(context.getImageData(25, 65, 1, 1).data[3]).toBe(0)
    expect(context.getImageData(25, 115, 1, 1).data[3]).toBe(0)
    stage.destroy()
  })

  it("uses the documented semantic order and exposes only matrix snapshots", () => {
    const { stage } = createStage({ layers: 1 })
    const child = stage.tools.appendChild({
      className: "plane",
      shape: new Rectangle({ x: 0, y: 0, width: 20, height: 10 }),
      placement: {
        type: "affine",
        x: 30,
        y: 40,
        rotation: 90,
        scaleX: 2,
        origin: { x: 10, y: 5 },
      },
    })

    closePoint(child.toContentPoint({ x: 10, y: 5 }), { x: 40, y: 45 })
    closePoint(child.toContentPoint({ x: 20, y: 5 }), { x: 40, y: 65 })

    const snapshot = child.placement
    expect(snapshot.type).toBe("affine")
    if (snapshot.type === "affine") {
      ;(snapshot.matrix as { e: number }).e = 999
    }
    closePoint(child.toContentPoint({ x: 10, y: 5 }), { x: 40, y: 45 })

    child.setPlacement({ type: "affine", rotation: 90 })
    closePoint(child.toContentPoint({ x: 10, y: 5 }), { x: -5, y: 10 })
    stage.destroy()
  })

  it("routes real pointer targets through the inverse Child placement", () => {
    const { stage, top } = createStage({ width: 240, height: 180 })
    const callback = vi.fn()
    const child = stage.tools.appendChild({
      className: "plane",
      shape: new Rectangle({ x: 0, y: 0, width: 30, height: 20 }),
      placement: { type: "affine", x: 80, y: 40, rotation: 30, skewX: -12 },
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

  it("interprets destructive movement in Content coordinates for affine Children", () => {
    const { stage } = createStage({ layers: 1 })
    const child = stage.tools.appendChild({
      className: "plane",
      shape: new Rectangle({ x: 0, y: 0, width: 20, height: 10 }),
      placement: { type: "affine", rotation: 90 },
    })
    const before = child.toContentPoint(child.shape.getCenterPoint())

    child.moveInit()
    child.move(30, -12)

    const after = child.toContentPoint(child.shape.getCenterPoint())
    closePoint(after, { x: before.x + 30, y: before.y - 12 })
    stage.destroy()
  })

  it("records placement changes in history without changing Shape snapshots", () => {
    const { stage } = createStage({ layers: 1 })
    const child = stage.tools.appendChild({
      className: "plane",
      shape: new Rectangle({ x: 10, y: 20, width: 30, height: 40 }),
    })
    stage.tools.log()

    child.setPlacement({ type: "affine", x: 60, y: 25, rotation: 15 })
    const changed = child.placement
    stage.tools.log()
    stage.tools.undo()

    expect(child.placement).toEqual({
      type: "affine",
      matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    })
    expect(child.shape).toMatchObject({ x: 10, y: 20, width: 30, height: 40 })
    stage.tools.redo()
    expect(child.placement).toEqual(changed)
    stage.destroy()
  })

  it("applies one static placement to an Animated Child projection", () => {
    const { stage } = createStage({ width: 180, height: 140, layers: 1 })
    const child = stage.tools.createChild({
      className: "animated-plane",
      placement: { type: "affine", x: 70, y: 35, rotation: 90 },
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

  it("preserves affine visual geometry across scaled scene import and region capture", async () => {
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
      placement: {
        type: "affine",
        x: 45,
        y: 10,
        rotation: 25,
        scaleY: 0.8,
      },
    })
    const scene = source.stage.tools.exportChildren({
      children: [child],
      area: { x: 0, y: 0, width: 100, height: 100 },
    })
    expect(scene.children[0].placement).toEqual(child.placement)

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

  it("preserves projective placement across movement, scene transfer, and region capture", async () => {
    const source = createStage({ width: 180, height: 140, layers: 1 })
    const child = source.stage.tools.appendChild({
      className: "projective-plane",
      shape: new Rectangle({
        x: 0,
        y: 0,
        width: 80,
        height: 60,
        fillConfig: { color: blue },
      }),
      placement: {
        type: "projective",
        matrix: {
          m00: 1, m01: 0, m02: 20,
          m10: 0, m11: 1, m12: 20,
          m20: 0.005, m21: 0, m22: 1,
        },
        domain: { x: 0, y: 0, width: 80, height: 60 },
      },
    })
    const beforeMove = child.toContentPoint({ x: 40, y: 30 })!
    child.moveInit()
    child.move(12, -7)
    closePoint(child.toContentPoint({ x: 40, y: 30 }), {
      x: beforeMove.x + 12,
      y: beforeMove.y - 7,
    })

    const scene = source.stage.tools.exportChildren({
      children: [child],
      area: { x: 0, y: 0, width: 100, height: 100 },
    })
    const payloadPlacement = structuredClone(scene.children[0].placement)
    const target = createStage({ width: 400, height: 400, layers: 1 })
    target.stage.tools.importChildren(scene, {
      x: 100,
      y: 50,
      width: 200,
      height: 200,
    })
    const imported = target.stage.tools.getChildBySelector(".projective-plane")!
    expect(imported.placement.type).toBe("projective")
    closePoint(imported.toContentPoint({ x: 180, y: 110 }), {
      x: child.toContentPoint({ x: 40, y: 30 })!.x * 2 + 100,
      y: child.toContentPoint({ x: 40, y: 30 })!.y * 2 + 50,
    })
    expect(scene.children[0].placement).toEqual(payloadPlacement)

    const capture = await source.stage.tools.regionToTargetCanvas({
      area: { x: 0, y: 0, width: 180, height: 140 },
      children: [child],
    })
    const visible = child.toContentPoint({ x: 40, y: 30 })!
    expect(capture.getContext("2d")?.getImageData(
      Math.round(visible.x),
      Math.round(visible.y),
      1,
      1
    ).data[3]).toBeGreaterThan(0)

    source.stage.destroy()
    target.stage.destroy()
  })

  it("rejects non-invertible semantic and raw affine placements", () => {
    const { stage } = createStage({ layers: 1 })
    expect(() => stage.tools.appendChild({
      className: "invalid",
      shape: new Rectangle({ x: 0, y: 0, width: 10, height: 10 }),
      placement: { type: "affine", scaleX: 0 },
    })).toThrow("affine placement matrix must be invertible")
    expect(() => stage.tools.appendChild({
      className: "invalid",
      shape: new Rectangle({ x: 0, y: 0, width: 10, height: 10 }),
      placement: {
        type: "affine",
        matrix: { a: 1, b: 0, c: 1, d: 0, e: 0, f: 0 },
      },
    })).toThrow("affine placement matrix must be invertible")
    expect(() => stage.tools.appendChild({
      className: "invalid",
      shape: new Rectangle({ x: 0, y: 0, width: 10, height: 10 }),
      placement: { type: "affine", x: Number.NaN },
    })).toThrow("placement.x must be finite")
    expect(() => stage.tools.appendChild({
      className: "invalid",
      shape: new Rectangle({ x: 0, y: 0, width: 10, height: 10 }),
      placement: {
        type: "affine",
        matrix: { a: Number.MIN_VALUE, b: 0, c: 0, d: 1, e: 0, f: 0 },
      },
    })).toThrow("affine placement matrix must be invertible")
    stage.destroy()
  })
})

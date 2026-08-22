// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import {
  Line,
  Rectangle,
  type InstantShape,
  type SceneFragment,
  type StayInstantChild,
} from "react-stay-canvas"

import { createStage } from "./helpers/stage"

const stroke = { color: { r: 1, g: 2, b: 3, a: 1 }, lineWidth: 2 }
const rect = (x: number, y: number, width = 20, height = 20) =>
  new Rectangle({ x, y, width, height, strokeConfig: stroke })

function shapeCoordinates(shape: InstantShape) {
  if (shape instanceof Rectangle) {
    return {
      kind: "rectangle" as const,
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
    }
  }
  if (shape instanceof Line) {
    return {
      kind: "line" as const,
      x1: shape.x1,
      y1: shape.y1,
      x2: shape.x2,
      y2: shape.y2,
    }
  }
  throw new Error(`Unsupported acceptance Shape: ${shape.constructor.name}`)
}

function importedBySourceId(
  scene: SceneFragment,
  imported: StayInstantChild[],
): Map<string, StayInstantChild> {
  expect(imported).toHaveLength(scene.children.length)
  return new Map(
    scene.children.map((fragment, index) => [fragment.sourceId, imported[index]])
  )
}

describe("Child snapshot API acceptance", () => {
  it("A1 preserves named static Child state, identity boundaries, and redo-tail semantics", () => {
    const tools = createStage().stage.tools
    const first = tools.appendChild({
      id: "first",
      className: "node",
      shape: new Map([
        ["body", rect(10, 20, 30, 40)],
        ["badge", rect(45, 25, 6, 8)],
      ]),
    })
    tools.log()
    const second = tools.appendChild({
      id: "second",
      className: "node",
      shape: rect(80, 90),
    })
    tools.log()

    tools.undo()
    expect(tools.getChildById(first.id)).toBe(first)
    expect(tools.getChildById(second.id)).toBeUndefined()

    tools.undo()
    expect(tools.getChildrenWithoutRoot()).toHaveLength(0)
    tools.undo()
    expect(tools.getChildrenWithoutRoot()).toHaveLength(0)

    tools.redo()
    const restoredFirst = tools.getChildById(first.id)!
    expect(restoredFirst).not.toBe(first)
    expect(restoredFirst.id).toBe(first.id)
    expect(restoredFirst.className).toBe("node")
    expect([...restoredFirst.shapeMap.keys()]).toEqual(["body", "badge"])
    expect(restoredFirst.shapeMap.get("body")).toBeInstanceOf(Rectangle)
    expect(restoredFirst.shapeMap.get("body")).not.toBe(first.shapeMap.get("body"))
    expect(restoredFirst.shapeMap.get("body")?.x).toBe(10)
    expect(restoredFirst.shapeMap.get("badge")?.x).toBe(45)
    expect(restoredFirst.shapeMap.get("badge")?.parent).toBe(restoredFirst)

    tools.redo()
    expect(tools.getChildById(second.id)?.shape.x).toBe(80)
    tools.redo()
    expect(tools.getChildrenWithoutRoot()).toHaveLength(2)

    tools.undo()
    expect(tools.getChildById(first.id)).toBe(restoredFirst)
    expect(tools.getChildById(second.id)).toBeUndefined()
    const replacement = tools.appendChild({
      id: "replacement",
      className: "node",
      shape: rect(120, 130),
    })
    tools.log()
    tools.redo()

    expect(tools.getChildrenWithoutRoot().map((child) => child.id).sort()).toEqual([
      first.id,
      replacement.id,
    ])
    expect(tools.getChildById(second.id)).toBeUndefined()
  })

  it("A1 keeps recorded Shape state isolated from restored runtime Children", () => {
    const tools = createStage().stage.tools
    const original = tools.appendChild({
      id: "isolated-history",
      className: "node",
      shape: rect(10, 20),
    })
    tools.log()

    tools.undo()
    tools.redo()
    const firstRestoration = tools.getChildById(original.id)!
    firstRestoration.shape.update({ x: 99 })

    tools.undo()
    firstRestoration.shape.update({ x: 123 })
    tools.redo()
    const secondRestoration = tools.getChildById(original.id)!

    expect(secondRestoration).not.toBe(firstRestoration)
    expect(secondRestoration.shape).not.toBe(firstRestoration.shape)
    expect(secondRestoration.shape.x).toBe(10)
  })

  it("A2 keeps every named Shape independent while preserving source correlation", () => {
    const sourceTools = createStage().stage.tools
    const first = sourceTools.appendChild({
      id: "node-a",
      className: "node",
      shape: new Map([
        ["body", rect(10, 20, 30, 40)],
        ["badge", rect(45, 25, 6, 8)],
      ]),
    })
    const second = sourceTools.appendChild({
      id: "node-b",
      className: "node",
      shape: new Map([
        ["body", rect(100, 110, 30, 40)],
        ["badge", rect(135, 115, 6, 8)],
      ]),
    })
    const sourceLine = new Line({
      x1: 25,
      y1: 40,
      x2: 115,
      y2: 130,
      strokeConfig: stroke,
    })
    const edge = sourceTools.appendChild({ id: "edge-a-b", className: "edge", shape: sourceLine })
    const relation = { childId: edge.id, from: first.id, to: second.id }
    const sourceChildren = [first, second, edge]
    const sourceById = new Map(sourceChildren.map((child) => [child.id, child]))
    const scene = sourceTools.exportChildren({
      children: sourceChildren,
      area: { x: 0, y: 0, width: 500, height: 500 },
    })
    const fragmentGeometryBeforeImports = new Map(
      scene.children.map((fragment) => [
        fragment.sourceId,
        new Map(
          [...fragment.shapes].map(([key, shape]) => [key, shapeCoordinates(shape)])
        ),
      ])
    )

    const firstTargetTools = createStage().stage.tools
    firstTargetTools.importChildren(scene, { x: 20, y: 30, width: 500, height: 500 })
    const firstCopies = importedBySourceId(scene, firstTargetTools.getChildrenWithoutRoot())
    const secondTargetTools = createStage().stage.tools
    secondTargetTools.importChildren(scene, { x: 40, y: 50, width: 500, height: 500 })
    const secondCopies = importedBySourceId(scene, secondTargetTools.getChildrenWithoutRoot())

    scene.children.forEach((fragment) => {
      const source = sourceById.get(fragment.sourceId)!
      const firstCopy = firstCopies.get(fragment.sourceId)!
      const secondCopy = secondCopies.get(fragment.sourceId)!

      expect(fragment.className).toBe(source.className)
      expect("copy" in fragment).toBe(false)
      expect("canvas" in fragment).toBe(false)
      expect(firstCopy.id).not.toBe(source.id)
      expect(secondCopy.id).not.toBe(source.id)
      expect(secondCopy.id).not.toBe(firstCopy.id)
      expect([...fragment.shapes.keys()]).toEqual([...source.shapeMap.keys()])
      expect([...firstCopy.shapeMap.keys()]).toEqual([...source.shapeMap.keys()])
      expect([...secondCopy.shapeMap.keys()]).toEqual([...source.shapeMap.keys()])

      fragment.shapes.forEach((fragmentShape, key) => {
        const sourceShape = source.shapeMap.get(key)!
        const firstShape = firstCopy.shapeMap.get(key)!
        const secondShape = secondCopy.shapeMap.get(key)!
        const fragmentGeometryBeforeImport = fragmentGeometryBeforeImports
          .get(fragment.sourceId)!
          .get(key)!

        expect(new Set([sourceShape, fragmentShape, firstShape, secondShape]).size).toBe(4)
        expect(fragmentShape.constructor).toBe(sourceShape.constructor)
        expect(firstShape.constructor).toBe(sourceShape.constructor)
        expect(secondShape.constructor).toBe(sourceShape.constructor)
        expect(fragmentShape.parent).toBeUndefined()
        expect(firstShape.parent).toBe(firstCopy)
        expect(secondShape.parent).toBe(secondCopy)
        expect(shapeCoordinates(fragmentShape)).toEqual(fragmentGeometryBeforeImport)

        if (firstShape instanceof Line) {
          const sourceLineShape = sourceShape as Line
          const fragmentLineShape = fragmentShape as Line
          const secondLineShape = secondShape as Line
          expect(shapeCoordinates(fragmentLineShape)).toEqual(shapeCoordinates(sourceLineShape))
          expect(firstShape).toMatchObject({
            x1: sourceLineShape.x1 + 20,
            y1: sourceLineShape.y1 + 30,
            x2: sourceLineShape.x2 + 20,
            y2: sourceLineShape.y2 + 30,
          })
          expect(secondLineShape).toMatchObject({
            x1: sourceLineShape.x1 + 40,
            y1: sourceLineShape.y1 + 50,
            x2: sourceLineShape.x2 + 40,
            y2: sourceLineShape.y2 + 50,
          })
          const sourceX1 = (sourceShape as Line).x1
          const fragmentX1 = (fragmentShape as Line).x1
          const secondX1 = (secondShape as Line).x1
          firstShape.update({ x1: firstShape.x1 + 100 })
          expect((sourceShape as Line).x1).toBe(sourceX1)
          expect((fragmentShape as Line).x1).toBe(fragmentX1)
          expect((secondShape as Line).x1).toBe(secondX1)
          return
        }

        const firstRectangle = firstShape as Rectangle
        const sourceRectangle = sourceShape as Rectangle
        const fragmentRectangle = fragmentShape as Rectangle
        const secondRectangle = secondShape as Rectangle
        expect(shapeCoordinates(fragmentRectangle)).toEqual(shapeCoordinates(sourceRectangle))
        expect(firstRectangle).toMatchObject({
          x: sourceRectangle.x + 20,
          y: sourceRectangle.y + 30,
          width: sourceRectangle.width,
          height: sourceRectangle.height,
        })
        expect(secondRectangle).toMatchObject({
          x: sourceRectangle.x + 40,
          y: sourceRectangle.y + 50,
          width: sourceRectangle.width,
          height: sourceRectangle.height,
        })
        const sourceX = (sourceShape as Rectangle).x
        const fragmentX = (fragmentShape as Rectangle).x
        const secondX = (secondShape as Rectangle).x
        firstRectangle.update({ x: firstRectangle.x + 100 })
        expect((sourceShape as Rectangle).x).toBe(sourceX)
        expect((fragmentShape as Rectangle).x).toBe(fragmentX)
        expect((secondShape as Rectangle).x).toBe(secondX)
      })
    })

    const copiedFirst = firstCopies.get(relation.from)!
    const copiedSecond = firstCopies.get(relation.to)!
    const copiedEdge = firstCopies.get(relation.childId)!
    const copiedLine = copiedEdge.shape as Line
    const sceneLine = scene.children.find(({ sourceId }) => sourceId === edge.id)!.shapes.values().next().value as Line

    expect(copiedFirst.className).toBe("node")
    expect(copiedSecond.className).toBe("node")
    expect(copiedEdge.className).toBe("edge")
    expect(copiedLine).toBeInstanceOf(Line)
    expect(new Set([sourceLine, sceneLine, copiedLine]).size).toBe(3)
    copiedLine.update({ x1: 999 })
    expect(sourceLine.x1).toBe(25)
    expect(sceneLine.x1).toBe(25)
  })

  it("A3 applies non-empty static history without replacing or freezing animation", () => {
    const tools = createStage().stage.tools
    const stageGrid = tools.appendChild({ id: "stage-grid", className: "grid", shape: rect(0, 0) })
    const animated = tools.createChild({ id: "animated", className: "animated" })
    animated.appendKeyFrame(
      "panel",
      new Rectangle({ x: 10, y: 10, width: 20, height: 20, strokeConfig: stroke, transition: { durationMs: 300 } })
    )
    animated.appendKeyFrame(
      "panel",
      new Rectangle({ x: 50, y: 10, width: 20, height: 20, strokeConfig: stroke, transition: { durationMs: 300 } })
    )
    tools.progress({ timeMs: 300 })
    const projectionBeforeUndo = animated.shape
    const frameCount = animated.getSlice("panel").length
    tools.log()

    const guide = tools.appendChild({ id: "guide", className: "guide", shape: rect(5, 5) })
    tools.log()
    tools.undo()

    expect(tools.getChildById(guide.id)).toBeUndefined()
    expect(tools.getChildById(stageGrid.id)).toBe(stageGrid)
    expect(tools.getChildById(animated.id)).toBe(animated)
    expect(animated.participatesInHistory).toBe(false)
    expect(animated.getSlice("panel")).toHaveLength(frameCount)
    tools.progress({ timeMs: 600 })
    expect(animated.shape.x).toBe(50)
    expect(animated.shape).not.toBe(projectionBeforeUndo)

    const scene = tools.exportChildren({ children: [animated] })
    expect(scene.children[0].sourceId).toBe(animated.id)
    expect("shapeFramesMap" in scene.children[0]).toBe(false)
    const targetTools = createStage().stage.tools
    targetTools.importChildren(scene)
    const importedProjection = targetTools.getChildrenWithoutRoot()[0]
    expect(importedProjection.id).not.toBe(animated.id)
    expect(importedProjection.participatesInHistory).toBe(true)
    expect("shapeFramesMap" in importedProjection).toBe(false)
    expect(importedProjection.shape).toBeInstanceOf(Rectangle)
    expect(importedProjection.shape.x).toBe(50)

    tools.removeChild(animated.id)
    tools.removeChild(stageGrid.id)
    tools.log()
    tools.undo()
    expect(tools.getChildById(stageGrid.id)).toBeTruthy()
    expect(tools.getChildById(animated.id)).toBeUndefined()
  })
})

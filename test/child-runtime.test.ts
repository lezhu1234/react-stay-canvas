import { describe, expect, it, vi } from "vitest"
import { ChildrenStore } from "../src/stay/children/childrenStore"
import type {
  ChildHistoryRuntime,
  ChildLayerRuntime,
} from "../src/stay/children/runtimeContracts"
import { captureChildHistory } from "../src/stay/historySnapshot"
import { ChildLayerScheduler } from "../src/stay/rendering/childLayerScheduler"
import { createPointTargetPicker } from "../src/stay/events/routing/pointerTargetPicker"
import { CoordinateSystem } from "../src/stay/coordinates/coordinateSystem"

type SyntheticChild = {
  id: string
  className: string
  dirty: Set<number>
  occupied: Set<number>
  revision: number
  historical: boolean
}

const syntheticLayers: ChildLayerRuntime<SyntheticChild> = {
  dirtyLayers: (child) => child.dirty,
  drawn: (child, layerIndex) => child.dirty.delete(layerIndex),
  occupiedLayers: (child) => child.occupied,
}

const syntheticHistory: ChildHistoryRuntime<SyntheticChild, number> = {
  participates: (child) => child.historical,
  capture: (child) => child.revision,
}

function syntheticChild(
  id: string,
  className: string,
  options: Partial<SyntheticChild> = {}
): SyntheticChild {
  return {
    id,
    className,
    dirty: new Set(),
    occupied: new Set(),
    revision: 0,
    historical: true,
    ...options,
  }
}

describe("shared child runtime contracts", () => {
  it("selects a non-Shape child using identity only", () => {
    const store = new ChildrenStore<SyntheticChild>()
    const first = syntheticChild("first", "node:active")
    const second = syntheticChild("second", "other")
    store.add(first)
    store.add(second)

    expect(store.bySelector(".node")).toEqual([first])
    expect(store.bySelector("#second")).toEqual([second])
    expect(store.bySelector((child) => child.revision === 0)).toEqual([first, second])
  })

  it("delegates dirty collection and acknowledgement to the backend", () => {
    const child = syntheticChild("mesh", "mesh", { dirty: new Set([1]) })
    const scheduler = new ChildLayerScheduler(syntheticLayers)
    const dirtyLayers = [false, false, false]

    scheduler.collectDirtyLayers([child], dirtyLayers)
    expect(dirtyLayers).toEqual([false, true, false])

    scheduler.acknowledgeLayer([child], 1)
    expect(child.dirty.size).toBe(0)
  })

  it("delegates history participation and snapshot format to the backend", () => {
    const recorded = syntheticChild("recorded", "mesh", { revision: 3 })
    const transient = syntheticChild("transient", "mesh", {
      revision: 8,
      historical: false,
    })

    expect(captureChildHistory([recorded, transient], syntheticHistory)).toEqual(
      new Map([["recorded", 3]])
    )
  })

  it("keeps root bounds in routing while delegating child hits", () => {
    const root = syntheticChild("root", "root")
    const hit = syntheticChild("hit", "mesh")
    const miss = syntheticChild("miss", "mesh")
    const contains = vi.fn((child: SyntheticChild) => child === hit)
    const picker = createPointTargetPicker(root, { contains })
    const coordinates = new CoordinateSystem()
    const metrics = {
      logicalWidth: 100,
      logicalHeight: 100,
      backingWidth: 100,
      backingHeight: 100,
      clientRect: { left: 0, top: 0, width: 100, height: 100 },
    }
    const frame = coordinates.getFrame(metrics)
    const pointer = coordinates.mapPointer(
      {
        start: { clientX: 10, clientY: 10 },
        previous: { clientX: 10, clientY: 10 },
        current: { clientX: 10, clientY: 10 },
      },
      metrics,
      frame
    )

    const hits = picker.hits([miss, root, hit], pointer, frame)

    expect(hits).toEqual([root, hit])
    expect(contains.mock.calls.map(([child]) => child)).toEqual([miss, hit])
  })
})

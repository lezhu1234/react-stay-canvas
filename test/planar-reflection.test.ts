import { describe, expect, it } from "vitest"

import { copyMatrix4 } from "../src/stay/webgl2/math3D"
import { StandardMaterial } from "../src/stay/webgl2/material"
import { Mesh } from "../src/stay/webgl2/mesh"
import {
  reflectionCameraFrame,
  worldReflectionPlane,
} from "../src/stay/webgl2/planarReflection"
import { PerspectiveCamera } from "../src/stay/webgl2/perspectiveCamera"

const receiverGeometry = {
  positions: [-1, 0, -1, 1, 0, -1, 0, 0, 1],
  normals: [0, 1, 0, 0, 1, 0, 0, 1, 0],
  indices: [0, 1, 2],
}

describe("planar reflection math", () => {
  it("transforms the local plane with the receiver model", () => {
    const receiver = new Mesh({
      geometry: receiverGeometry,
      modelMatrix: copyMatrix4([
        2, 0, 0, 0,
        0, 3, 0, 0,
        0, 0, 4, 0,
        5, -2, 7, 1,
      ]),
      material: new StandardMaterial(),
      planarReflection: {
        localPlane: { point: [1, 0, -1], normal: [0, 2, 0] },
      },
    })
    const descriptor = receiver.getPlanarReflection()!

    expect(worldReflectionPlane(receiver, descriptor, [0, 4, 0])).toEqual({
      point: [7, -2, 3],
      normal: [0, 1, 0],
      cameraSide: 1,
    })
  })

  it("mirrors an asymmetric camera pose across the world plane", () => {
    const camera = new PerspectiveCamera({
      position: [2, 3, 5],
      target: [-1, 0.5, -2],
      up: [0, 1, 0],
      near: 0.1,
      far: 40,
    })
    const frame = reflectionCameraFrame(camera, {
      point: [0, 0, 0],
      normal: [0, 1, 0],
      cameraSide: 1,
    }, 16 / 9)

    expect(frame.position).toEqual([2, -3, 5])
    expect([...frame.view]).toEqual(expect.arrayContaining([
      expect.any(Number),
    ]))
    expect([...frame.viewProjection].every(Number.isFinite)).toBe(true)
    expect(frame.view[13]).toBeCloseTo(camera.getViewMatrix()[13])
  })
})

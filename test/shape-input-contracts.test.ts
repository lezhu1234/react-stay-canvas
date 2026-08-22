// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { Circle, StayImage } from "react-stay-canvas"
import { createStage } from "./helpers/stage"

function createLoadedImage(width: number, height: number) {
  const image = document.createElement("img")
  Object.defineProperties(image, {
    naturalWidth: { value: width },
    naturalHeight: { value: height },
  })
  return image
}

function createStayImage(
  image: HTMLImageElement,
  sourceSize: { swidth?: number; sheight?: number } = {}
) {
  return new StayImage({
    image,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    opacity: 1,
    ...sourceSize,
  })
}

describe("Circle hit testing", () => {
  it("accepts the plain coordinates supplied by the public hit path", () => {
    const { stage } = createStage()
    const circle = stage.tools.appendChild({
      className: "circle",
      shape: new Circle({ x: 20, y: 20, radius: 10 }),
    })

    expect(
      stage.tools.getContainPointChildren({
        point: { x: 23, y: 24 },
        selector: ".circle",
      })
    ).toEqual([circle])
    expect(
      stage.tools.getContainPointChildren({
        point: { x: 30, y: 20 },
        selector: ".circle",
      })
    ).toEqual([])
  })
})

describe("StayImage source crop", () => {
  it("uses natural dimensions only when crop dimensions are omitted", () => {
    const image = createLoadedImage(640, 480)

    expect(createStayImage(image)).toMatchObject({ swidth: 640, sheight: 480 })
    expect(createStayImage(image, { swidth: 320, sheight: 200 })).toMatchObject({
      swidth: 320,
      sheight: 200,
    })
  })

  it("preserves explicit crop dimensions when replacing the image", () => {
    const shape = createStayImage(createLoadedImage(640, 480))

    shape.update({
      image: createLoadedImage(800, 600),
      swidth: 400,
      sheight: 300,
    })

    expect(shape).toMatchObject({ swidth: 400, sheight: 300 })
  })

  it("copies explicit crop dimensions", () => {
    const shape = createStayImage(createLoadedImage(640, 480), {
      swidth: 320,
      sheight: 200,
    })

    expect(shape.copy()).toMatchObject({ swidth: 320, sheight: 200 })
  })
})

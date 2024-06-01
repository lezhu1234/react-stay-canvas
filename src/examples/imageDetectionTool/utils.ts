import * as TWEEN from "@tweenjs/tween.js"

import { Rectangle, RectangleAttr, ShapeDrawProps } from "../../shapes"
import { Dict } from "../../userTypes"
import coco from "./coco.json"

interface annotationProps {
  id: number
  imageId: number
  categoryId: number
  categoeyName: string
  bbox: [number, number, number, number]
}
interface imageProps {
  url: string
  width: number
  height: number
}

export interface RectLike {
  x: number
  y: number
  width: number
  height: number
}
export function parseCoco(): [
  Map<number, annotationProps[]>,
  Map<number, imageProps>,
  Map<number, string>
] {
  const categoryMap = new Map<number, string>()
  const imageMap = new Map<number, imageProps>()
  const annotationMap: Map<number, annotationProps[]> = new Map()

  coco.images.forEach((image) => {
    imageMap.set(image.id, {
      url: image.flickr_url,
      width: image.width,
      height: image.height,
    })
  })

  coco.categories.forEach((category) => {
    categoryMap.set(category.id, category.name)
  })

  coco.annotations.forEach((annotation) => {
    const { id, image_id, category_id, bbox } = annotation
    annotationMap.set(image_id, [
      ...(annotationMap.get(image_id) || []),
      {
        id,
        imageId: image_id,
        categoryId: category_id,
        categoeyName: categoryMap.get(category_id)!,
        bbox: [bbox[0], bbox[1], bbox[2], bbox[3]],
      },
    ])
  })

  return [annotationMap, imageMap, categoryMap]
}

export class SelectRectangle extends Rectangle {
  a: number
  constructor({ x, y, width, height, props = {} }: RectangleAttr) {
    const angle = { value: 0 }
    const tween = new TWEEN.Tween(angle)
      .dynamic(true)
      .repeat(Infinity)
      .to({ value: 2 * Math.PI }, 1000)
      .start()

    const stateDrawFuncMap: Dict<(props: ShapeDrawProps) => void> = {
      default: ({ canvas, context, now }) => {
        this.setColor(context, "white")
        this.draw({ context, canvas, now })
      },
      selected: ({ canvas, context, now }) => {
        tween.update()
        const centerX = this.x + this.width / 2
        const centerY = this.y + this.height / 2
        const gradient = context.createConicGradient(angle.value, centerX, centerY)
        gradient.addColorStop(0, "red")
        gradient.addColorStop(0.25, "orange")
        gradient.addColorStop(0.5, "yellow")
        gradient.addColorStop(0.75, "green")
        gradient.addColorStop(1, "blue")
        this.setColor(context, gradient)
        this.draw({ context, canvas, now })
      },
    }
    super({ x, y, width, height, props: { ...props, stateDrawFuncMap } })
    this.a = 1
  }

  copy(): SelectRectangle {
    return new SelectRectangle({
      ...this,
      props: this._copy(),
    })
  }

  worldToScreen(offsetX: number, offsetY: number, scaleRatio: number) {
    const rect = super.worldToScreen(offsetX, offsetY, scaleRatio)
    return new SelectRectangle({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    })
  }
}

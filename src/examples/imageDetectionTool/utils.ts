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

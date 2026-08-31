import { ImageTexture } from "./imageTexture"

export interface ImageTextureResources {
  readonly texture: WebGLTexture
}

function assertContextUpload(
  context: WebGL2RenderingContext,
  operation: string,
) {
  const error = context.getError()
  if (error === context.NO_ERROR) return
  if (error === context.CONTEXT_LOST_WEBGL || context.isContextLost()) {
    throw new Error("WebGL2 scene rendering cannot run while the context is lost")
  }
  throw new Error(`WebGL2 scene rendering failed during ${operation}: ${error}`)
}

function assertTextureSize(
  context: WebGL2RenderingContext,
  image: ImageTexture,
) {
  const maximum = context.getParameter(context.MAX_TEXTURE_SIZE) as number
  if (!Number.isFinite(maximum) || image.width > maximum || image.height > maximum) {
    throw new RangeError(
      `ImageTexture ${image.width}x${image.height} exceeds WebGL2 MAX_TEXTURE_SIZE ${maximum}`
    )
  }
}

export function createImageTextureResources(
  context: WebGL2RenderingContext,
  image: ImageTexture,
): ImageTextureResources {
  assertTextureSize(context, image)
  const texture = context.createTexture()
  if (!texture) throw new Error("Unable to create WebGL2 ImageTexture")
  try {
    const snapshot = image.copySnapshot()
    context.bindTexture(context.TEXTURE_2D, texture)
    context.texParameteri(
      context.TEXTURE_2D,
      context.TEXTURE_MIN_FILTER,
      context.LINEAR_MIPMAP_LINEAR,
    )
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE)
    context.texImage2D(
      context.TEXTURE_2D,
      0,
      context.SRGB8_ALPHA8,
      snapshot.width,
      snapshot.height,
      0,
      context.RGBA,
      context.UNSIGNED_BYTE,
      snapshot.data,
    )
    context.generateMipmap(context.TEXTURE_2D)
    assertContextUpload(context, "ImageTexture upload")
    return { texture }
  } catch (error) {
    context.deleteTexture(texture)
    throw error
  } finally {
    context.bindTexture(context.TEXTURE_2D, null)
  }
}

import type { EnvironmentMapImageSnapshot } from "./environmentMap"

export interface EnvironmentTextureResources {
  readonly texture: WebGLTexture
  imageRevision: number
  maxMipLevel: number
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
  image: EnvironmentMapImageSnapshot,
) {
  const maximum = context.getParameter(context.MAX_TEXTURE_SIZE) as number
  if (!Number.isFinite(maximum) || image.width > maximum || image.height > maximum) {
    throw new RangeError(
      `EnvironmentMap ${image.width}x${image.height} exceeds WebGL2 MAX_TEXTURE_SIZE ${maximum}`
    )
  }
}

export function uploadEnvironmentTexture(
  context: WebGL2RenderingContext,
  resources: EnvironmentTextureResources,
  image: EnvironmentMapImageSnapshot,
) {
  assertTextureSize(context, image)
  context.bindTexture(context.TEXTURE_2D, resources.texture)
  context.texImage2D(
    context.TEXTURE_2D,
    0,
    context.RGBA8,
    image.width,
    image.height,
    0,
    context.RGBA,
    context.UNSIGNED_BYTE,
    image.data,
  )
  context.generateMipmap(context.TEXTURE_2D)
  assertContextUpload(context, "EnvironmentMap upload")
  resources.imageRevision = image.revision
  resources.maxMipLevel = Math.floor(Math.log2(Math.max(image.width, image.height)))
}

export function createEnvironmentTextureResources(
  context: WebGL2RenderingContext,
  image: EnvironmentMapImageSnapshot,
): EnvironmentTextureResources {
  const texture = context.createTexture()
  if (!texture) throw new Error("Unable to create WebGL2 EnvironmentMap texture")
  const resources: EnvironmentTextureResources = {
    texture,
    imageRevision: -1,
    maxMipLevel: 0,
  }
  try {
    context.bindTexture(context.TEXTURE_2D, texture)
    context.texParameteri(
      context.TEXTURE_2D,
      context.TEXTURE_MIN_FILTER,
      context.LINEAR_MIPMAP_LINEAR,
    )
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.REPEAT)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE)
    uploadEnvironmentTexture(context, resources, image)
    return resources
  } catch (error) {
    context.deleteTexture(texture)
    throw error
  } finally {
    context.bindTexture(context.TEXTURE_2D, null)
  }
}

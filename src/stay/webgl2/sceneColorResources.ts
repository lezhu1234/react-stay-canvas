export interface SceneColorResources {
  readonly width: number
  readonly height: number
  readonly framebuffer: WebGLFramebuffer
  readonly texture: WebGLTexture
}

function assertFramebufferComplete(context: WebGL2RenderingContext) {
  if (context.checkFramebufferStatus(context.FRAMEBUFFER) !== context.FRAMEBUFFER_COMPLETE) {
    throw new Error("Unable to create complete WebGL2 scene-color framebuffer")
  }
}

function assertSceneColorReady(context: WebGL2RenderingContext) {
  const error = context.getError()
  if (error === context.NO_ERROR) return
  if (error === context.CONTEXT_LOST_WEBGL || context.isContextLost()) {
    throw new Error("WebGL2 scene rendering cannot run while the context is lost")
  }
  throw new Error(`WebGL2 scene rendering failed during scene-color creation: ${error}`)
}

/**
 * Stores a resolved copy of the default framebuffer for Glass refraction.
 * Geometry continues to render into the browser's negotiated framebuffer so
 * its antialiasing configuration remains authoritative.
 */
export function createSceneColorResources(
  context: WebGL2RenderingContext,
  width: number,
  height: number,
): SceneColorResources {
  const texture = context.createTexture()
  if (!texture) throw new Error("Unable to create WebGL2 scene-color texture")
  let framebuffer: WebGLFramebuffer | undefined
  try {
    context.bindTexture(context.TEXTURE_2D, texture)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE)
    context.texImage2D(
      context.TEXTURE_2D,
      0,
      context.RGBA8,
      width,
      height,
      0,
      context.RGBA,
      context.UNSIGNED_BYTE,
      null,
    )

    framebuffer = context.createFramebuffer() ?? undefined
    if (!framebuffer) throw new Error("Unable to create WebGL2 scene-color framebuffer")
    context.bindFramebuffer(context.FRAMEBUFFER, framebuffer)
    context.framebufferTexture2D(
      context.FRAMEBUFFER,
      context.COLOR_ATTACHMENT0,
      context.TEXTURE_2D,
      texture,
      0,
    )
    context.drawBuffers([context.COLOR_ATTACHMENT0])
    context.readBuffer(context.COLOR_ATTACHMENT0)
    assertFramebufferComplete(context)
    assertSceneColorReady(context)
    return { width, height, framebuffer, texture }
  } catch (error) {
    if (framebuffer) context.deleteFramebuffer(framebuffer)
    context.deleteTexture(texture)
    throw error
  } finally {
    context.bindTexture(context.TEXTURE_2D, null)
    context.bindFramebuffer(context.FRAMEBUFFER, null)
  }
}

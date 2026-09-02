export interface SceneTargetResources {
  readonly width: number
  readonly height: number
  readonly sampleCount: number
  readonly drawFramebuffer: WebGLFramebuffer
  readonly colorRenderbuffer: WebGLRenderbuffer
  readonly depthRenderbuffer: WebGLRenderbuffer
  readonly resolveFramebuffer: WebGLFramebuffer
  readonly resolveTexture: WebGLTexture
  readonly maxMipLevel: number
}

function assertFramebufferComplete(
  context: WebGL2RenderingContext,
  name: string,
) {
  if (context.checkFramebufferStatus(context.FRAMEBUFFER) !== context.FRAMEBUFFER_COMPLETE) {
    throw new Error(`Unable to create complete WebGL2 ${name} framebuffer`)
  }
}

function assertSceneTargetReady(context: WebGL2RenderingContext) {
  const error = context.getError()
  if (error === context.NO_ERROR) return
  if (error === context.CONTEXT_LOST_WEBGL || context.isContextLost()) {
    throw new Error("WebGL2 scene rendering cannot run while the context is lost")
  }
  throw new Error(`WebGL2 scene rendering failed during scene-target creation: ${error}`)
}

function supportedSampleCounts(
  context: WebGL2RenderingContext,
  internalFormat: number,
) {
  const values = context.getInternalformatParameter(
    context.RENDERBUFFER,
    internalFormat,
    context.SAMPLES,
  ) as Int32Array | number[] | null
  return new Set(Array.from(values ?? []).filter((value) => value > 0))
}

function sceneSampleCount(context: WebGL2RenderingContext) {
  context.bindFramebuffer(context.FRAMEBUFFER, null)
  const requested = context.getParameter(context.SAMPLES) as number
  if (!Number.isInteger(requested) || requested <= 0) return 0
  const color = supportedSampleCounts(context, context.RGBA8)
  const depth = supportedSampleCounts(context, context.DEPTH_COMPONENT24)
  const supported = [...color].filter((value) => depth.has(value) && value <= requested)
  return supported.length > 0 ? Math.max(...supported) : 0
}

function allocateRenderbuffer(
  context: WebGL2RenderingContext,
  internalFormat: number,
  width: number,
  height: number,
  sampleCount: number,
) {
  if (sampleCount > 0) {
    context.renderbufferStorageMultisample(
      context.RENDERBUFFER,
      sampleCount,
      internalFormat,
      width,
      height,
    )
    return
  }
  context.renderbufferStorage(context.RENDERBUFFER, internalFormat, width, height)
}

export function createSceneTargetResources(
  context: WebGL2RenderingContext,
  width: number,
  height: number,
): SceneTargetResources {
  const sampleCount = sceneSampleCount(context)
  const colorRenderbuffer = context.createRenderbuffer()
  if (!colorRenderbuffer) throw new Error("Unable to create WebGL2 scene color renderbuffer")
  let depthRenderbuffer: WebGLRenderbuffer | undefined
  let drawFramebuffer: WebGLFramebuffer | undefined
  let resolveTexture: WebGLTexture | undefined
  let resolveFramebuffer: WebGLFramebuffer | undefined
  try {
    context.bindRenderbuffer(context.RENDERBUFFER, colorRenderbuffer)
    allocateRenderbuffer(context, context.RGBA8, width, height, sampleCount)

    depthRenderbuffer = context.createRenderbuffer() ?? undefined
    if (!depthRenderbuffer) throw new Error("Unable to create WebGL2 scene depth renderbuffer")
    context.bindRenderbuffer(context.RENDERBUFFER, depthRenderbuffer)
    allocateRenderbuffer(context, context.DEPTH_COMPONENT24, width, height, sampleCount)

    drawFramebuffer = context.createFramebuffer() ?? undefined
    if (!drawFramebuffer) throw new Error("Unable to create WebGL2 scene draw framebuffer")
    context.bindFramebuffer(context.FRAMEBUFFER, drawFramebuffer)
    context.framebufferRenderbuffer(
      context.FRAMEBUFFER,
      context.COLOR_ATTACHMENT0,
      context.RENDERBUFFER,
      colorRenderbuffer,
    )
    context.framebufferRenderbuffer(
      context.FRAMEBUFFER,
      context.DEPTH_ATTACHMENT,
      context.RENDERBUFFER,
      depthRenderbuffer,
    )
    context.drawBuffers([context.COLOR_ATTACHMENT0])
    context.readBuffer(context.COLOR_ATTACHMENT0)
    assertFramebufferComplete(context, "scene draw")

    resolveTexture = context.createTexture() ?? undefined
    if (!resolveTexture) throw new Error("Unable to create WebGL2 scene resolve texture")
    context.bindTexture(context.TEXTURE_2D, resolveTexture)
    context.texParameteri(
      context.TEXTURE_2D,
      context.TEXTURE_MIN_FILTER,
      context.LINEAR,
    )
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

    resolveFramebuffer = context.createFramebuffer() ?? undefined
    if (!resolveFramebuffer) throw new Error("Unable to create WebGL2 scene resolve framebuffer")
    context.bindFramebuffer(context.FRAMEBUFFER, resolveFramebuffer)
    context.framebufferTexture2D(
      context.FRAMEBUFFER,
      context.COLOR_ATTACHMENT0,
      context.TEXTURE_2D,
      resolveTexture,
      0,
    )
    context.drawBuffers([context.COLOR_ATTACHMENT0])
    context.readBuffer(context.COLOR_ATTACHMENT0)
    assertFramebufferComplete(context, "scene resolve")
    assertSceneTargetReady(context)
    return {
      width,
      height,
      sampleCount,
      drawFramebuffer,
      colorRenderbuffer,
      depthRenderbuffer,
      resolveFramebuffer,
      resolveTexture,
      maxMipLevel: Math.floor(Math.log2(Math.max(width, height))),
    }
  } catch (error) {
    if (resolveFramebuffer) context.deleteFramebuffer(resolveFramebuffer)
    if (resolveTexture) context.deleteTexture(resolveTexture)
    if (drawFramebuffer) context.deleteFramebuffer(drawFramebuffer)
    if (depthRenderbuffer) context.deleteRenderbuffer(depthRenderbuffer)
    context.deleteRenderbuffer(colorRenderbuffer)
    throw error
  } finally {
    context.bindTexture(context.TEXTURE_2D, null)
    context.bindRenderbuffer(context.RENDERBUFFER, null)
    context.bindFramebuffer(context.FRAMEBUFFER, null)
  }
}

export function deleteSceneTargetResources(
  context: WebGL2RenderingContext,
  resources: SceneTargetResources,
) {
  context.deleteFramebuffer(resources.resolveFramebuffer)
  context.deleteTexture(resources.resolveTexture)
  context.deleteFramebuffer(resources.drawFramebuffer)
  context.deleteRenderbuffer(resources.depthRenderbuffer)
  context.deleteRenderbuffer(resources.colorRenderbuffer)
}

export function resolveSceneTarget(
  context: WebGL2RenderingContext,
  resources: SceneTargetResources,
  generateMipmaps: boolean,
) {
  context.bindFramebuffer(context.READ_FRAMEBUFFER, resources.drawFramebuffer)
  context.bindFramebuffer(context.DRAW_FRAMEBUFFER, resources.resolveFramebuffer)
  context.blitFramebuffer(
    0,
    0,
    resources.width,
    resources.height,
    0,
    0,
    resources.width,
    resources.height,
    context.COLOR_BUFFER_BIT,
    context.NEAREST,
  )
  context.activeTexture(context.TEXTURE1)
  context.bindTexture(context.TEXTURE_2D, resources.resolveTexture)
  context.texParameteri(
    context.TEXTURE_2D,
    context.TEXTURE_MIN_FILTER,
    generateMipmaps ? context.LINEAR_MIPMAP_LINEAR : context.LINEAR,
  )
  if (generateMipmaps) context.generateMipmap(context.TEXTURE_2D)
}

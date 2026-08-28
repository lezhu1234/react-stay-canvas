// Layer runtime ownership remains internal until a public backend contract exists.
// @ts-expect-error Canvas2DLayerRuntime is intentionally not exported by the package.
import { Canvas2DLayerRuntime } from "react-stay-canvas"
// @ts-expect-error Unowned context cleanup is an internal Canvas compatibility path.
import { clearUnownedCanvas2DContext } from "react-stay-canvas"
// @ts-expect-error WebGLLayerRuntime is an internal backend owner.
import { WebGLLayerRuntime } from "react-stay-canvas"

export const internalCanvas2DLayerRuntime = Canvas2DLayerRuntime
export const internalCanvas2DClear = clearUnownedCanvas2DContext
export const internalWebGLLayerRuntime = WebGLLayerRuntime

import type { ChildIdentity, ChildLayerRuntime } from "../children/runtimeContracts"

export class ChildLayerScheduler<TChild extends ChildIdentity> {
  constructor(private readonly runtime: ChildLayerRuntime<TChild>) {}

  collectDirtyLayers(children: readonly TChild[], dirtyLayers: boolean[]) {
    children.forEach((child) => {
      this.runtime.dirtyLayers(child).forEach((layerIndex) => {
        dirtyLayers[layerIndex] = true
      })
    })
  }

  acknowledgeLayer(children: readonly TChild[], layerIndex: number) {
    children.forEach((child) => this.runtime.drawn(child, layerIndex))
  }
}

import type { ContentPoint } from "../../types/coordinates"

/** The identity understood by the shared child store and selector engine. */
export interface ChildIdentity {
  readonly id: string
  readonly className: string
}

/** Backend-owned layer invalidation exposed to the shared render scheduler. */
export interface ChildLayerRuntime<TChild extends ChildIdentity> {
  dirtyLayers(child: TChild): ReadonlySet<number>
  drawn(child: TChild, layerIndex: number): void
  occupiedLayers(child: TChild): ReadonlySet<number>
}

/** Backend-owned point hit testing used by pointer target resolution. */
export interface ChildPointHitRuntime<TChild extends ChildIdentity> {
  contains(child: TChild, point: ContentPoint): boolean
}

/** Backend-owned history participation and snapshot capture. */
export interface ChildHistoryRuntime<
  TChild extends ChildIdentity,
  TSnapshot,
> {
  participates(child: TChild): boolean
  capture(child: TChild): TSnapshot
}

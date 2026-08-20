import type { Coordinate } from "../../types/geometry"

type Store = Map<string, any>

const CLICK_PAIRING_KEY = "pointerClickPairing"

export type ClickPairing = {
  sessionId: number
  initiatingButton: number
  point: Coordinate
  startedAt: number
}

export function beginClickPairing(store: Store, pairing: ClickPairing) {
  store.set(CLICK_PAIRING_KEY, pairing)
}

export function getClickPairing(store: Store): ClickPairing | undefined {
  return store.get(CLICK_PAIRING_KEY)
}

export function clearClickPairing(store: Store, sessionId?: number) {
  const pairing = getClickPairing(store)
  if (!pairing) return
  if (sessionId !== undefined && pairing.sessionId !== sessionId) return
  store.delete(CLICK_PAIRING_KEY)
}

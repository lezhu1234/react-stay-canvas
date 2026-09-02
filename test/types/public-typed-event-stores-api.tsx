import {
  StayCanvas,
  type ContentPoint,
  type EventProps,
  type ListenerProps,
  type StayCanvasProps,
  type StayStore,
  type storeType,
} from "react-stay-canvas"

interface PersistentStore {
  selectedId: string
  selection: Set<string>
}

interface ModeStore {
  dragOrigin: ContentPoint
}

interface SelectListener {
  name: "select-item"
  payload: { id: string }
}

interface DragComposeStore {
  started: boolean
}

declare const store: StayStore<PersistentStore>
const selectedId: string | undefined = store.get("selectedId")
store.set("selection", new Set(["node-a"]))
store.has("selectedId")

// @ts-expect-error Unknown keys are rejected by a typed store.
store.get("selected")
// @ts-expect-error Each known key keeps its own value type.
store.set("selectedId", new Set<string>())

const event: EventProps<"drag", PersistentStore, ModeStore> = {
  name: "drag",
  trigger: "mousemove",
  conditionCallback: ({ store, stateStore }) => {
    const selection = store.get("selection")
    const origin = stateStore.get("dragOrigin")
    return Boolean(selection?.size && origin)
  },
}

const listener: ListenerProps<
  SelectListener,
  "drag",
  DragComposeStore,
  PersistentStore,
  ModeStore
> = {
  name: "select-item",
  event: "drag",
  callback: ({ payload, store, stateStore, composeStore }) => {
    store.set("selectedId", payload.id)
    stateStore.set("dragOrigin", { x: 10, y: 20 } as ContentPoint)
    const started: boolean = composeStore.started
    void started
  },
}

const props: StayCanvasProps<
  "drag",
  unknown,
  PersistentStore,
  ModeStore
> = {
  eventList: [event],
  listenerList: [listener],
}

const contextualEventProps: StayCanvasProps<
  "drag",
  unknown,
  PersistentStore,
  ModeStore
> = {
  eventList: [{
    name: "drag",
    trigger: "mousemove",
    conditionCallback: ({ store }) => {
      const selection: Set<string> | undefined = store.get("selection")
      // @ts-expect-error Contextual callbacks reject unknown persistent keys.
      store.get("selections")
      return Boolean(selection)
    },
  }],
}

const legacyListener: ListenerProps = {
  name: "legacy",
  event: "custom",
  callback: ({ store, stateStore }) => {
    store.set("untyped", 42)
    stateStore.set("anything", { remains: "compatible" })
  },
}

const canvas = (
  <StayCanvas<"drag", unknown, PersistentStore, ModeStore> {...props} />
)

const legacyStore: storeType = new Map<string, any>()
legacyStore.set("anything", 42)

void selectedId
void canvas
void contextualEventProps
void legacyListener

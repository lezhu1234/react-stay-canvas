import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  type Coordinate,
  type Cursor,
  type ListenerProps,
  Rectangle,
  StayCanvas,
  StayImage,
  type StayInstantChild,
  StayText,
  type StayTools,
} from "react-stay-canvas"

import {
  Button,
  colors,
  ResetButton,
  rgba,
} from "../../components/DemoKit"
import annotationImageUrl from "../../assets/annotation-traffic.jpg"
import { useI18n } from "../../i18n"
import { hasPointerPosition } from "../actionEventGuards"

type BoxChild = StayInstantChild<Rectangle | StayText>
type Handle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw"
export type AnnotatorEngine = {
  selected: Set<string>
  sequence: number
  changed: () => void
  say: (english: string, chinese: string) => void
  save: () => void
  import: () => void
}

const SOURCE_WIDTH = 1100
const SOURCE_HEIGHT = 733
const HANDLE_SIZE = 12
const MIN_SIZE = 12
const HANDLE_ORDER: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]
const boxOf = (child: BoxChild) => child.shapeMap.get("0") as Rectangle
const labelOf = (child: BoxChild) => child.shapeMap.get("1") as StayText
const handlesOf = (child: BoxChild) => HANDLE_ORDER.map((handle, index) => ({
  handle,
  shape: child.shapeMap.get(String(index + 2)) as Rectangle,
}))
const annotations = (tools: StayTools) =>
  tools.getChildrenBySelector<Rectangle | StayText>(".annotation") as BoxChild[]
const imageBound = (tools: StayTools) =>
  tools.getChildBySelector<StayImage>(".background-image")?.shape.getBound() ??
  tools.getChildBySelector<Rectangle>(".stay-canvas")?.shape.getBound() ?? {
    x: 0,
    y: 0,
    width: SOURCE_WIDTH,
    height: SOURCE_HEIGHT,
  }

const hitBox = (tools: StayTools, point: Coordinate) => annotations(tools)
  .filter((child) => boxOf(child).contains(point))
  .sort((a, b) => boxOf(a).area - boxOf(b).area)[0]

function handleCenters(shape: Rectangle): Record<Handle, Coordinate> {
  const left = shape.x
  const centerX = shape.x + shape.width / 2
  const right = shape.x + shape.width
  const top = shape.y
  const centerY = shape.y + shape.height / 2
  const bottom = shape.y + shape.height
  return {
    nw: { x: left, y: top }, n: { x: centerX, y: top }, ne: { x: right, y: top },
    e: { x: right, y: centerY }, se: { x: right, y: bottom },
    s: { x: centerX, y: bottom }, sw: { x: left, y: bottom },
    w: { x: left, y: centerY },
  }
}

function syncHandles(child: BoxChild) {
  const centers = handleCenters(boxOf(child))
  handlesOf(child).forEach(({ handle, shape }) => {
    const center = centers[handle]
    shape.update({
      x: center.x - HANDLE_SIZE / 2,
      y: center.y - HANDLE_SIZE / 2,
      width: HANDLE_SIZE,
      height: HANDLE_SIZE,
    })
  })
}

function resizeAxis(
  start: number,
  size: number,
  boundStart: number,
  boundSize: number,
  moveStart: boolean,
  moveEnd: boolean,
  pointer: number,
) {
  const minimum = Math.min(MIN_SIZE, boundSize)
  const boundEnd = boundStart + boundSize
  let low = start
  let high = start + size
  if (moveStart) {
    low = Math.max(boundStart, Math.min(pointer, high - minimum))
    high = Math.min(boundEnd, Math.max(high, low + minimum))
  }
  if (moveEnd) {
    high = Math.min(boundEnd, Math.max(pointer, low + minimum))
    low = Math.max(boundStart, Math.min(low, high - minimum))
  }
  return { start: low, size: high - low }
}

function resize(
  shape: Rectangle,
  origin: Rectangle,
  handle: Handle,
  point: Coordinate,
  bound: ReturnType<typeof imageBound>,
) {
  const horizontal = resizeAxis(
    origin.x,
    origin.width,
    bound.x,
    bound.width,
    handle.includes("w"),
    handle.includes("e"),
    point.x,
  )
  const vertical = resizeAxis(
    origin.y,
    origin.height,
    bound.y,
    bound.height,
    handle.includes("n"),
    handle.includes("s"),
    point.y,
  )
  shape.update({
    x: horizontal.start,
    y: vertical.start,
    width: horizontal.size,
    height: vertical.size,
  })
}

function boxBetween(
  start: Coordinate,
  end: Coordinate,
  bound: ReturnType<typeof imageBound>,
) {
  const width = Math.min(bound.width, Math.max(MIN_SIZE, Math.abs(end.x - start.x)))
  const height = Math.min(bound.height, Math.max(MIN_SIZE, Math.abs(end.y - start.y)))
  const intendedX = end.x < start.x ? start.x - width : start.x
  const intendedY = end.y < start.y ? start.y - height : start.y
  return {
    x: Math.max(bound.x, Math.min(intendedX, bound.x + bound.width - width)),
    y: Math.max(bound.y, Math.min(intendedY, bound.y + bound.height - height)),
    width,
    height,
  }
}

function clampPoint(point: Coordinate, bound: ReturnType<typeof imageBound>) {
  return {
    x: Math.max(bound.x, Math.min(point.x, bound.x + bound.width)),
    y: Math.max(bound.y, Math.min(point.y, bound.y + bound.height)),
  }
}

function containsPoint(bound: ReturnType<typeof imageBound>, point: Coordinate) {
  return point.x >= bound.x &&
    point.x <= bound.x + bound.width &&
    point.y >= bound.y &&
    point.y <= bound.y + bound.height
}

function moveLimits(tools: StayTools, ids: string[]) {
  const boxes = ids
    .map((id) => tools.getChildById<Rectangle | StayText>(id) as BoxChild | undefined)
    .filter((child): child is BoxChild => Boolean(child))
    .map(boxOf)
  const bound = imageBound(tools)
  return {
    minX: bound.x - Math.min(...boxes.map((box) => box.x)),
    maxX: bound.x + bound.width - Math.max(...boxes.map((box) => box.x + box.width)),
    minY: bound.y - Math.min(...boxes.map((box) => box.y)),
    maxY: bound.y + bound.height - Math.max(...boxes.map((box) => box.y + box.height)),
  }
}

function addBox(
  tools: StayTools,
  engine: AnnotatorEngine,
  rect: { x: number; y: number; width: number; height: number },
) {
  const number = ++engine.sequence
  const transparent = rgba(0, 0, 0, 0)
  const child = tools.appendChild<Rectangle | StayText>({
    id: `annotation-${number}`,
    className: "annotation",
    shape: [
      new Rectangle({
        ...rect,
        layer: 1,
        fillConfig: { color: colors.orangeSoft },
        strokeConfig: { color: colors.orange, lineWidth: 3 },
      }),
      new StayText({
        x: rect.x + 8,
        y: rect.y + 16,
        text: `#${number}`,
        layer: 1,
        zIndex: 2,
        font: { size: 12, fontWeight: 700 },
        fillConfig: { color: colors.ink },
      }),
      ...HANDLE_ORDER.map(() => new Rectangle({
        x: rect.x,
        y: rect.y,
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
        layer: 1,
        zIndex: 3,
        fillConfig: { color: transparent },
        strokeConfig: { color: transparent, lineWidth: 2 },
      })),
    ],
  }) as BoxChild
  syncHandles(child)
  return child
}

function paintSelection(tools: StayTools, selected: Set<string>) {
  annotations(tools).forEach((child) => {
    const active = selected.has(child.id)
    boxOf(child).update({
      strokeConfig: {
        color: active ? colors.blue : colors.orange,
        lineWidth: active ? 5 : 3,
      },
    })
    handlesOf(child).forEach(({ shape }) => shape.update({
      fillConfig: { color: active ? colors.paper : rgba(0, 0, 0, 0) },
      strokeConfig: {
        color: active ? colors.blue : rgba(0, 0, 0, 0),
        lineWidth: 2,
      },
    }))
  })
}

function select(
  tools: StayTools,
  engine: AnnotatorEngine,
  child?: BoxChild,
  additive = false,
) {
  if (!additive) engine.selected.clear()
  if (child) {
    if (additive && engine.selected.has(child.id)) engine.selected.delete(child.id)
    else engine.selected.add(child.id)
  }
  paintSelection(tools, engine.selected)
  engine.changed()
}

function commit(tools: StayTools, engine: AnnotatorEngine) {
  paintSelection(tools, new Set())
  tools.log()
  paintSelection(tools, engine.selected)
  engine.changed()
}

function selectedHandle(tools: StayTools, engine: AnnotatorEngine, point: Coordinate) {
  const children = annotations(tools)
    .filter((child) => engine.selected.has(child.id))
    .sort((a, b) => boxOf(a).area - boxOf(b).area)
  for (const child of children) {
    const box = boxOf(child)
    const insetX = Math.min(HANDLE_SIZE / 2, box.width / 3)
    const insetY = Math.min(HANDLE_SIZE / 2, box.height / 3)
    const inMoveZone =
      point.x >= box.x + insetX &&
      point.x <= box.x + box.width - insetX &&
      point.y >= box.y + insetY &&
      point.y <= box.y + box.height - insetY
    if (inMoveZone) return
    const match = handlesOf(child)
      .filter(({ shape }) => shape.contains(point))
      .sort((a, b) => {
        const aCenter = a.shape.getCenterPoint()
        const bCenter = b.shape.getCenterPoint()
        const aDistance = (aCenter.x - point.x) ** 2 + (aCenter.y - point.y) ** 2
        const bDistance = (bCenter.x - point.x) ** 2 + (bCenter.y - point.y) ** 2
        return aDistance - bDistance
      })[0]
    if (match) return { child, handle: match.handle }
  }
}

function snapshotBoxes(tools: StayTools, ids: string[]) {
  return new Map(ids.flatMap((id) => {
    const child = tools.getChildById<Rectangle | StayText>(id) as BoxChild | undefined
    if (!child) return []
    return [[id, [...child.shapeMap.values()].map((shape) => shape.copy())]]
  }))
}

function cancelGesture(
  tools: StayTools,
  engine: AnnotatorEngine,
  session: Record<string, any>,
) {
  if (session.kind === "draw" && session.child) tools.removeChild(session.child.id)
  session.origins?.forEach((shapes: Array<Rectangle | StayText>, id: string) => {
    const child = tools.getChildById<Rectangle | StayText>(id)
    child?.update({ shape: shapes })
  })
  engine.selected.clear()
  session.selected?.forEach((id: string) => engine.selected.add(id))
  paintSelection(tools, engine.selected)
  engine.changed()
}

const cursors: Record<Handle, Cursor> = {
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
  nw: "nwse-resize",
}

function runShortcut(
  engine: AnnotatorEngine,
  tools: StayTools,
  key: string,
  redo: boolean,
) {
  if (key === "s") engine.save()
  else if (key === "i") engine.import()
  else if (key === "z") {
    navigateWorkspaceHistory(tools, engine, redo ? "redo" : "undo")
    engine.say(redo ? "Redo" : "Undo", redo ? "重做" : "撤销")
  } else return false
  return true
}

export function navigateWorkspaceHistory(
  tools: StayTools,
  engine: AnnotatorEngine,
  direction: "undo" | "redo",
) {
  select(tools, engine)
  tools[direction]()
  engine.changed()
}

export function bindWorkspaceShortcuts(
  engine: AnnotatorEngine,
  getTools: () => StayTools | undefined,
) {
  const listener = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLCanvasElement) return
    if (!event.metaKey && !event.ctrlKey) return
    const tools = getTools()
    if (tools && runShortcut(engine, tools, event.key.toLowerCase(), event.shiftKey)) {
      event.preventDefault()
    }
  }
  window.addEventListener("keydown", listener)
  return () => window.removeEventListener("keydown", listener)
}

export function createAnnotatorListeners(engine: AnnotatorEngine): ListenerProps[] {
  return [
    {
      name: "annotate",
      selector: ".stay-canvas",
      event: ["drag", "dragend"],
      callback: ({ e, composeStore, store, tools }) => {
        if (e.name === "drag" && !hasPointerPosition(e)) return
        return {
          drag: () => {
            if (!hasPointerPosition(e)) return composeStore
            let session = composeStore
            if (!session.kind) {
              const start = store.get("dragStartPosition") as Coordinate
              const selected = [...engine.selected]
              const edge = selectedHandle(tools, engine, start)
              const target = hitBox(tools, start)
              const invalidStart = !containsPoint(imageBound(tools), start)
              if (invalidStart || e.pressedKeys.has("Meta") || e.pressedKeys.has("Control")) {
                session = { kind: "idle", selected, start }
              } else if (edge) {
                session = {
                  kind: "resize",
                  id: edge.child.id,
                  handle: edge.handle,
                  origin: boxOf(edge.child).copy(),
                  origins: snapshotBoxes(tools, [edge.child.id]),
                  selected,
                }
              } else if (target && engine.selected.has(target.id)) {
                const ids = [...engine.selected]
                const origins = snapshotBoxes(tools, ids)
                ids.forEach((id) => tools.getChildById(id)?.moveInit())
                session = {
                  kind: "move",
                  ids,
                  start,
                  limits: moveLimits(tools, ids),
                  origins,
                  selected,
                }
              } else {
                select(tools, engine)
                session = { kind: "draw", start, selected }
              }
            }
            if (session.kind === "move") {
              const point = e.point
              const offsetX = Math.max(
                session.limits.minX,
                Math.min(point.x - session.start.x, session.limits.maxX),
              )
              const offsetY = Math.max(
                session.limits.minY,
                Math.min(point.y - session.start.y, session.limits.maxY),
              )
              session.ids.forEach((id: string) => {
                tools.getChildById(id)?.move(offsetX, offsetY)
              })
              return session
            }
            if (session.kind === "resize") {
              const child = tools.getChildById<Rectangle | StayText>(session.id) as
                | BoxChild
                | undefined
              if (!child) return session
              const bound = imageBound(tools)
              resize(
                boxOf(child),
                session.origin,
                session.handle,
                clampPoint(e.point, bound),
                bound,
              )
              labelOf(child).update({ x: boxOf(child).x + 8, y: boxOf(child).y + 16 })
              syncHandles(child)
              return session
            }
            if (session.kind !== "draw") return session
            const point = e.point
            const child = session.child ?? addBox(tools, engine, {
              x: point.x,
              y: point.y,
              width: MIN_SIZE,
              height: MIN_SIZE,
            })
            const bound = imageBound(tools)
            const rect = boxBetween(session.start, clampPoint(point, bound), bound)
            boxOf(child).update(rect)
            labelOf(child).update({ x: rect.x + 8, y: rect.y + 16 })
            syncHandles(child)
            return { ...session, child }
          },
          dragend: () => {
            if (!composeStore.kind || composeStore.kind === "idle") {
              return { kind: undefined, child: undefined }
            }
            if (e.cancelled) {
              cancelGesture(tools, engine, composeStore)
              engine.say("Change cancelled", "已取消更改")
              return { kind: undefined, child: undefined }
            }
            if (composeStore.child) select(tools, engine, composeStore.child)
            commit(tools, engine)
            const created = composeStore.kind === "draw"
            engine.say(
              created ? "Annotation created" : "Annotation updated",
              created ? "已创建标注" : "已更新标注",
            )
            return { kind: undefined, child: undefined }
          },
        }
      },
    },
    {
      name: "select",
      selector: ".stay-canvas",
      event: "click",
      callback: ({ e, tools }) => {
        if (!hasPointerPosition(e)) return
        const target = hitBox(tools, e.point)
        const additive = Boolean(
          target && (e.pressedKeys.has("Meta") || e.pressedKeys.has("Control")),
        )
        select(tools, engine, target, additive)
        engine.say(
          target ? "Selection changed" : "Selection cleared",
          target ? "已更新选择" : "已取消选择",
        )
      },
    },
    {
      name: "cursor",
      selector: ".stay-canvas",
      event: ["mousemove", "mouseleave"],
      callback: ({ e, tools }) => {
        if (e.name === "mouseleave" || !hasPointerPosition(e)) {
          tools.changeCursor("crosshair")
          return
        }
        const point = e.point
        const edge = selectedHandle(tools, engine, point)
        const target = hitBox(tools, point)
        const cursor = edge?.handle
          ? cursors[edge.handle]
          : target && engine.selected.has(target.id) ? "move" : "crosshair"
        tools.changeCursor(cursor)
      },
    },
    {
      name: "shortcuts", event: "keydown",
      callback: ({ e, originEvent, tools }) => {
        const modifier = e.pressedKeys.has("Meta") || e.pressedKeys.has("Control")
        const key = e.key?.toLowerCase() ?? ""
        if (!modifier) return
        const handled = runShortcut(engine, tools, key, e.pressedKeys.has("Shift"))
        if (handled) originEvent.preventDefault()
      },
    },
  ]
}

export function toCoco(tools: StayTools) {
  const image = tools.getChildBySelector<StayImage>(".background-image")?.shape
  const origin = image?.getBound() ?? imageBound(tools)
  const scaleX = SOURCE_WIDTH / origin.width
  const scaleY = SOURCE_HEIGHT / origin.height
  return {
    images: [{
      id: 1,
      file_name: "annotation-traffic.jpg",
      width: SOURCE_WIDTH,
      height: SOURCE_HEIGHT,
    }],
    annotations: annotations(tools).map((child, index) => {
      const box = boxOf(child)
      const bbox = [
        (box.x - origin.x) * scaleX,
        (box.y - origin.y) * scaleY,
        box.width * scaleX,
        box.height * scaleY,
      ]
      return {
        id: index + 1,
        image_id: 1,
        category_id: 1,
        bbox,
        area: bbox[2] * bbox[3],
        iscrowd: 0,
      }
    }),
    categories: [{ id: 1, name: "vehicle", supercategory: "object" }],
  }
}

export function replaceAnnotationsFromCoco(
  tools: StayTools,
  engine: AnnotatorEngine,
  data: unknown,
) {
  const source = data as { annotations?: unknown }
  if (!source || !Array.isArray(source.annotations)) {
    throw new Error("COCO annotations must be an array")
  }
  const origin = imageBound(tools)
  const boxes = source.annotations.map((item) => {
    const bbox = (item as { bbox?: unknown })?.bbox
    const box = Array.isArray(bbox) ? bbox : []
    const valid =
      box.length === 4 &&
      box.every((value) => typeof value === "number" && Number.isFinite(value)) &&
      box[0] >= 0 &&
      box[1] >= 0 &&
      box[2] > 0 &&
      box[3] > 0 &&
      box[0] + box[2] <= SOURCE_WIDTH &&
      box[1] + box[3] <= SOURCE_HEIGHT
    if (!valid) throw new Error("COCO annotation has an invalid bbox")
    return box as number[]
  })
  select(tools, engine)
  annotations(tools).forEach((child) => tools.removeChild(child.id))
  const scaleX = origin.width / SOURCE_WIDTH
  const scaleY = origin.height / SOURCE_HEIGHT
  boxes.forEach(([x, y, width, height]) => {
    addBox(tools, engine, {
      x: x * scaleX + origin.x,
      y: y * scaleY + origin.y,
      width: width * scaleX,
      height: height * scaleY,
    })
  })
  commit(tools, engine)
  return boxes.length
}

export function fitCanvasToHost(width: number, height: number) {
  const scale = Math.min(width / SOURCE_WIDTH, height / SOURCE_HEIGHT)
  return {
    width: Math.max(1, Math.floor(SOURCE_WIDTH * scale)),
    height: Math.max(1, Math.floor(SOURCE_HEIGHT * scale)),
  }
}

export function observeFittedCanvas(
  host: HTMLDivElement,
  onSize: (size: { width: number; height: number }) => void,
) {
  let frame = 0
  const measure = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      if (host.clientWidth > 0 && host.clientHeight > 0) {
        onSize(fitCanvasToHost(host.clientWidth, host.clientHeight))
      }
    })
  }
  const observer = typeof ResizeObserver === "function"
    ? new ResizeObserver(measure)
    : undefined
  observer?.observe(host)
  if (!observer) window.addEventListener("resize", measure)
  measure()
  return () => {
    cancelAnimationFrame(frame)
    observer?.disconnect()
    if (!observer) window.removeEventListener("resize", measure)
  }
}

function useFittedCanvas(hostRef: RefObject<HTMLDivElement>) {
  const [size, setSize] = useState<{ width: number; height: number }>()

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    return observeFittedCanvas(host, (next) => setSize((current) =>
      current?.width === next.width && current.height === next.height ? current : next,
    ))
  }, [hostRef])

  return size
}

export default function AnnotatorExample() {
  const { text } = useI18n()
  const toolsRef = useRef<StayTools>()
  const inputRef = useRef<HTMLInputElement>(null)
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const canvasSize = useFittedCanvas(canvasHostRef)
  const [summary, setSummary] = useState({ count: 0, selected: 0 })
  const [entries, setEntries] = useState<string[]>([])
  const engineRef = useRef<AnnotatorEngine>({
    selected: new Set(),
    sequence: 0,
    changed: () => {},
    say: () => {},
    save: () => {},
    import: () => {},
  })
  const engine = engineRef.current
  engine.changed = () => setSummary({
    count: toolsRef.current ? annotations(toolsRef.current).length : 0,
    selected: engine.selected.size,
  })
  engine.say = (english, chinese) => {
    setEntries((current) => [text(english, chinese), ...current].slice(0, 6))
  }
  engine.import = () => inputRef.current?.click()
  engine.save = () => {
    if (!toolsRef.current) return
    const contents = JSON.stringify(toCoco(toolsRef.current), null, 2)
    const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }))
    const link = Object.assign(document.createElement("a"), {
      href: url,
      download: "annotations.coco.json",
    })
    link.click()
    URL.revokeObjectURL(url)
    engine.say("COCO JSON saved", "COCO JSON 已保存")
  }
  const listeners = useMemo(() => createAnnotatorListeners(engine), [engine])
  useEffect(() => bindWorkspaceShortcuts(engine, () => toolsRef.current), [engine])

  const mounted = (tools: StayTools) => {
    toolsRef.current = tools
    tools.changeCursor("crosshair")
    const image = new Image()
    image.onload = () => {
      tools.appendChild({
        className: "background-image",
        shape: new StayImage({
          image,
          x: 0,
          y: 0,
          width: SOURCE_WIDTH,
          height: SOURCE_HEIGHT,
          opacity: 1,
          layer: 0,
        }),
      })
      const seed = (x: number, y: number, width: number, height: number) =>
        addBox(tools, engine, { x, y, width, height })
      seed(138, 548, 236, 168)
      seed(466, 572, 112, 82)
      seed(870, 516, 106, 76)
      seed(442, 396, 84, 162)
      tools.resetHistory()
      engine.changed()
      engine.say("Workspace ready", "工作区已就绪")
    }
    image.src = annotationImageUrl
  }

  const importCoco = async (file?: File) => {
    const tools = toolsRef.current
    if (!tools || !file) return
    try {
      const data = JSON.parse(await file.text())
      const count = replaceAnnotationsFromCoco(tools, engine, data)
      engine.say(`Imported ${count} annotations`, `已导入 ${count} 个标注`)
    } catch {
      engine.say("Invalid COCO JSON", "COCO JSON 无效")
    }
  }

  const removeSelected = () => {
    const tools = toolsRef.current
    if (!tools) return
    engine.selected.forEach((id) => tools.removeChild(id))
    engine.selected.clear()
    commit(tools, engine)
    engine.say("Selection deleted", "已删除所选标注")
  }

  const navigateHistory = (direction: "undo" | "redo") => {
    const tools = toolsRef.current
    if (!tools) return
    navigateWorkspaceHistory(tools, engine, direction)
  }

  return (
    <div className="annotator-workspace">
      <section className="annotator-stage">
        <header className="annotator-stage-header">
          <div>
            <h2>{text("Traffic annotation", "道路交通标注")}</h2>
            <p>{text("Drag to draw. Select a box to move it or use its eight handles.", "拖拽绘制。选中标注框后可移动，或使用八个手柄缩放。")}</p>
          </div>
          <span>{canvasSize ? `${canvasSize.width} × ${canvasSize.height}` : text("Fitting image", "正在适配图片")}</span>
        </header>
        <div className="annotator-canvas-host" ref={canvasHostRef}>
          {canvasSize && (
            <div
              className="annotator-canvas-frame"
              style={{ width: canvasSize.width, height: canvasSize.height }}
            >
              <div
                className="annotator-canvas-scale"
                style={{
                  transform: `scale(${canvasSize.width / SOURCE_WIDTH}, ${canvasSize.height / SOURCE_HEIGHT})`,
                }}
              >
                <StayCanvas
                  className="annotator-canvas"
                  height={SOURCE_HEIGHT}
                  layers={2}
                  listenerList={listeners}
                  mounted={mounted}
                  width={SOURCE_WIDTH}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      <aside className="annotator-rail">
        <section className="annotator-panel annotator-overview">
          <div>
            <span>{text("Annotations", "标注数")}</span>
            <strong>{summary.count}</strong>
          </div>
          <div>
            <span>{text("Selected", "已选择")}</span>
            <strong>{summary.selected}</strong>
          </div>
        </section>

        <section className="annotator-panel">
          <h3>{text("Edit", "编辑")}</h3>
          <div className="annotator-action-grid">
            <Button disabled={summary.selected === 0} onClick={removeSelected}>
              {text("Delete", "删除")}
            </Button>
            <Button onClick={() => navigateHistory("undo")}>{text("Undo", "撤销")}</Button>
            <Button onClick={() => navigateHistory("redo")}>{text("Redo", "重做")}</Button>
            <ResetButton />
          </div>
        </section>

        <section className="annotator-panel">
          <h3>{text("COCO data", "COCO 数据")}</h3>
          <div className="annotator-action-grid">
            <Button onClick={engine.save}>{text("Export", "导出")}</Button>
            <Button onClick={engine.import}>{text("Import", "导入")}</Button>
          </div>
          <input
            ref={inputRef}
            hidden
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              void importCoco(event.target.files?.[0])
              event.target.value = ""
            }}
          />
        </section>

        <section className="annotator-panel annotator-help">
          <h3>{text("Shortcuts", "快捷键")}</h3>
          <dl>
            <div><dt>⌘/Ctrl Z</dt><dd>{text("Undo", "撤销")}</dd></div>
            <div><dt>⇧⌘/Ctrl Z</dt><dd>{text("Redo", "重做")}</dd></div>
            <div><dt>⌘/Ctrl S</dt><dd>{text("Export", "导出")}</dd></div>
            <div><dt>⌘/Ctrl I</dt><dd>{text("Import", "导入")}</dd></div>
          </dl>
        </section>

        <section className="annotator-panel annotator-activity" aria-live="polite">
          <h3>{text("Activity", "最近操作")}</h3>
          <p>{entries[0] ?? text("Workspace loading", "工作区加载中")}</p>
        </section>

        <a
          className="annotator-photo-source"
          href="https://pixnio.com/es/arquitectura/centro-ciudad/carretera-calle-trafico-ciudad-centro-vehiculo-coche-urbanita"
          rel="noreferrer"
          target="_blank"
        >
          {text("Traffic photo: Pixnio, CC0", "交通图片：Pixnio，CC0")}
        </a>
      </aside>
    </div>
  )
}

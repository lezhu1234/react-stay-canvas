import { useEffect, useMemo, useRef, useState } from "react"
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
  CanvasCard,
  colors,
  DemoLayout,
  EventLog,
  placeSceneChild,
  ResetButton,
  StatusGrid,
  Toolbar,
} from "../../components/DemoKit"
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

const EDGE = 8
const MIN_SIZE = 12
const boxOf = (child: BoxChild) => child.shapeMap.get("0") as Rectangle
const labelOf = (child: BoxChild) => child.shapeMap.get("1") as StayText
const annotations = (tools: StayTools) =>
  tools.getChildrenBySelector<Rectangle | StayText>(".annotation") as BoxChild[]
const imageBound = (tools: StayTools) =>
  tools.getChildBySelector<StayImage>(".background-image")?.shape.getBound() ?? {
    x: 0,
    y: 0,
    width: 720,
    height: 420,
  }

const hitBox = (tools: StayTools, point: Coordinate) => annotations(tools)
  .filter((child) => boxOf(child).contains(point))
  .sort((a, b) => boxOf(a).area - boxOf(b).area)[0]

function handleAt(shape: Rectangle, point: Coordinate): Handle | undefined {
  const right = shape.x + shape.width
  const bottom = shape.y + shape.height
  const outsideBox =
    point.x < shape.x - EDGE ||
    point.x > right + EDGE ||
    point.y < shape.y - EDGE ||
    point.y > bottom + EDGE
  if (outsideBox) return

  const horizontal = Math.abs(point.x - shape.x) <= EDGE
    ? "w"
    : Math.abs(point.x - right) <= EDGE ? "e" : ""
  const vertical = Math.abs(point.y - shape.y) <= EDGE
    ? "n"
    : Math.abs(point.y - bottom) <= EDGE ? "s" : ""
  const handle = `${vertical}${horizontal}`
  return handle ? handle as Handle : undefined
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
  return tools.appendChild<Rectangle | StayText>({
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
    ],
  }) as BoxChild
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
  return annotations(tools)
    .filter((child) => engine.selected.has(child.id))
    .sort((a, b) => boxOf(a).area - boxOf(b).area)
    .map((child) => ({ child, handle: handleAt(boxOf(child), point) }))
    .find(({ handle }) => handle)
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
                session = { kind: "idle", selected }
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
              const offsetX = Math.max(
                session.limits.minX,
                Math.min(e.x - session.start.x, session.limits.maxX),
              )
              const offsetY = Math.max(
                session.limits.minY,
                Math.min(e.y - session.start.y, session.limits.maxY),
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
              return session
            }
            if (session.kind !== "draw") return session
            const child = session.child ?? addBox(tools, engine, {
              x: e.x,
              y: e.y,
              width: MIN_SIZE,
              height: MIN_SIZE,
            })
            const bound = imageBound(tools)
            const rect = boxBetween(session.start, clampPoint(e.point, bound), bound)
            boxOf(child).update(rect)
            labelOf(child).update({ x: rect.x + 8, y: rect.y + 16 })
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
        const edge = selectedHandle(tools, engine, e.point)
        const target = hitBox(tools, e.point)
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
  return {
    images: [{
      id: 1,
      file_name: "street-scene.png",
      width: origin.width,
      height: origin.height,
    }],
    annotations: annotations(tools).map((child, index) => {
      const box = boxOf(child)
      return {
        id: index + 1,
        image_id: 1,
        category_id: 1,
        bbox: [box.x - origin.x, box.y - origin.y, box.width, box.height],
        area: box.area,
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
      box[0] + box[2] <= origin.width &&
      box[1] + box[3] <= origin.height
    if (!valid) throw new Error("COCO annotation has an invalid bbox")
    return box as number[]
  })
  select(tools, engine)
  annotations(tools).forEach((child) => tools.removeChild(child.id))
  boxes.forEach(([x, y, width, height]) => {
    addBox(tools, engine, { x: x + origin.x, y: y + origin.y, width, height })
  })
  commit(tools, engine)
  return boxes.length
}

function backgroundSource() {
  const canvas = document.createElement("canvas")
  canvas.width = 720
  canvas.height = 420
  const context = canvas.getContext("2d")!
  const blocks: Array<[string, number, number, number, number]> = [
    ["#b9d8e8", 0, 0, 720, 250], ["#d9c7a6", 36, 72, 210, 190],
    ["#c26f51", 270, 105, 150, 157], ["#617681", 448, 48, 220, 214],
    ["#667078", 0, 250, 720, 170], ["#d95d4f", 92, 276, 188, 82],
    ["#d95d4f", 125, 250, 96, 34], ["#e8edf1", 139, 260, 68, 24],
    ["#28404f", 112, 344, 38, 28], ["#28404f", 228, 344, 38, 28],
    ["#e2b64e", 430, 286, 174, 66], ["#e2b64e", 466, 265, 82, 27],
    ["#273c48", 456, 341, 34, 26], ["#273c48", 550, 341, 34, 26],
  ]
  blocks.forEach(([color, x, y, width, height]) => {
    context.fillStyle = color
    context.fillRect(x, y, width, height)
  })
  context.fillStyle = "#f4e5a0"
  for (let x = 20; x < 720; x += 96) context.fillRect(x, 332, 54, 7)
  return canvas.toDataURL("image/png")
}

export default function AnnotatorExample() {
  const { text } = useI18n()
  const toolsRef = useRef<StayTools>()
  const inputRef = useRef<HTMLInputElement>(null)
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
      const background = placeSceneChild(tools, tools.appendChild({
        className: "background-image",
        shape: new StayImage({
          image,
          x: 0,
          y: 0,
          width: 720,
          height: 420,
          opacity: 1,
          layer: 0,
        }),
      }))
      const { x, y } = background.shape
      addBox(tools, engine, { x: x + 82, y: y + 244, width: 210, height: 132 })
      addBox(tools, engine, { x: x + 430, y: y + 257, width: 178, height: 112 })
      tools.resetHistory()
      engine.changed()
      engine.say("Workspace ready", "工作区已就绪")
    }
    image.src = backgroundSource()
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
    <DemoLayout>
      <CanvasCard
        title={text("COCO image annotator", "COCO 图像标注工具")}
        description={text(
          "Drag to draw by default. Click a box to select it, then drag it to move or drag its edges and corners to resize.",
          "默认拖拽绘制；先点击标注框选中，再拖拽移动，或拖拽其边和四角调整大小。",
        )}
        wide
      >
        <StayCanvas
          className="demo-canvas"
          height={420}
          layers={2}
          listenerList={listeners}
          mounted={mounted}
          width={720}
        />
      </CanvasCard>
      <Toolbar>
        <Button disabled={summary.selected === 0} onClick={removeSelected}>
          {text("Delete selected", "删除所选")}
        </Button>
        <Button onClick={() => navigateHistory("undo")}>{text("Undo", "撤销")}</Button>
        <Button onClick={() => navigateHistory("redo")}>{text("Redo", "重做")}</Button>
        <Button onClick={engine.save}>{text("Export COCO", "导出 COCO")}</Button>
        <Button onClick={engine.import}>{text("Import COCO", "导入 COCO")}</Button>
        <ResetButton />
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
      </Toolbar>
      <StatusGrid items={[
        [text("Annotations", "标注数"), summary.count],
        [text("Selected", "已选择"), summary.selected],
        [text("Draw", "绘制"), text("Drag empty space", "空白处拖拽")],
        [text("Shortcuts", "快捷键"), "⌘/Ctrl Z · ⇧⌘/Ctrl Z · ⌘/Ctrl S · ⌘/Ctrl I"],
      ]} />
      <EventLog entries={entries} />
    </DemoLayout>
  )
}

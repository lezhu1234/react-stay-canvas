import { useMemo, useRef, useState } from "react"
import { ListenerProps, Rectangle, StayCanvas, StayText, StayTools } from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, ResetButton, StatusGrid, Toolbar } from "../../components/DemoKit"
import { useI18n } from "../../i18n"
import { hasPointerPosition } from "../actionEventGuards"

const boxes = [
  { id: "box-a", className: "box", x: 42, y: 58, color: colors.blue },
  { id: "box-b", className: "box", x: 166, y: 58, color: colors.green },
  { id: "label-a", className: "label", x: 290, y: 58, color: colors.orange },
]

export default function SelectorsExample() {
  const { text } = useI18n()
  const toolsRef = useRef<StayTools | null>(null)
  const matchedIds = useRef<string[]>([])
  const hitId = useRef<string | null>(null)
  const visuals = useRef(new Map<string, { box: Rectangle; hitOutline: Rectangle }>())
  const [query, setQuery] = useState(".box")
  const [matches, setMatches] = useState<string[]>([])
  const [hit, setHit] = useState(text("Click a shape", "点击一个图形"))

  const runQuery = (nextQuery = query) => {
    const tools = toolsRef.current
    if (!tools) return
    matchedIds.current.forEach((id) => {
      visuals.current.get(id)?.box.update({ strokeConfig: { lineWidth: 2, color: colors.ink } })
    })
    const children = tools.getChildrenBySelector<Rectangle>(nextQuery)
    children.forEach((child) => visuals.current.get(child.id)?.box.update({ strokeConfig: { lineWidth: 6, color: colors.orange } }))
    matchedIds.current = children.map((child) => child.id)
    setMatches(matchedIds.current)
    setQuery(nextQuery)
  }

  const listeners = useMemo<ListenerProps[]>(() => [{
    name: "hit-test",
    event: "click",
    selector: ".stay-canvas",
    callback: ({ e, tools }) => {
      if (!hasPointerPosition(e)) return
      const children = tools.getContainPointChildren({
        point: e.point,
        selector: ".box|.label",
        withRoot: false,
      })
      const nextHit = children[0]?.id ?? null
      if (hitId.current) {
        visuals.current.get(hitId.current)?.hitOutline.update({
          strokeConfig: { color: { ...colors.blue, a: 0 }, lineWidth: 4 },
        })
      }
      if (nextHit) {
        visuals.current.get(nextHit)?.hitOutline.update({
          strokeConfig: { color: colors.blue, lineWidth: 4 },
        })
      }
      hitId.current = nextHit
      setHit(nextHit ?? text("No hit", "未命中"))
    },
  }], [text])

  const mounted = (tools: StayTools) => {
    toolsRef.current = tools
    boxes.forEach((box) => {
      const rectangle = new Rectangle({
        x: box.x,
        y: box.y,
        width: 106,
        height: 118,
        zIndex: 1,
        fillConfig: { color: { ...box.color, a: 0.18 } },
        strokeConfig: { color: colors.ink, lineWidth: 2 },
      })
      const hitOutline = new Rectangle({
        x: box.x,
        y: box.y,
        width: 106,
        height: 118,
        zIndex: 3,
        strokeConfig: { color: { ...colors.blue, a: 0 }, lineWidth: 4 },
      })
      visuals.current.set(box.id, { box: rectangle, hitOutline })
      tools.appendChild({
        id: box.id,
        className: box.className,
        shape: [
          rectangle,
          new StayText({
            x: box.x + 53,
            y: box.y + 47,
            text: `#${box.id} · .${box.className}`,
            font: { size: 11, fontWeight: 650 },
            zIndex: 2,
            fillConfig: { color: colors.ink },
          }),
          hitOutline,
        ],
      })
    })
    requestAnimationFrame(() => runQuery(".box"))
  }

  return (
    <DemoLayout>
      <CanvasCard title={text("Selectors and hit testing", "选择器与命中测试")} description={text("Orange outlines show selector matches. Blue outlines show the latest pointer hit.", "橙色描边表示选择器匹配项，蓝色外框表示最近一次点击命中。")} wide>
        <StayCanvas className="demo-canvas" height={240} listenerList={listeners} mounted={mounted} width={440} />
      </CanvasCard>
      <div className="query-control">
        <label htmlFor="selector-query">{text("Selector", "选择器")}</label>
        <input id="selector-query" onChange={(event) => setQuery(event.target.value)} value={query} />
        <Button onClick={() => runQuery()}>{text("Run query", "执行查询")}</Button>
      </div>
      <Toolbar>
        <Button onClick={() => runQuery(".box")}>.box</Button>
        <Button onClick={() => runQuery("#box-b")}>#box-b</Button>
        <Button onClick={() => runQuery(".box&!#box-a")}>.box &amp; !#box-a</Button>
        <Button onClick={() => runQuery(".box|.label")}>.box | .label</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[[text("Matches", "匹配项"), matches.join(", ") || text("None", "无")], [text("Pointer hit", "指针命中"), hit], [text("Query", "查询"), query]]} />
    </DemoLayout>
  )
}

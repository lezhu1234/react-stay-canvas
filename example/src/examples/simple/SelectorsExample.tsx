import { useMemo, useRef, useState } from "react"
import { ListenerProps, Rectangle, StayCanvas, StayTools } from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, ResetButton, StatusGrid, Toolbar } from "../../components/DemoKit"

const boxes = [
  { id: "box-a", className: "box", x: 42, y: 58, color: colors.blue },
  { id: "box-b", className: "box", x: 166, y: 58, color: colors.green },
  { id: "label-a", className: "label", x: 290, y: 58, color: colors.orange },
]

export default function SelectorsExample() {
  const toolsRef = useRef<StayTools | null>(null)
  const selectedIds = useRef<string[]>([])
  const [query, setQuery] = useState(".box")
  const [matches, setMatches] = useState<string[]>([])
  const [hit, setHit] = useState("Click a shape")

  const runQuery = (nextQuery = query) => {
    const tools = toolsRef.current
    if (!tools) return
    selectedIds.current.forEach((id) => {
      const shape = tools.getChildById<Rectangle>(id)?.shape
      shape?.update({ strokeConfig: { lineWidth: 2, color: colors.ink } })
    })
    const children = tools.getChildrenBySelector<Rectangle>(nextQuery)
    children.forEach((child) => child.shape.update({ strokeConfig: { lineWidth: 6, color: colors.orange } }))
    selectedIds.current = children.map((child) => child.id)
    setMatches(selectedIds.current)
    setQuery(nextQuery)
  }

  const listeners = useMemo<ListenerProps[]>(() => [{
    name: "hit-test",
    event: "click",
    selector: ".stay-canvas",
    callback: ({ e, tools }) => {
      const children = tools.getContainPointChildren({
        point: e.point,
        selector: ".box|.label",
        withRoot: false,
      })
      setHit(children[0]?.id ?? "No hit")
    },
  }], [])

  const mounted = (tools: StayTools) => {
    toolsRef.current = tools
    boxes.forEach((box) => tools.appendChild({
      id: box.id,
      className: box.className,
      shape: new Rectangle({
        x: box.x,
        y: box.y,
        width: 106,
        height: 118,
        fillConfig: { color: { ...box.color, a: 0.18 } },
        strokeConfig: { color: colors.ink, lineWidth: 2 },
      }),
    }))
    requestAnimationFrame(() => runQuery(".box"))
  }

  return (
    <DemoLayout>
      <CanvasCard title="Selectors and hit testing" description="Orange outlines are selector matches; click a shape for pointer hit testing." wide>
        <StayCanvas className="demo-canvas" height={240} listenerList={listeners} mounted={mounted} width={440} />
      </CanvasCard>
      <div className="query-control">
        <label htmlFor="selector-query">Selector</label>
        <input id="selector-query" onChange={(event) => setQuery(event.target.value)} value={query} />
        <Button onClick={() => runQuery()}>Run query</Button>
      </div>
      <Toolbar>
        <Button onClick={() => runQuery(".box")}>.box</Button>
        <Button onClick={() => runQuery("#box-b")}>#box-b</Button>
        <Button onClick={() => runQuery(".box&!#box-a")}>.box &amp; !#box-a</Button>
        <Button onClick={() => runQuery(".box|.label")}>.box | .label</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[["Matches", matches.join(", ") || "None"], ["Pointer hit", hit], ["Query", query]]} />
    </DemoLayout>
  )
}

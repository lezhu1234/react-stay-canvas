import { useMemo, useRef, useState } from "react"
import { ListenerProps, Rectangle, StayCanvas, StayText, StayTools } from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, ResetButton, StatusGrid, Toolbar } from "../../components/DemoKit"
import { useI18n } from "../../i18n"

export default function TransformExample() {
  const { text } = useI18n()
  const toolsRef = useRef<StayTools | null>(null)
  const [action, setAction] = useState(text("Original view", "初始视图"))

  const listeners = useMemo<ListenerProps[]>(() => [
    {
      name: "wheel-zoom",
      event: ["zoomin", "zoomout"],
      callback: ({ e, tools, originEvent }) => {
        originEvent.preventDefault()
        void tools.zoom(e.deltaY, e.point)
        setAction(text(`${e.name} around ${Math.round(e.x)}, ${Math.round(e.y)}`, `${e.name}，中心 ${Math.round(e.x)}, ${Math.round(e.y)}`))
      },
    },
    {
      name: "control-pan",
      event: ["startmove", "move", "moveend"],
      callback: ({ e, composeStore, tools }) => ({
        startmove: () => {
          tools.moveStart()
          setAction(text("Control-drag started", "Control 拖动开始"))
          return { start: e.point }
        },
        move: () => {
          void tools.move(e.x - composeStore.start.x, e.y - composeStore.start.y)
          setAction(text("Control-drag panning", "Control 拖动平移中"))
        },
        moveend: () => setAction(text("Control-drag ended", "Control 拖动结束")),
      }),
    },
  ], [text])

  const mounted = (tools: StayTools) => {
    toolsRef.current = tools
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 4; column++) {
        tools.appendChild({
          className: "tile",
          shape: new Rectangle({
            x: 42 + column * 92,
            y: 42 + row * 68,
            width: 64,
            height: 42,
            fillConfig: { color: (row + column) % 2 ? colors.blueSoft : colors.greenSoft },
            strokeConfig: { color: (row + column) % 2 ? colors.blue : colors.green, lineWidth: 1 },
          }),
        })
      }
    }
    tools.appendChild({ className: "label", shape: new StayText({ x: 220, y: 250, text: text("wheel to zoom  |  control-drag to pan", "滚轮缩放  |  Control 拖动平移"), font: { size: 14 }, fillConfig: { color: colors.ink } }) })
  }

  const pan = (x: number, y: number) => {
    const tools = toolsRef.current
    if (!tools) return
    tools.moveStart()
    void tools.move(x, y)
    setAction(text(`Moved ${x}, ${y}`, `已移动 ${x}, ${y}`))
  }

  const zoom = (delta: number) => {
    void toolsRef.current?.zoom(delta, { x: 220, y: 145 })
    setAction(delta < 0 ? text("Zoomed in", "已放大") : text("Zoomed out", "已缩小"))
  }

  return (
    <DemoLayout>
      <CanvasCard title={text("Viewport transforms", "平移与缩放")} description={text("Buttons and native pointer events drive the same move and zoom tools.", "按钮和鼠标手势调用的是同一套平移、缩放能力。")} wide>
        <StayCanvas className="demo-canvas demo-canvas-grid" height={290} listenerList={listeners} mounted={mounted} passive={false} width={440} />
      </CanvasCard>
      <Toolbar>
        <Button onClick={() => pan(-24, 0)}>{text("Pan left", "向左平移")}</Button>
        <Button onClick={() => pan(24, 0)}>{text("Pan right", "向右平移")}</Button>
        <Button onClick={() => zoom(-120)}>{text("Zoom in", "放大")}</Button>
        <Button onClick={() => zoom(120)}>{text("Zoom out", "缩小")}</Button>
        <Button onClick={() => { void toolsRef.current?.reset(); setAction(text("Reset transform", "已恢复初始视图")) }}>{text("Tool reset", "恢复初始视图")}</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[[text("Last transform", "最近变换"), action], [text("Zoom center", "缩放中心"), "220, 145"], [text("Pointer gesture", "指针手势"), text("Control + drag", "Control + 拖动")]]} />
    </DemoLayout>
  )
}

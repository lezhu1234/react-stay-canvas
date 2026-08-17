import { useMemo, useRef, useState } from "react"
import { ListenerProps, Rectangle, StayCanvas, StayText, StayTools } from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, ResetButton, StatusGrid, Toolbar } from "../../components/DemoKit"

export default function TransformExample() {
  const toolsRef = useRef<StayTools | null>(null)
  const [action, setAction] = useState("Original view")

  const listeners = useMemo<ListenerProps[]>(() => [
    {
      name: "wheel-zoom",
      event: ["zoomin", "zoomout"],
      callback: ({ e, tools, originEvent }) => {
        originEvent.preventDefault()
        void tools.zoom(e.deltaY, e.point)
        setAction(`${e.name} around ${Math.round(e.x)}, ${Math.round(e.y)}`)
      },
    },
    {
      name: "control-pan",
      event: ["startmove", "move", "moveend"],
      callback: ({ e, composeStore, tools }) => ({
        startmove: () => {
          tools.moveStart()
          setAction("Control-drag started")
          return { start: e.point }
        },
        move: () => {
          void tools.move(e.x - composeStore.start.x, e.y - composeStore.start.y)
          setAction("Control-drag panning")
        },
        moveend: () => setAction("Control-drag ended"),
      }),
    },
  ], [])

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
    tools.appendChild({ className: "label", shape: new StayText({ x: 220, y: 250, text: "wheel to zoom  |  control-drag to pan", font: { size: 14 }, fillConfig: { color: colors.ink } }) })
  }

  const pan = (x: number, y: number) => {
    const tools = toolsRef.current
    if (!tools) return
    tools.moveStart()
    void tools.move(x, y)
    setAction(`Moved ${x}, ${y}`)
  }

  const zoom = (delta: number) => {
    void toolsRef.current?.zoom(delta, { x: 220, y: 145 })
    setAction(delta < 0 ? "Zoomed in" : "Zoomed out")
  }

  return (
    <DemoLayout>
      <CanvasCard title="Viewport transforms" description="Buttons and native pointer events drive the same move and zoom tools." wide>
        <StayCanvas className="demo-canvas demo-canvas-grid" height={290} listenerList={listeners} mounted={mounted} passive={false} width={440} />
      </CanvasCard>
      <Toolbar>
        <Button onClick={() => pan(-24, 0)}>Pan left</Button>
        <Button onClick={() => pan(24, 0)}>Pan right</Button>
        <Button onClick={() => zoom(-120)}>Zoom in</Button>
        <Button onClick={() => zoom(120)}>Zoom out</Button>
        <Button onClick={() => { void toolsRef.current?.reset(); setAction("Reset transform") }}>Tool reset</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[["Last transform", action], ["Zoom center", "220, 145"], ["Pointer gesture", "Control + drag"]]} />
    </DemoLayout>
  )
}

import { useRef, useState } from "react"
import { Rectangle, StayCanvas, StayText, StayTools } from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, ResetButton, StatusGrid, Toolbar } from "../../components/DemoKit"

export default function LayersExample() {
  const frontRef = useRef<ReturnType<StayTools["appendChild"]> | null>(null)
  const middleRef = useRef<ReturnType<StayTools["appendChild"]> | null>(null)
  const [front, setFront] = useState("orange")

  const mounted = (tools: StayTools) => {
    tools.appendChild({
      className: "background",
      shape: new Rectangle({ x: 20, y: 20, width: 400, height: 250, layer: 0, fillConfig: { color: colors.graySoft } }),
    })
    middleRef.current = tools.appendChild({
      className: "stack",
      shape: new Rectangle({
        x: 92,
        y: 62,
        width: 190,
        height: 150,
        layer: 1,
        zIndex: 1,
        fillConfig: { color: colors.blue },
      }),
    })
    frontRef.current = tools.appendChild({
      className: "stack",
      shape: new Rectangle({
        x: 176,
        y: 104,
        width: 190,
        height: 130,
        layer: 1,
        zIndex: 2,
        fillConfig: { color: colors.orange },
      }),
    })
    tools.appendChild({
      className: "overlay",
      shape: new StayText({
        x: 220,
        y: 28,
        text: "layer 2 overlay",
        font: { size: 15, fontWeight: 650 },
        layer: 2,
        zIndex: 1,
        fillConfig: { color: colors.ink },
      }),
    })
  }

  const swap = () => {
    const orange = frontRef.current?.shape as Rectangle | undefined
    const blue = middleRef.current?.shape as Rectangle | undefined
    if (!orange || !blue) return
    const orangeZ = orange.zIndex
    orange.update({ zIndex: blue.zIndex })
    blue.update({ zIndex: orangeZ })
    setFront((value) => value === "orange" ? "blue" : "orange")
  }

  return (
    <DemoLayout>
      <CanvasCard title="Layer routing and zIndex" description="Canvas layers isolate paint passes; zIndex sorts Shapes inside a layer." wide>
        <StayCanvas className="demo-canvas demo-canvas-grid" height={290} layers={3} mounted={mounted} width={440} />
      </CanvasCard>
      <Toolbar>
        <Button onClick={swap}>Swap zIndex</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[["Canvas layers", 3], ["Front shape", front], ["Overlay layer", 2]]} />
    </DemoLayout>
  )
}

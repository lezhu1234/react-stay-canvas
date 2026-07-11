import { useRef, useState } from "react"
import {
  ListenerProps,
  Rectangle,
  StayCanvas,
  StayCanvasRefType,
  StayText,
} from "react-stay-canvas"

// The library expects colors as RGBA objects; small helper for readability.
const rgba = (r: number, g: number, b: number, a = 1) => ({ r, g, b, a })

const CANVAS_W = 760
const CANVAS_H = 460

export default function App() {
  const ref = useRef<StayCanvasRefType>(null)
  const [count, setCount] = useState(0)

  // Draw a hint on mount and count rectangles as they are drawn.
  const mounted = (tools: any) => {
    tools.appendChild({
      className: "hint",
      shape: new StayText({
        x: CANVAS_W / 2,
        y: 28,
        text: "Drag on the canvas to draw a rectangle",
        fillConfig: { color: rgba(148, 163, 184, 1) },
      }),
    })
  }

  // Drag-to-draw: create a rectangle on dragstart, resize it while dragging,
  // snapshot on dragend so undo/redo works.
  const drawListener: ListenerProps = {
    name: "draw",
    event: ["dragstart", "drag", "dragend"],
    callback: ({ e, composeStore, tools }: any) => {
      return {
        dragstart: () => ({
          startX: e.x,
          startY: e.y,
          child: tools.appendChild({
            className: "rect",
            shape: new Rectangle({
              x: e.x,
              y: e.y,
              width: 0,
              height: 0,
              strokeConfig: { color: rgba(59, 130, 246, 1), lineWidth: 2 },
              fillConfig: { color: rgba(59, 130, 246, 0.15) },
            }),
          }),
        }),
        drag: () => {
          const { startX, startY, child } = composeStore
          const x = Math.min(startX, e.x)
          const y = Math.min(startY, e.y)
          const width = Math.abs(startX - e.x)
          const height = Math.abs(startY - e.y)
          child.update({
            shape: new Rectangle({
              x,
              y,
              width,
              height,
              strokeConfig: { color: rgba(59, 130, 246, 1), lineWidth: 2 },
              fillConfig: { color: rgba(59, 130, 246, 0.15) },
            }),
          })
        },
        dragend: () => {
          tools.log()
          setCount((c) => c + 1)
        },
      }
    },
  }

  const undo = () => ref.current?.trigger("undo" as any)
  const redo = () => ref.current?.trigger("redo" as any)

  return (
    <main>
      <header>
        <h1>react-stay-canvas</h1>
        <p>
          Live playground &mdash; this page is built straight from{" "}
          <code>src/</code>, so every code change shows up here.
        </p>
      </header>

      <div className="toolbar">
        <button onClick={undo}>Undo</button>
        <button onClick={redo}>Redo</button>
        <span className="count">{count} drawn</span>
      </div>

      <div className="stage">
        <StayCanvas
          ref={ref}
          mode="instant"
          width={CANVAS_W}
          height={CANVAS_H}
          listenerList={[drawListener]}
          mounted={mounted}
          className="canvas"
        />
      </div>

      <footer>
        <a href="https://github.com/lezhu1234/react-stay-canvas">GitHub</a>
        <span>·</span>
        <a href="https://www.npmjs.com/package/react-stay-canvas">npm</a>
      </footer>
    </main>
  )
}

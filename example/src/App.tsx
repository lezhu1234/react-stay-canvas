import {
  Circle,
  Line,
  Rectangle,
  StayCanvas,
  StayText,
} from "react-stay-canvas"

// The library takes colors as RGBA objects.
const rgba = (r: number, g: number, b: number, a = 1) => ({ r, g, b, a })
const blue = rgba(59, 130, 246, 1)
const green = rgba(34, 197, 94, 1)
const pink = rgba(244, 114, 182, 1)
const slate = rgba(148, 163, 184, 1)

// Example 1 — the built-in shapes drawn on mount.
function ShapesExample() {
  const mounted = (tools: any) => {
    tools.appendChild({
      className: "shape",
      shape: new Rectangle({
        x: 40,
        y: 50,
        width: 130,
        height: 90,
        strokeConfig: { color: blue, lineWidth: 2 },
      }),
    })
    tools.appendChild({
      className: "shape",
      shape: new Rectangle({
        x: 210,
        y: 50,
        width: 130,
        height: 90,
        fillConfig: { color: rgba(59, 130, 246, 0.25) },
      }),
    })
    tools.appendChild({
      className: "shape",
      shape: new Circle({
        x: 105,
        y: 250,
        radius: 55,
        strokeConfig: { color: green, lineWidth: 2 },
      }),
    })
    tools.appendChild({
      className: "shape",
      shape: new Line({
        x1: 210,
        y1: 200,
        x2: 360,
        y2: 300,
        strokeConfig: { color: pink, lineWidth: 3 },
      }),
    })
    tools.appendChild({
      className: "shape",
      shape: new StayText({
        x: 200,
        y: 350,
        text: "Rectangle · Circle · Line · Text",
        fillConfig: { color: slate },
      }),
    })
  }

  return (
    <StayCanvas
      mode="instant"
      width={400}
      height={380}
      layers={2}
      mounted={mounted}
      className="canvas"
    />
  )
}

export default function App() {
  return (
    <main>
      <header>
        <h1>react-stay-canvas</h1>
        <p>A small canvas library for React. Examples below.</p>
      </header>

      <section className="example">
        <h2>Built-in shapes</h2>
        <div className="stage">
          <ShapesExample />
        </div>
      </section>

      <footer>
        <a href="https://github.com/lezhu1234/react-stay-canvas">GitHub</a>
        <span>·</span>
        <a href="https://www.npmjs.com/package/react-stay-canvas">npm</a>
      </footer>
    </main>
  )
}

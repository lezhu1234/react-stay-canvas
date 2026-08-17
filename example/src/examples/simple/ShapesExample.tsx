import { useRef, useState } from "react"
import {
  Circle,
  Line,
  Rectangle,
  StayCanvas,
  StayImage,
  StayText,
  StayTools,
} from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, ResetButton, StatusGrid, Toolbar } from "../../components/DemoKit"
import { useI18n } from "../../i18n"

function makeSampleImage() {
  const canvas = document.createElement("canvas")
  canvas.width = 240
  canvas.height = 150
  const context = canvas.getContext("2d")!
  const gradient = context.createLinearGradient(0, 0, 240, 150)
  gradient.addColorStop(0, "#365fca")
  gradient.addColorStop(1, "#2c895b")
  context.fillStyle = gradient
  context.fillRect(0, 0, 240, 150)
  context.fillStyle = "rgba(255,255,255,.9)"
  context.font = "600 22px system-ui"
  context.fillText("StayImage", 56, 84)
  return canvas.toDataURL("image/png")
}

export default function ShapesExample() {
  const { text } = useI18n()
  const toolsRef = useRef<StayTools | null>(null)
  const rectangleRef = useRef<ReturnType<StayTools["appendChild"]> | null>(null)
  const [variant, setVariant] = useState(text("Default geometry", "默认状态"))

  const mounted = (tools: StayTools) => {
    toolsRef.current = tools
    rectangleRef.current = tools.appendChild({
      id: "shape-rectangle",
      className: "shape",
      shape: new Rectangle({
        x: 28,
        y: 32,
        width: 112,
        height: 76,
        fillConfig: { color: colors.blueSoft },
        strokeConfig: { color: colors.blue, lineWidth: 3 },
      }),
    })
    tools.appendChild({
      className: "shape",
      shape: new Circle({
        x: 220,
        y: 70,
        radius: 42,
        fillConfig: { color: colors.greenSoft },
        strokeConfig: { color: colors.green, lineWidth: 3 },
      }),
    })
    tools.appendChild({
      className: "shape",
      shape: new Line({
        x1: 292,
        y1: 32,
        x2: 402,
        y2: 108,
        strokeConfig: { color: colors.orange, lineWidth: 4, dash: [10, 7], lineCap: "round" },
      }),
    })
    tools.appendChild({
      className: "label",
      shape: new StayText({
        x: 220,
        y: 154,
        text: text("Rectangle  Circle  Line  Text", "矩形  圆形  线条  文本"),
        font: { size: 18, fontWeight: 650 },
        fillConfig: { color: colors.ink },
      }),
    })

    const image = new Image()
    image.onload = () => {
      tools.appendChild({
        className: "image",
        shape: new StayImage({
          image,
          x: 112,
          y: 194,
          width: 216,
          height: 112,
          opacity: 0.92,
          strokeConfig: { color: colors.ink, lineWidth: 1 },
        }),
      })
    }
    image.src = makeSampleImage()
  }

  const changeRectangle = () => {
    const rectangle = rectangleRef.current?.shape as Rectangle | undefined
    if (!rectangle) return
    rectangle.update({
      x: rectangle.x === 28 ? 54 : 28,
      width: rectangle.width === 112 ? 150 : 112,
      fillConfig: { color: rectangle.width === 112 ? colors.orangeSoft : colors.blueSoft },
    })
    setVariant(rectangle.width === 150 ? text("Updated geometry", "已修改") : text("Default geometry", "默认状态"))
  }

  return (
    <DemoLayout>
      <CanvasCard title={text("Built-in shape palette", "内置图形与样式")} description={text("Five drawing primitives share one incremental renderer.", "同一个 Canvas 中绘制五种内容，并按需增量重绘。")} wide>
        <StayCanvas className="demo-canvas" height={330} layers={2} mounted={mounted} width={440} />
      </CanvasCard>
      <Toolbar>
        <Button onClick={changeRectangle}>{text("Toggle rectangle", "切换矩形")}</Button>
        <Button onClick={() => toolsRef.current?.refresh()}>{text("Force refresh", "强制刷新")}</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[[text("Variant", "当前状态"), variant], ["Canvas", "440 × 330"], [text("Layers", "图层"), "2"]]} />
    </DemoLayout>
  )
}

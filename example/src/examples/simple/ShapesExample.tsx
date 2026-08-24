import { useRef, useState } from "react"
import {
  Circle,
  Line,
  Path,
  Point,
  Rectangle,
  StayCanvas,
  StayImage,
  StayText,
  StayTools,
} from "react-stay-canvas"

import { Button, CanvasCard, colors, DemoLayout, placeSceneChild, ResetButton, scenePoint, StatusGrid, Toolbar } from "../../components/DemoKit"
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
  const rectangleLabelRef = useRef<StayText | null>(null)
  const [variant, setVariant] = useState(text("Default geometry", "默认状态"))
  const [refreshCount, setRefreshCount] = useState(0)

  const mounted = (tools: StayTools) => {
    toolsRef.current = tools
    rectangleLabelRef.current = new StayText({
      x: 84,
      y: 118,
      text: "Rectangle",
      textAlign: "center",
      textBaseline: "top",
      font: { size: 12, fontWeight: 700 },
      fillConfig: { color: colors.ink },
    })
    rectangleRef.current = placeSceneChild(tools, tools.appendChild({
      id: "shape-rectangle",
      className: "shape",
      shape: [
        new Rectangle({
          x: 28,
          y: 32,
          width: 112,
          height: 76,
          fillConfig: { color: colors.blueSoft },
          strokeConfig: { color: colors.blue, lineWidth: 3 },
        }),
        rectangleLabelRef.current,
      ],
    }))
    placeSceneChild(tools, tools.appendChild({
      className: "shape",
      shape: [
        new Circle({
          x: 220,
          y: 70,
          radius: 42,
          fillConfig: { color: colors.greenSoft },
          strokeConfig: { color: colors.green, lineWidth: 3 },
        }),
        new StayText({
          x: 220,
          y: 118,
          text: "Circle",
          textAlign: "center",
          textBaseline: "top",
          font: { size: 12, fontWeight: 700 },
          fillConfig: { color: colors.ink },
        }),
      ],
    }))
    placeSceneChild(tools, tools.appendChild({
      className: "shape",
      shape: [
        new Line({
          x1: 292,
          y1: 32,
          x2: 402,
          y2: 108,
          strokeConfig: { color: colors.orange, lineWidth: 4, dash: [10, 7], lineCap: "round" },
        }),
        new StayText({
          x: 347,
          y: 118,
          text: "Line",
          textAlign: "center",
          textBaseline: "top",
          font: { size: 12, fontWeight: 700 },
          fillConfig: { color: colors.ink },
        }),
      ],
    }))
    placeSceneChild(tools, tools.appendChild({
      className: "label",
      shape: new StayText({
        x: 220,
        y: 154,
        text: "StayText",
        textAlign: "center",
        textBaseline: "top",
        font: { size: 18, fontWeight: 650 },
        fillConfig: { color: colors.ink },
      }),
    }))
    placeSceneChild(tools, tools.appendChild({
      className: "shape",
      shape: [
        new Path({
          points: [
            new Point({ x: 290, y: 160 }),
            new Point({ x: 320, y: 176 }),
            new Point({ x: 350, y: 154 }),
            new Point({ x: 385, y: 172 }),
            new Point({ x: 412, y: 156 }),
          ],
          strokeConfig: { color: colors.orange, lineWidth: 8 },
        }),
        new StayText({
          x: 351,
          y: 180,
          text: "Path",
          textAlign: "center",
          textBaseline: "top",
          font: { size: 10, fontWeight: 700 },
          fillConfig: { color: colors.ink },
        }),
      ],
    }))

    const image = new Image()
    image.onload = () => {
      const imageChild = tools.appendChild({
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
      placeSceneChild(tools, imageChild)
    }
    image.src = makeSampleImage()
  }

  const changeRectangle = () => {
    const tools = toolsRef.current
    const rectangle = rectangleRef.current?.shape as Rectangle | undefined
    if (!tools || !rectangle) return
    const expanding = rectangle.width === 112
    const rectanglePosition = scenePoint(tools, expanding ? 54 : 28, 32)
    const labelPosition = scenePoint(tools, expanding ? 129 : 84, 118)
    rectangle.update({
      x: rectanglePosition.x,
      width: expanding ? 150 : 112,
      fillConfig: { color: expanding ? colors.orangeSoft : colors.blueSoft },
    })
    rectangleLabelRef.current?.update({ x: labelPosition.x })
    setVariant(expanding ? text("Updated geometry", "已修改") : text("Default geometry", "默认状态"))
  }

  const forceRefresh = () => {
    toolsRef.current?.refresh()
    setRefreshCount((value) => value + 1)
  }

  return (
    <DemoLayout>
      <CanvasCard title={text("Built-in shape palette", "内置图形与样式")} description={text("Six drawing primitives share one incremental renderer.", "同一个 Canvas 中绘制六种内容，并按需增量重绘。")} wide>
        <StayCanvas className="demo-canvas" height={330} layers={2} mounted={mounted} width={440} />
      </CanvasCard>
      <Toolbar>
        <Button onClick={changeRectangle}>{text("Toggle rectangle", "切换矩形")}</Button>
        <Button onClick={forceRefresh}>{text("Force refresh", "强制刷新")}</Button>
        <ResetButton />
      </Toolbar>
      <StatusGrid items={[[text("Variant", "当前状态"), variant], [text("Refreshes", "刷新次数"), refreshCount], ["Canvas", text("Responsive", "自适应")], [text("Layers", "图层"), "2"]]} />
    </DemoLayout>
  )
}

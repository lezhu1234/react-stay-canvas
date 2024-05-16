# react-stay-canvas
stay-canvas for react

<div align="center">

[**English**](./README.en.md) | [**中文简体**](./README.zh.md)

</div>

## 安装

```bash
npm install react-stay-canvas
```
## 使用
``` typescript
import { ListenerProps, Point, Rectangle, StayCanvas } from "react-stay-canvas"

export function Demo() {
  const DragListener: ListenerProps = {
    name: "dragListener",
    event: ["dragstart", "drag"],
    callback: ({ e, composeStore, tools: { appendChild, updateChild } }) => {
      const eventMap = {
        dragstart: () => ({
          dragStartPosition: new Point(e.x, e.y),
          dragChild: appendChild({
            shape: new Rectangle({
              x: e.x,
              y: e.y,
              width: 0,
              height: 0,
              props: { color: "red" },
            }),
            className: "annotation",
          }),
        }),
        drag: () => {
          const { dragStartPosition, dragChild } = composeStore

          const x = Math.min(dragStartPosition.x, e.x)
          const y = Math.min(dragStartPosition.y, e.y)
          const width = Math.abs(dragStartPosition.x - e.x)
          const height = Math.abs(dragStartPosition.y - e.y)

          updateChild({
            child: dragChild,
            shape: dragChild.shape.update({ x,y,              width,            height,
            }),
          })
        },
      }
      return eventMap[e.name as keyof typeof eventMap]() || {}
    },
  }
  return (
    <StayCanvas
      className="border"
      width={500}
      height={500}
      listenerList={[DragListener]}
    />
  )
}


```


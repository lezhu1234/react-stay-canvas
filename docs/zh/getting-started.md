# 快速开始

[文档首页](./README.md) · [English](../en/getting-started.md)

这一页会创建一个固定尺寸的 Canvas 场景，在挂载时添加矩形，并通过 React 按钮修改和删除这个场景对象。

## 安装

```bash
npm install react-stay-canvas
```

`react-stay-canvas` 使用 React，但不会把 React 打包进库。应用需要自行安装符合项目要求的 `react` 和 `react-dom`。

## 渲染第一个场景

```tsx
import { Rectangle, StayCanvas, type StayTools } from "react-stay-canvas"

function mounted(tools: StayTools) {
  tools.appendChild({
    id: "welcome-card",
    className: "card",
    shape: new Rectangle({
      x: 40,
      y: 40,
      width: 160,
      height: 96,
      fillConfig: { color: { r: 219, g: 231, b: 255, a: 1 } },
      strokeConfig: { color: { r: 49, g: 95, b: 207, a: 1 }, lineWidth: 2 },
    }),
  })
}

export function Demo() {
  return <StayCanvas width={440} height={260} mounted={mounted} />
}
```

这里发生了三件事：

1. `StayCanvas` 创建场景运行时和上下叠放的原生 Canvas 图层。
2. `mounted` 在当前 Canvas 实例准备好后获得 `StayTools`。
3. `appendChild` 创建一个 Child；矩形 Shape 决定它的几何和绘制方式。

当前颜色类型使用 RGBA 对象 `{ r, g, b, a }`，其中 RGB 范围为 0–255，`a` 范围为 0–1。

## Canvas 尺寸和页面布局

`width` 和 `height` 是场景的实际尺寸，不只是 CSS 展示尺寸。库会创建一个同样大小的容器，并把每个原生 `<canvas>` 绝对定位在这个容器里。

```tsx
<div className="canvas-shell">
  <StayCanvas width={440} height={260} mounted={mounted} />
</div>
```

```css
.canvas-shell {
  width: fit-content;
  max-width: 100%;
  overflow: auto;
}
```

页面外层可以控制留白、滚动和响应式布局，但不要只用 CSS 拉伸内部 Canvas 来代替 `width`、`height`。CSS 拉伸会改变显示比例，却不会同步场景坐标和位图分辨率。

`layers` 表示叠放的 Canvas 图层数。例如 `layers={3}` 会创建三个尺寸一致的原生 `<canvas>`，它们共同组成一个场景，而不是三个并排的场景。

## 保存并操作 Child

`appendChild` 会返回创建出的 Child。可以保存这个引用，在后续操作中修改其中的 Shape。

```tsx
import { useRef } from "react"
import {
  Rectangle,
  StayCanvas,
  type StayInstantChild,
  type StayTools,
} from "react-stay-canvas"

export function EditableDemo() {
  const toolsRef = useRef<StayTools | null>(null)
  const cardRef = useRef<StayInstantChild<Rectangle> | null>(null)

  const mounted = (tools: StayTools) => {
    toolsRef.current = tools
    cardRef.current = tools.appendChild({
      id: "editable-card",
      className: "card",
      shape: new Rectangle({
        x: 40,
        y: 40,
        width: 160,
        height: 96,
        fillConfig: { color: { r: 219, g: 231, b: 255, a: 1 } },
      }),
    })
  }

  const moveRight = () => {
    cardRef.current?.shape.move(20, 0)
  }

  const remove = () => {
    const card = cardRef.current
    if (!card || !toolsRef.current) return
    toolsRef.current.removeChild(card.id)
    cardRef.current = null
  }

  return (
    <>
      <StayCanvas width={440} height={260} mounted={mounted} />
      <button onClick={moveRight}>向右移动</button>
      <button onClick={remove}>删除</button>
    </>
  )
}
```

Shape 的 `move`、`update`、`zoom` 等方法会通知所属 Child 和渲染器。通常不需要从 React state 重新创建整个场景。

## `mounted` 和实例生命周期

`StayTools` 只属于创建它的那一个 Canvas 实例：

- 组件首次初始化后会调用 `mounted`。
- 调用 ref 的 `reCreate()` 时，会销毁旧运行时并创建新实例，然后再次调用 `mounted`。
- 组件卸载后，不应继续使用此前保存的 Child 或 `StayTools`。

因此，重新创建时应让 `mounted` 重新填充场景，并用最新引用替换旧引用。

## 下一步

- 阅读[核心概念](./core-concepts.md)，理解 Child、Shape 和图层为什么分开。
- 打开[在线示例](https://lezhu1234.github.io/react-stay-canvas/)，从 Shapes、Children 和 Layers 三个简单示例开始。
- 事件、拖动、selector 和 Pointer Session 会在后续“交互与事件”文档中展开。

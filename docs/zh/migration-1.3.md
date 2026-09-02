# 从 1.2.0 迁移到 1.3.0

[文档首页](./README.md) · [English](../en/migration-1.3.md)

1.3.0 保留原有 Shape、Child 与 Listener 模型，同时增加了大量编辑器运行时能力。升级时有两项 Shape 行为必须处理：`Path` 的宽度配置，以及默认 `StayText` 锚点。如果应用依赖 Canvas 重建、重叠目标或键盘快捷键，也应检查后面的行为变化。

## 升级前

- 迁移期间固定使用 `react-stay-canvas@1.3.0`，不要立即使用版本范围。
- 运行应用的 TypeScript 构建；新版声明更准确地公开了坐标空间、Child placement、类型化 Store 和受支持的 Child 更新边界。
- 在真实产品流程中验证创建、选择、拖动、Canvas 外释放、resize、undo、redo、zoom 和 pan。
- 不要只为同步选中态或几何数据而通过 React state 重建 `<StayCanvas>`。保持 Canvas runtime 挂载，并在明确的操作边界同步应用状态。

## 必须修改的代码

### 替换 Path radius

`Path` 现在用一个原生 stroked `Path2D` 绘制。被移除的 `radius` 表示旧路径宽度的一半，因此迁移到 `strokeConfig.lineWidth` 时应乘以二。

```ts
// 1.2.0
new Path({
  points,
  radius: 5,
  fillConfig: {
    color: "#2563eb",
  },
})
```

```ts
// 1.3.0：保持总宽度为 10
new Path({
  points,
  strokeConfig: {
    color: "#2563eb",
    lineWidth: 10,
    lineCap: "round",
    lineJoin: "round",
  },
})
```

`Path` 不再接受 `fillConfig`：请把旧的 `fillConfig.color` 迁移到 `strokeConfig.color`，否则 Path 将不可见。只有几何本身确实是闭合可填充区域时才改用 `Polygon`。Path 的边界和命中宽度都由 `strokeConfig.lineWidth` 的一半推导；zoom 会同时缩放点与线宽。

### 采用原生 StayText 锚点

在 1.2.0 中，默认的 `start + alphabetic` 会把 `(x, y)` 当成文字框的上边中点。1.3.0 始终把 `(x, y)` 解释为 `textAlign` 与 `textBaseline` 共同决定的 Canvas 文字锚点。

```ts
// 1.2.0：(x, y) 表现为文字框上边中点
new StayText({ x, y, text: "Node" })
```

```ts
// 1.3.0：显式保持原来的视觉位置
new StayText({
  x,
  y,
  text: "Node",
  textAlign: "center",
  textBaseline: "top",
})
```

已经显式传入 alignment 与 baseline 的调用方应保留这些值，并重新验证测量边界。绘制、边界、移动、缩放和时间轴插值现在共享同一个原生锚点。

## 需要检查的行为变化

### Resize 会保留运行时状态

修改 `width` 或 `height` 现在会调整现有 Canvas 和 backing store，同时保留 Child、Content 几何、Listener、历史与 viewport 状态。只有应用明确希望 `mounted()` 重建场景时才设置 `recreateOnResize`。

### 目标顺序已经确定

Listener 未提供 `sortBy` 时，重叠的普通 Child 按合并边界面积升序参与命中；面积相同则遵循场景插入顺序；root Child 最后兜底。产品有自己的层叠规则时应显式传入：

```ts
const listener: ListenerProps = {
  name: "select-frontmost",
  event: "mousedown",
  selector: ".node",
  sortBy: (a, b) => b.shape.zIndex - a.shape.zIndex,
  callback: ({ e }) => selectNode(e.target),
}
```

工具查询不会继承这套 Listener 默认规则；查询未传 comparator 时仍保持既有的 selector 结果顺序。

### 键盘历史快捷键支持 Meta

预定义 `undo` 和 `redo` action 除了 Windows/Linux 的 Control，现在也识别 macOS 的 Command/Meta。它们仍然只是 action 名；应用 Listener 仍需决定是否调用 `tools.undo()` 或 `tools.redo()`。跨平台平移应使用 Space + 主键拖动；旧的 Control move 条件仅为兼容性保留。

## 新增的可选能力

应用状态可以直接加入现有场景历史，不再需要隐藏 Child：

```tsx
<StayCanvas
  historyAdapter={{
    capture: () => structuredClone(documentRef.current),
    restore: (snapshot) => replaceDocument(snapshot),
  }}
/>
```

`tools.log()` 仍是事务提交边界。`resetHistory()` 建立新的场景/应用状态基线；`canUndo()` 与 `canRedo()` 查询已提交的游标状态。

Listener Store 可以继续不声明类型，也可以在仍使用原生 Map 的前提下获得按 key 推导 value 的能力：

```ts
type RuntimeStore = {
  selectedId: string | null
  dirty: boolean
}

type ToolStateStore = {
  hoveredId: string | null
}

type SelectListener = ListenerProps<
  ListenerNamePayloadPair,
  "mousedown",
  Record<string, never>,
  RuntimeStore,
  ToolStateStore
>
```

其他可选新增能力包括坐标/viewport 工具、仿射或投影 Child placement、`StayInstantChild.update()`、`Polygon`、可重复使用且脱离源 Canvas 的场景片段，以及 Canvas2D/WebGL2 混合图层。只采用应用真正拥有的部分；基础 Canvas2D 场景不依赖这些新增能力。

## 升级检查清单

- 替换所有 `Path.radius`，把 `Path.fillConfig.color` 迁移到 `Path.strokeConfig.color`，并移除 `Path.fillConfig`。
- 检查使用默认 alignment 的 `StayText` 位置与边界。
- 决定 resize 应保留还是重建运行时。
- 产品 z-order 需要覆盖新默认顺序时，显式添加 `sortBy`。
- 验证 macOS 的 Command-Z / Command-Shift-Z，以及 Windows/Linux 的 Control 组合。
- 确认 React state 更新不会重建 Canvas runtime。
- 扩大依赖版本范围前，跑通完整编辑、历史与 viewport 流程。

# 场景与 StayTools

[English](../en/scene-and-tools.md) · [文档首页](./README.md) · [交互与事件](./interaction-and-events.md)

每个 `StayCanvas` 实例都有独立的 `StayTools`。它是应用代码读取和修改场景的唯一高层入口：创建对象、查询对象、平移缩放、记录历史、复制场景、截取区域以及手动触发动作都从这里开始。

## 获取当前 Canvas 的工具

最常见的入口是 `mounted`：

```tsx
const toolsRef = useRef<StayTools | null>(null)

<StayCanvas
  width={720}
  height={420}
  mounted={(tools) => {
    toolsRef.current = tools
  }}
/>
```

`StayTools` 只属于这个 Canvas。不要用源 Canvas 的 tools 去操作目标 Canvas 中的 Child，也不要在组件卸载后继续调用旧引用。

## 创建、读取和删除

```ts
const child = tools.appendChild({
  id: "node-a",
  className: "node:selected",
  shape: new Rectangle({ x: 20, y: 20, width: 120, height: 72 }),
})

tools.hasChild("node-a")
tools.getChildById<Rectangle>("node-a")
tools.getChildBySelector<Rectangle>("#node-a")
tools.getChildrenBySelector<Rectangle>(".node")

await tools.removeChild(child.id)
```

`getChildrenWithoutRoot()` 返回应用创建的所有 Child。内部 root Child 代表 Canvas 边界，不应删除；需要做全场景遍历时通常也应排除它。

应用可以自行选择业务 Child，合并它们的 Content 边界，再显式适配到当前 View：

```ts
const children = tools.getChildrenBySelector(".node|.edge")
const bounds = unionRects(children.map((child) => child.getBound()))

if (bounds) tools.viewport.fit(bounds, { padding: 32 })
```

库负责几何和 viewport 计算；哪些 Child 属于业务场景、何时触发适配，仍由应用决定。

## 不改写几何地放置单个 Child

每个 Child 只拥有一份局部坐标到 Content 的 `placement`。仿射 placement 可以使用语义字段：

```ts
const plane = tools.appendChild({
  className: "plane",
  placement: {
    type: "affine",
    x: 180,
    y: 96,
    rotation: -6,
    skewX: -18,
    scaleY: 0.78,
    origin: { x: 0, y: 0 },
  },
  shape: [background, ...gridLines, label],
})

plane.setPlacement({ type: "affine", x: 220, y: 120, rotation: 12 })
const local = plane.toLocalPoint(e.point)
const content = local && plane.toContentPoint(local)
```

`x`、`y`、`origin`、缩放、旋转和倾斜共同定义非破坏性的仿射 placement。旋转和倾斜使用角度制。矩阵按 `translate(x, y) · translate(origin) · rotate · skew · scale · translate(-origin)` 组合。`scaleX`、`scaleY` 默认是 `1`，其余值默认是 `0`。

高级仿射调用方可以传 `{ type: "affine", matrix: { a, b, c, d, e, f } }`。透视平面可以把有限局部矩形映射到四个具名的 Content 顶点：

```ts
plane.setPlacement(projectivePlacementFromQuad(
  { x: 0, y: 0, width: 320, height: 180 },
  {
    topLeft: { x: 24, y: 18 },
    topRight: { x: 350, y: 42 },
    bottomRight: { x: 332, y: 210 },
    bottomLeft: { x: 12, y: 232 },
  }
))
```

`projectivePlacementFromQuad()` 返回与 `appendChild()`、`createChild()`、`setPlacement()` 相同的公开 `{ type: "projective", matrix, domain }` placement；已经持有单应矩阵的调用方仍可直接传原始 placement。四个顶点按顺时针具名，工具只负责构造并验证有限映射，不替应用决定绘制或交互行为。

projective domain 必须有限、宽高为正，并始终位于齐次地平线同一侧；域外点映射为 `undefined`。`child.placement` 返回带判别字段的快照；`setPlacement()` 完整替换 placement，不合并字段。绘制、边界、命中、工具查询、事件路由、历史、场景传输和区域截图都读取同一份值。`e.point` 继续使用 Content。

静态 placement 变更会进入下一次 `log()` 事务。Animated Child 可以使用一份静态 placement，但当前不包含 placement 关键帧或插值。

## selector 查询

工具查询使用下面的 selector 表达式。Listener 的 `selector` 接受相同的字符串表达式，但不接受字符串数组或 selector 函数：

- `#node-a`：按 id；
- `.node`：按基础 className；也会匹配 `node:selected` 这样的冒号后缀；
- `.node:selected`：只匹配完整 className；
- `#node-a|.label`：并集；
- `#node-a&.node`：id 与基础 class 的交集；
- `.node&!#node-a`：从 node 中排除一个 id；
- 括号控制组合顺序；
- `(child) => boolean`：仅用于工具查询 API 的复杂过滤。

```ts
const selectedNodes = tools.getChildrenBySelector(
  ".node:selected",
  (a, b) => b.shape.zIndex - a.shape.zIndex,
)
```

`sortBy` 会影响返回顺序，也会影响 `getContainPointChildren({ returnFirst: true })` 选中的第一项。把排序规则写成稳定函数，避免重叠对象在不同调用中选择不一致。

## 点命中与区域查询

```ts
const [frontmost] = tools.getContainPointChildren<Rectangle>({
  selector: ".node",
  point: { x: 180, y: 120 },
  sortBy: (a, b) => b.shape.zIndex - a.shape.zIndex,
  returnFirst: true,
  withRoot: false,
})

const inside = tools.getChildrenByArea(
  { x: 40, y: 40, width: 300, height: 200 },
  ".node",
)
```

`getContainPointChildren()` 调用每个 Child 的 `containsPointer()`。它依赖 Shape 的 `contains()`，所以文字和线段等默认不可命中的 Shape 需要由同一 Child 中的可命中几何体提供交互区域。

`getChildrenByArea()` 当前判断每个 Shape 的中心点是否落在区域内，不等同于“边界框完全包含”或“矩形相交”。如果产品需要框选相交语义，应在函数 selector 或业务层中明确实现并测试。

## 整体平移

在一次连续平移开始前调用 `moveStart()` 保存所有 Shape 的起点，然后以手势起点为参照调用 `move()`：

```ts
tools.moveStart()

await tools.move(offsetX, offsetY, (child) => {
  return child.id !== "fixed-toolbar"
})
```

`filter` 返回 `false` 的非 root Child 不移动。root Child 始终参与全局变换，用来保持场景坐标和 Canvas 边界一致。

如果只移动一个对象，调用对应 Child 的 `moveInit()` 和 `move()`，不要遍历整个场景。

## 以指定中心缩放

```ts
await tools.zoom(deltaY, { x: pointerX, y: pointerY }, (child) => {
  return !child.className.includes("screen-ui")
})
```

`deltaY` 沿用滚轮方向约定：内部缩放因子是 `1 + deltaY * -0.001`。因此负值放大，正值缩小。中心点使用 Canvas 局部坐标。

`StayTools` 提供了 `reset()`，但它会复用旧的移动快照，因此当前不能在场景移动后可靠执行逆变换。不要把它作为“恢复初始状态”的入口；详见[当前限制](./known-limitations.md#场景操作)。

## 历史记录

历史不是自动事务。一次业务操作完成后显式调用 `log()`：

```ts
const child = tools.appendChild({
  className: "annotation",
  shape: new Rectangle({ x: 20, y: 20, width: 80, height: 60 }),
})

tools.log()

await tools.removeChild(child.id)
tools.log()

tools.undo()
tools.redo()
```

编辑器完成初始化后，可在加载不可撤销的背景内容之后调用 `resetHistory()`。它会清空 undo/redo，并把当前静态场景作为新的历史基线。

边界规则：

- `appendChild()`、`removeChild()`、正常 Shape 变更和 `child.setPlacement()` 都会把静态 Child 标记为待记录；
- `log()` 把从上一次快照到当前状态的变化组成一个历史项；
- `resetHistory()` 清空 undo/redo，并把当前静态场景设为基线；
- 多个变更后只调用一次 `log()`，它们会成为同一个撤销单位；
- `undo()` 后再记录新操作，会截断旧的 redo 尾部；
- 动画 Child 不进入历史，移除后也不会被 undo 恢复；
- `undo()` 和 `redo()` 会恢复当时的 Canvas state。

## 在 Canvas 之间复制场景

`exportChildren()` 把所选 Child 的当前 Shape 状态捕获为可复用的场景片段；`importChildren()` 在目标区域实例化该片段：

```ts
const scene = sourceTools.exportChildren({
  children: sourceTools.getChildrenBySelector(".asset"),
  area: { x: 0, y: 0, width: 360, height: 220 },
})

targetTools.importChildren(scene, {
  x: 24,
  y: 24,
  width: 720,
  height: 440,
})
```

目标区域与源区域必须保持相同宽高比，否则会抛出 `area not match`。每个导出 Child 片段包含 `sourceId`、`className`、`shapes` 和解析后的局部到 Content `placement`。导入会创建新的运行时 Child id；`sourceId` 只用于关联导入对象与源对象。

这是场景传输路径，不是序列化格式。公共 Shape 状态和库拥有的可变样式值会被独立捕获；`shapeStore` 中的任意值仍然共享，因为库无法推断它们的所有权。Animated Child 只提供当前渲染投影，不传输时间线。

`importChildren()` 会先实例化新的 Shape，再对它们执行 move/zoom，因此可以把同一个 exported payload 重复导入不同 Canvas 或目标区域，输入数据不会被修改。

如果 `exportChildren()` 省略 `area`，会使用源 Canvas 的 root 边界。如果 `importChildren()` 省略目标区域，会使用目标 Canvas 的 root 边界。

## 把区域渲染到独立 Canvas

```ts
const snapshotCanvas = await tools.regionToTargetCanvas({
  area: { x: 0, y: 0, width: 360, height: 220 },
  targetSize: { width: 720, height: 440 },
  children: tools.getChildrenWithoutRoot(),
})

const png = snapshotCanvas.toDataURL("image/png")
```

`regionToTargetCanvas()` 返回一个未挂载到 DOM 的 `HTMLCanvasElement`。它会裁剪到 `area`，再把该区域等比缩放并居中放入 `targetSize`；宽高比不同时，剩余区域保持透明。绘制顺序仍按 Shape 的 layer 和 `zIndex` 决定，调用过程不会移动或缩放源 Child。

传入 `progress` 时，动画 Child 会临时投影到对应毫秒时间，包括 `progress: 0`；静态 Child 保持不变。输出完成后会恢复动画 Child 原有的当前投影，因此截帧不会改变现场播放位置。

## 其他工具

```ts
tools.changeCursor("grabbing")
tools.refresh()
tools.switchState("editing")
tools.deleteListener("temporary-listener")
```

- `changeCursor()` 修改顶层 Canvas 的 CSS cursor；
- `refresh()` 强制所有层重绘；Shape 更新会自动标记受影响的 layer，外部资源变化或诊断时可显式调用；
- `switchState()` 切换 Listener state，并清空 `stateStore`；
- `deleteListener()` 按 Listener 的唯一名称删除监听器；
- `getAvailiableStates()` 返回符合状态表达式的已知 state。这个公开名称当前保留了历史拼写，调用时必须按现有名称书写。

手动动作的 `triggerAction()` 和 React ref 的 `trigger()` 涉及事件输入契约，见[交互与事件：手动触发](./interaction-and-events.md#手动触发动作)。

## 下一步

- [StayTools API](./api/stay-tools.md)
- [StayCanvas API](./api/stay-canvas.md)
- [Transfer 示例](https://lezhu1234.github.io/react-stay-canvas/#/simple/transfer)
- [History 示例](https://lezhu1234.github.io/react-stay-canvas/#/simple/history)

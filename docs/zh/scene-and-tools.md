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

边界规则：

- `appendChild()` 和 `removeChild()` 会把静态 Child 标记为待记录；
- `log()` 把从上一次快照到当前状态的变化组成一个历史项；
- 多个变更后只调用一次 `log()`，它们会成为同一个撤销单位；
- `undo()` 后再记录新操作，会截断旧的 redo 尾部；
- 动画 Child 不进入历史，移除后也不会被 undo 恢复；
- `undo()` 和 `redo()` 会恢复当时的 Canvas state。

纯 Shape `update()` 不会自动把 Child 加入待记录集合，因此只在拖动结束时调用 `log()` 不能可靠地记录已经存在对象的移动。需要可撤销更新时，应用必须像 Annotator 示例一样用同 id 的 remove/append replacement 建立显式历史差异。不要假定 `log()` 会扫描全部 Child。

## 在 Canvas 之间复制场景

`exportChildren()` 调用每个 Child 当前的 `copy()` 实现，并返回这些副本和源区域；`importChildren()` 把它们映射到目标区域：

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

目标区域与源区域必须保持相同宽高比，否则会抛出 `area not match`。导入会创建新的 Child id，并复制 className 和当前 `shapeMap`；不要依赖源 id 在目标 Canvas 中继续存在。

这是几何传输路径，不是完整保留状态的序列化格式。内置 copy 当前会遗漏部分 Shape 公共状态，可能共享嵌套样式值，并把动画 Child 降级为静态快照。详见[当前限制](./known-limitations.md#场景操作)。

`importChildren()` 会先复制 `scene.children`，再对内部副本执行 move/zoom，因此可以把同一个 exported payload 重复导入不同 Canvas 或目标区域，输入数据不会被修改。

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

`regionToTargetCanvas()` 返回一个未挂载到 DOM 的 `HTMLCanvasElement`。它按 Shape 的 layer 和 `zIndex` 顺序强制绘制传入的 Children。传入 `progress` 时，动画 Child 会先推进到对应毫秒时间，包括 `progress: 0`；静态 Child 保持不变。

当前实现不会自动把 `area` 平移或缩放到 `targetSize`，因此它更接近“按当前场景坐标绘制到另一个 Canvas”。需要真正裁剪或缩放时，应先导出/导入到目标坐标系，或在业务层明确处理变换。

## 其他工具

```ts
tools.changeCursor("grabbing")
tools.refresh()
tools.switchState("editing")
tools.deleteListener("temporary-listener")
```

- `changeCursor()` 修改顶层 Canvas 的 CSS cursor；
- `refresh()` 强制所有层重绘；同层 Shape 更新会自动标记当前 layer，修改 Shape `layer` 后、外部资源变化或诊断时需要显式调用；
- `switchState()` 切换 Listener state，并清空 `stateStore`；
- `deleteListener()` 按 Listener 的唯一名称删除监听器；
- `getAvailiableStates()` 返回符合状态表达式的已知 state。这个公开名称当前保留了历史拼写，调用时必须按现有名称书写。

手动动作的 `triggerAction()` 和 React ref 的 `trigger()` 涉及事件输入契约，见[交互与事件：手动触发](./interaction-and-events.md#手动触发动作)。

## 下一步

- [StayTools API](./api/stay-tools.md)
- [StayCanvas API](./api/stay-canvas.md)
- [Transfer 示例](https://lezhu1234.github.io/react-stay-canvas/#/simple/transfer)
- [History 示例](https://lezhu1234.github.io/react-stay-canvas/#/simple/history)

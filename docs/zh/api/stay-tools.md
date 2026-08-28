# StayTools API

[English](../../en/api/stay-tools.md) · [场景与工具指南](../scene-and-tools.md)

`StayTools` 是 `BasicTools & InstantTools & AnimatedTools` 的统一接口。每个 Canvas 都同时拥有静态、动画和历史工具；不存在需要选择的运行模式。

## Child 与查询

| 方法 | 签名摘要 | 说明 |
| --- | --- | --- |
| `appendChild` | `({ id?, className, shape, placement? }) => StayInstantChild` | 添加静态 Child；shape 可为单个、数组或 Map |
| `removeChild` | `(childId) => Promise<void> \| void` | 删除 Child；root 不可删除 |
| `hasChild` | `(id) => boolean` | 按 id 判断存在 |
| `getChildrenWithoutRoot` | `() => StayInstantChild[]` | 返回应用 Child |
| `getChildById` | `(id) => StayInstantChild \| void` | 按 id 取一项 |
| `getChildBySelector` | `(selector) => StayInstantChild \| void` | 返回 selector 的第一项 |
| `getChildrenBySelector` | `(selector, sortBy?) => StayInstantChild[]` | selector 查询并可排序 |
| `getContainPointChildren` | `({ selector, point, ... }) => StayInstantChild[]` | 查询命中指定点的 Child |
| `getChildrenByArea` | `(area, selector?) => StayInstantChild[]` | 查询 Shape 中心位于区域内的 Child |

`getContainPointChildren` 选项：

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `selector` | 必填 | string、string[] 或函数 selector |
| `point` | 必填 | `ContentPoint` 场景坐标 |
| `returnFirst` | `false` | 是否最多返回排序后的第一项 |
| `sortBy` | — | 命中结果排序 |
| `withRoot` | `true` | 是否允许返回 root Child |

## 状态与显示

| 方法 | 说明 |
| --- | --- |
| `switchState(state)` | 切换 Canvas/Listener state，并清空 stateStore |
| `getAvailiableStates(selector)` | 返回符合表达式的已知 state；名称保留当前历史拼写 |
| `changeCursor(cursor)` | 设置顶层 Canvas cursor |
| `refresh()` | 强制所有 layer 重绘 |

## 场景变换

### 坐标转换

`tools.coordinates` 是 Client、View 与 Content 三个全局空间之间的统一转换入口。它不保存第二份 viewport 状态；每次调用都使用当前 Canvas 显示尺寸和当前 viewport。

| 方法 | 说明 |
| --- | --- |
| `clientToView(point)` | 浏览器 Client 点 → Canvas View 点 |
| `viewToClient(point)` | Canvas View 点 → 浏览器 Client 点 |
| `viewToContent(point)` | View 点 → 当前场景 Content 点 |
| `contentToView(point)` | Content 点 → 当前 Canvas View 点 |
| `clientToContent(point)` | 浏览器 Client 点 → 当前场景 Content 点 |
| `contentToClient(point)` | Content 点 → 浏览器 Client 点，适合定位 DOM 浮层 |
| `viewVectorToContent(vector)` | View 位移 → Content 位移；只应用缩放，不应用平移 |
| `contentVectorToView(vector)` | Content 位移 → View 位移；只应用缩放，不应用平移 |

包入口同时导出 `ClientPoint`、`ViewPoint`、`ContentPoint`、`ViewVector`、`ContentVector`、`ViewRect` 和 `ContentRect`。它们是零运行时成本的弱品牌类型：普通坐标和矩形值仍兼容现有 API，而由库返回、已经带空间语义的值不能误传给另一空间。点和向量也保持不同类型，因为点转换包含平移，向量转换不包含平移。

`tools.coordinates` 使用调用时的最新 viewport。事件中的 `e.point` 则是该次输入采样时固定下来的 Content 点；即使较早的 Listener 在同轮事件中改变 viewport，后续 Listener 看到的 `e.point` 也不会改变。

### 非破坏性 Child placement

`appendChild()` 和 `createChild()` 接收一份可选的判别式 placement。`{ type: "affine", x, y, rotation, scaleX, scaleY, skewX, skewY, origin }` 是语义形式；`{ type: "affine", matrix: { a, b, c, d, e, f } }` 是原始矩阵形式；`{ type: "projective", matrix: { m00, ..., m22 }, domain }` 定义有限透视平面。

`child.setPlacement(placement)` 替换完整 placement。`child.placement` 返回快照；`child.toLocalPoint(contentPoint)` 与 `child.toContentPoint(localPoint)` 显式跨越局部边界，projective 域外返回 `undefined`。矩阵必须有限且可逆。静态 placement 会进入历史和场景传输；当前尚不支持动画 placement 插值。

`projectivePlacementFromQuad(domain, quad)` 根据有限局部矩形以及具名的 `topLeft`、`topRight`、`bottomRight`、`bottomLeft` Content 顶点构造这份 projective placement。非有限、退化或跨越地平线的映射会被拒绝；已经持有单应矩阵的调用方仍可使用原始矩阵形式。

### 非破坏性视口

`tools.viewport` 改变 Content 在 View 中的显示位置，不修改 Child/Shape 几何，也不产生历史记录：

| 方法 | 说明 |
| --- | --- |
| `get()` | 返回 `{ x, y, scale }` 快照 |
| `panBy(viewMovement)` | 按 `ViewVector` 累加显示偏移 |
| `zoomBy(factor, contentAnchor?)` | 按正倍率缩放；anchor 是保持显示位置不变的 `ContentPoint`，默认使用 View 中心 |
| `fit(contentBounds, { padding? })` | 把一个 `ContentRect` 等比缩放并居中放入当前 View；padding 使用 View 像素 |
| `reset()` | 恢复 `{ x: 0, y: 0, scale: 1 }`（受 min/max 限制） |
| `restore(state)` | 恢复先前快照，并把 scale 限制在配置范围内 |
| `toClientPoint(contentPoint)` | `coordinates.contentToClient()` 的兼容入口 |

投影关系是 `View = Content × scale + (x, y)`。`fit()` 是显式的一次性操作：它不选择 Child，也不会在 append、import 或 resize 后自动重跑。配置的缩放范围优先于完整适配，但目标边界仍保持居中。边界可以只有宽或高为零，不能两者同时为零。各方法同步返回新的只读快照；Renderer 会在下一帧用同一份坐标快照重绘全部脏图层。

包入口还导出两个无状态矩形工具。`unionRects(rects)` 返回轴对齐并集，空输入返回 `undefined`，并保留输入矩形类型；`fitRect(source, target)` 返回等比缩放值和居中矩形，并保留 target 的矩形类型。因此组合工具时，已知的 View/Content 品牌不会丢失。viewport 适配与区域截图共用这套计算；哪些 Child 边界代表业务场景，仍由应用决定。

### 破坏性场景变换

| 方法 | 说明 |
| --- | --- |
| `moveStart()` | 保存全场景移动起点 |
| `move(offsetX, offsetY, filter?)` | 平移场景；filter 可排除非 root Child |
| `zoom(deltaY, center, filter?)` | 以 Canvas 局部点为中心缩放 |
| `reset()` | 执行当前基于 root 的逆变换；场景移动后并不可靠 |

这些旧方法直接修改 Child/Shape 坐标，适合确实需要烘焙几何的批处理，不是视口控制。`move()`、`zoom()`、`reset()` 返回下一次 runtime tick 完成的 Promise，不代表浏览器已经完成一帧合成。场景移动后，`reset()` 不能可靠地恢复初始状态；详见[当前限制](../known-limitations.md#场景操作)。

## 历史

| 方法 | 说明 |
| --- | --- |
| `log()` | 把待记录的静态 Child 差异（包括 Shape 变更）提交为一个历史项 |
| `undo()` | 撤销一个历史项；无可撤销项时只输出日志 |
| `redo()` | 重做一个历史项；无可重做项时只输出日志 |
| `resetHistory()` | 清空 undo/redo，并把当前静态场景作为新的历史基线 |

动画 Child 不参与历史。调用边界与示例见[场景与工具：历史记录](../scene-and-tools.md#历史记录)。

## 动画

| 方法 | 签名摘要 | 说明 |
| --- | --- | --- |
| `createChild` | `({ id?, className, placement? }) => StayAnimatedChild` | 创建带可选静态 placement 的动画 Child |
| `progress` | `({ timeMs, bound?, beforeDrawCallback?, afterDrawCallback? }) => DrawReturn` | 推进所有动画 Child 并立即绘制 |

`DrawReturn`：

```ts
interface DrawReturn {
  updatedLayers: number[]
  updatedChilds: Array<{
    child: StayInstantChild
    shapes: InstantShape[]
  }>
}
```

## 场景传输与输出

| 方法 | 说明 |
| --- | --- |
| `exportChildren({ children, area? })` | 把当前 Shape 捕获为可复用的 `SceneFragment` |
| `importChildren(scene, targetArea?)` | 等比例实例化片段，并生成新的运行时 id |
| `regionToTargetCanvas({ area, targetSize?, children, progress? })` | 把区域等比居中绘制到新的 HTMLCanvasElement；可无副作用截取动画帧 |

`CaptureSceneProps` 是导出参数；`SceneFragment` 包含 `area`，以及带 `sourceId`、`className`、`shapes`、`placement` 的 Child 片段。`sourceId` 只作为关联元数据，不会复用为导入 Child 的 id。

场景传输会捕获公共 Shape 状态并隔离库拥有的样式容器。Animated Child 只捕获当前投影，不作为时间线序列化格式。

## 动作与 Listener

| 方法 | 说明 |
| --- | --- |
| `triggerAction(originEvent, triggerEvents, payload)` | 用显式原生 Event、普通 action 数据和业务 payload 手动路由动作 |
| `deleteListener(name)` | 删除命名 Listener |

```ts
tools.triggerAction(
  new Event("save"),
  { save: { info: { state: "editing" } } },
  { documentId: "doc-1" },
)
```

`triggerEvents.*.info` 不能是原生 Event；跨 iframe 的原生 Event 也会被拒绝。完整契约见[手动触发动作](../interaction-and-events.md#手动触发动作)。

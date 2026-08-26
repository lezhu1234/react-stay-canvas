# StayTools API

[English](../../en/api/stay-tools.md) · [场景与工具指南](../scene-and-tools.md)

`StayTools` 是 `BasicTools & InstantTools & AnimatedTools` 的统一接口。每个 Canvas 都同时拥有静态、动画和历史工具；不存在需要选择的运行模式。

## Child 与查询

| 方法 | 签名摘要 | 说明 |
| --- | --- | --- |
| `appendChild` | `({ id?, className, shape, transform? }) => StayInstantChild` | 添加静态 Child；shape 可为单个、数组或 Map |
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
| `point` | 必填 | Canvas 局部坐标 |
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

### 非破坏性 Child 变换

`appendChild()` 和 `createChild()` 可接收语义化 `{ x, y, rotation, scaleX, scaleY, skewX, skewY, origin }` transform，也可以使用高级原始 `{ matrix: { a, b, c, d, e, f } }`。旋转和倾斜使用角度制。该变换把 Child 局部 Shape 几何映射到 Content，不修改 Shape 属性。

`child.setTransform(transform)` 替换完整变换。`child.transform` 返回解析后的矩阵快照；`child.toLocalPoint(contentPoint)` 与 `child.toContentPoint(localPoint)` 用于显式跨越局部边界。矩阵必须是有限且可逆的。静态 transform 会进入历史和场景传输；当前尚不支持动画 transform 插值。

### 非破坏性视口

`tools.viewport` 改变 Content 在 View 中的显示位置，不修改 Child/Shape 几何，也不产生历史记录：

| 方法 | 说明 |
| --- | --- |
| `get()` | 返回 `{ x, y, scale }` 快照 |
| `panBy({ x, y })` | 按 View 单位累加显示偏移 |
| `zoomBy(factor, anchor?)` | 按正倍率缩放；`anchor` 是保持显示位置不变的 Content 点，默认使用 View 中心 |
| `reset()` | 恢复 `{ x: 0, y: 0, scale: 1 }`（受 min/max 限制） |
| `restore(state)` | 恢复先前快照，并把 scale 限制在配置范围内 |
| `toClientPoint(point)` | 把 Content 点投影为浏览器 Client 坐标，适合定位 DOM 浮层 |

投影关系是 `View = Content × scale + (x, y)`。各方法同步返回新的只读快照；Renderer 会在下一帧用同一份坐标快照重绘全部脏图层。

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
| `createChild` | `({ id?, className, transform? }) => StayAnimatedChild` | 创建带可选静态 transform 的动画 Child |
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

`CaptureSceneProps` 是导出参数；`SceneFragment` 包含 `area`，以及带 `sourceId`、`className`、`shapes`、`transform` 的 Child 片段。`sourceId` 只作为关联元数据，不会复用为导入 Child 的 id。

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

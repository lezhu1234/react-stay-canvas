# StayTools API

[English](../../en/api/stay-tools.md) · [场景与工具指南](../scene-and-tools.md)

`StayTools` 组合了 `BasicTools`、`InstantTools`、`AnimatedTools` 与原生 `webgl` namespace。每个 Canvas 都同时拥有静态、动画、历史和原生场景工具；不存在需要选择的运行模式。

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

## 原生 WebGL2 场景

`tools.webgl` 在同一实例、同一 identity store 中管理原生 Mesh Child。一个 `StayWebGLChild` 在一个 WebGL2 图层上拥有有序 Mesh 列表；Mesh 几何、模型矩阵与材质以 CPU 状态为准，修改后会标脏对应图层。

`Mesh` 默认使用不透明的 `UnlitMaterial`。`LambertMaterial` 与 `GlassMaterial` 要求显式非零的逐顶点 normals；法线会被复制、在 shader 中归一化，并通过 model matrix 的逆转置进行变换。Material 是不可变值，更新时使用 `mesh.setMaterial()` 替换，不共享可变材质状态：

```ts
const mesh = new Mesh({
  geometry: {
    positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    indices: [0, 1, 2],
  },
  material: new LambertMaterial({ color: [0.2, 0.55, 0.9, 1] }),
  castShadow: true,
  receiveShadow: true,
})

const glass = new GlassMaterial({
  color: [0.6, 0.85, 1, 0.2],
  ior: 1.46,
  roughness: 0.24,
  thickness: 0.18,
})
mesh.setMaterial(glass)
```

`UnlitMaterial` 与 `LambertMaterial` 都不透明，color alpha 必须为 `1`。`GlassMaterial` 的 alpha 必须严格位于 `0` 与 `1` 之间，`ior` 必须大于 `1`（默认 `1.5`），`roughness` 位于 `0` 到 `1`（默认 `0`），`thickness` 是非负的 world-space 距离（默认 `0.1`）。renderer 会用这些值计算带光照的 Fresnel 边缘，以及对本图层 opaque WebGL2 scene color 的屏幕空间折射。roughness 会选择逐级过滤后的 scene-color 和 environment mip：零表示清晰，一表示使用可用的最宽模糊。厚度为零时仍保留透射和 Fresnel，只是不偏移屏幕采样位置。

Scene-color 折射刻意限制在当前图层内：它可以扭曲同一 WebGL2 图层中更早绘制的 opaque Mesh。WebGL2 layer config 提供 `EnvironmentMap` 时，Glass 还会按 world-space 经纬反射方向采样它，并使用同一个 roughness LOD。environment 属于图层显示状态，不进入 Material History 或场景传输。折射仍不能采样 Canvas 后面的 DOM/CSS 内容或其他透明 Mesh；当前 LDR mip-chain 模型也不提供 HDR 预过滤辐射、吸收或物理多表面透射。

renderer 会先画所有 opaque Mesh。Glass Mesh 保持 depth test、关闭 depth write，再按局部包围盒中心变换到相机 view space 后的深度稳定地从远到近绘制。这是行业常用的对象级透明方案：彼此分离、不相交的表面能稳定合成；相交透明 Mesh 和自身重叠几何仍可能需要拆分 geometry，或等待后续 order-independent transparency。

阴影行为是显式的 CPU Mesh 状态。`castShadow` 与 `receiveShadow` 都默认 `false`，运行时分别通过 `setCastShadow()`、`setReceiveShadow()` 修改。带光照的 receiver 会采样图层方向光的 shadow map；Glass 可以接收阴影。若对 Glass 显式开启投影，当前只承诺二值几何轮廓，不模拟彩色或透射阴影。History 与场景传输会保留阴影标志，且修改标志不会推进 geometry revision。

未配置任何 Light 时 Lambert 会变暗。Glass 仍保留 scene-color 透射和 Fresnel 边缘，但直接受光的 tint 会变暗；需要这部分表面光照时请显式添加环境光或方向光，不依赖隐藏的默认灯组。

| 方法 | 说明 |
| --- | --- |
| `webgl.appendChild({ id?, className, layer, meshes? })` | 向已配置的 WebGL2 图层添加原生 Mesh Child |
| `webgl.removeChild(id)` | 删除原生 Child，并释放订阅和对应 GPU cache 项 |
| `webgl.hasChild(id)` / `getChildById(id)` | 查询原生 identity，不混入 Shape 专用工具 |
| `webgl.getChildBySelector(selector)` | 返回第一个原生 selector 匹配 |
| `webgl.getChildrenBySelector(selector, sortBy?)` | 使用共享 selector 语言查询原生 Child |
| `webgl.exportChildren(children)` | 捕获带 source id、深度隔离的 CPU Mesh 片段 |
| `webgl.importChildren(fragment)` | 生成新的 Child id 与独立 Mesh 状态 |

包入口导出 `Mesh`、`UnlitMaterial`、`LambertMaterial`、`GlassMaterial`、`EnvironmentMap`、`AmbientLight`、`DirectionalLight`、`PerspectiveCamera`、`StayWebGLChild` 和最小 Matrix4 工具。GPU program、VAO、buffer、scene-color/environment/shadow target、shader 与 layer runtime 仍是内部实现。WebGL2 Child picking/raycast、通用材质纹理、彩色/透射阴影、order-independent transparency 和 Canvas 截图暂不属于这个接口。

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
| `log()` | 把待记录的静态 Child 差异（包括 Shape 或 Mesh 变更）提交为一个历史项 |
| `undo()` | 撤销一个历史项；无可撤销项时只输出日志 |
| `redo()` | 重做一个历史项；无可重做项时只输出日志 |
| `resetHistory()` | 清空 undo/redo，并把当前静态场景作为新的历史基线 |

Canvas2D 与 WebGL2 静态 Child 进入同一 History 事务和 id 命名空间；Camera、EnvironmentMap 与 Light 修改属于图层显示状态，不进入历史。动画 Child 不参与历史。调用边界与示例见[场景与工具：历史记录](../scene-and-tools.md#历史记录)。

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

原生 Mesh 没有 2D area/placement 变换，因此使用独立的 `tools.webgl.exportChildren()` 与 `tools.webgl.importChildren()`；Camera、EnvironmentMap 与 Light 由目标图层配置拥有，不进入片段。

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

# StayCanvas API

[English](../../en/api/stay-canvas.md) · [API 首页](../README.md#api-参考) · [快速开始](../getting-started.md)

```ts
import {
  AmbientLight,
  DirectionalLight,
  StayCanvas,
  PerspectiveCamera,
  type CanvasLayerConfig,
  type StayCanvasProps,
  type StayCanvasRefType,
  type WebGL2LayerConfig,
} from "react-stay-canvas"
```

`StayCanvas` 创建一个 React 容器和一组绝对定位、尺寸相同的 `<canvas>` 图层。场景内容不通过 React children 传入，而是在 `mounted` 或事件回调中使用 `StayTools` 创建。

## Props

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `width` | `number` | `500` | CSS 尺寸和 View 逻辑宽度，必须大于 0 |
| `height` | `number` | `500` | CSS 尺寸和 View 逻辑高度，必须大于 0 |
| `layers` | `number \| CanvasLayerConfig[]` | `2` | Canvas 层数，或逐层指定 Canvas2D/WebGL2 配置 |
| `className` | `string` | `""` | 外层 `<div>` 的 className |
| `eventList` | `EventProps[]` | `[]` | 初始化时注册的 Event 定义 |
| `listenerList` | `ListenerProps[]` | `[]` | 初始化时注册的 Listener |
| `mounted` | `(tools: StayTools) => void` | — | 每次运行时创建完成后调用 |
| `passive` | `boolean` | `true` | wheel DOM listener 的 passive 选项 |
| `recreateOnResize` | `boolean` | `false` | width/height 改变时是否显式采用破坏性重建 |
| `focusOnInit` | `boolean` | `true` | 初始化后是否聚焦顶层 Canvas |
| `viewport` | `{ minScale?, maxScale? }` | `{ minScale: 0.1, maxScale: 10 }` | 非破坏性视口缩放范围；创建运行时后固定 |

### layers

传入数字时，每层使用 `canvas.getContext("2d")`：

```tsx
<StayCanvas width={720} height={420} layers={3} />
```

原有的函数数组形式会为每个数组项创建一个 Canvas，并把该 Canvas 传给对应函数；函数必须返回可用的 2D 绘制 context。判别式 descriptor 可以显式选择 backend，也可以和原有函数混用。原生 WebGL2 图层必须拥有一台 CPU Camera：

```tsx
<StayCanvas
  layers={[
    { backend: "canvas2d" },
    {
      backend: "webgl2",
      camera: new PerspectiveCamera({ position: [0, 0, 3], target: [0, 0, 0] }),
      lights: [
        new AmbientLight({ intensity: 0.25 }),
        new DirectionalLight({ directionToLight: [0, 0, 1], intensity: 0.8 }),
      ],
      context: (canvas) => canvas.getContext("webgl2", { alpha: true, depth: true }),
      onContextRestored: () => console.info("WebGL2 layer restored"),
    },
  ]}
/>
```

Canvas2D 仍是默认 backend。WebGL2 是显式 opt-in 的原生 Mesh 场景，不再是 Shape 栅格后端。Mesh Child 通过 `tools.webgl.appendChild()` 添加；Canvas2D Shape 只能进入 Canvas2D 图层，`StayWebGLChild` 则只占用一个 WebGL2 图层。不透明 Mesh 的可见性由 depth 决定；Glass Mesh 保持 depth test，并在 opaque pass 后稳定地从远到近排序。Shape `zIndex` 不跨 backend 比较。

`lights` 是可选的图层显示状态。`AmbientLight`、`DirectionalLight` 的修改与 Camera 修改一样，只会标脏拥有它们的 WebGL2 图层；它们不进入 Child History 或场景传输。一个图层当前最多接受四个方向光。`directionToLight` 表示从表面指向光源的 world-space 向量，Light 会把它归一化。

backend 失败不会被隐藏。WebGL2 创建失败、绘制期间 context loss、无效 Mesh 状态和 GPU 上传失败都不会自动回退到 Canvas2D。WebGL2 context 丢失后，该层暂停绘制。Layer runtime 默认阻止原生 loss event，以便浏览器恢复它拥有的 context；`onContextLost` 只负责观察，不承担恢复所有权。恢复后运行时会丢弃失效 GPU handle，从 CPU Mesh 状态懒重建，标脏该层，再调用 `onContextRestored`。

数组至少需要一项。普通 React rerender 中替换 descriptor 不会迁移已存在的运行时；backend 或生命周期回调变化时应调用 `reCreate()`。

Shape 的 `layer` 从 0 开始，并且只能指向 Canvas2D 图层。负 Shape layer 会从末层换算，例如 `-1` 表示最后一层。`StayWebGLChild.layer` 必须是非负的 WebGL2 图层索引；backend 不匹配或越界会同步失败。

### eventList 与 listenerList 的生命周期

这些列表在运行时创建时读取。仅让 React 重新渲染并替换数组，不会自动迁移已存在的运行时注册项。需要使用新定义时：

1. 保证最新 props 已渲染；
2. 调用 ref 的 `reCreate()`；
3. 在新的 `mounted` 回调中重新建立场景和外部引用。

`reCreate()` 会销毁旧输入监听、渲染循环和场景对象。旧 `StayTools`、Child 与 Shape 引用随后都应视为失效。

### recreateOnResize

默认 `false` 时，有效的 width/height 变化会直接调整现有运行时。Canvas DOM、`StayTools`、Child、Shape、placement、历史、状态、listener 和 viewport 状态都保留原来的身份与值。Content 几何不会自动缩放、移动或重新布局：缩小时只会裁掉更多 Content，扩大后会显示更多 Content。Root 的命中边界跟随新的 View 尺寸，而 Root Shape 表示的 Content 边界保持不变。

resize 会重设每个原生 Canvas 的位图，然后重新调用各层最初的 context resolver。Canvas2D 图层会使用新的 `ShapeDrawProps.width/height` 重绘；WebGL2 图层保留仍有效的 program/buffer cache，并在下一次脏帧使用新的 drawing-buffer aspect。若 resize 时存在活动 Pointer Session，运行时会先用旧坐标帧中的最后一个点取消该会话，并给出 `cancelReason: "resize"`。

设为 `recreateOnResize={true}` 后，每次有效尺寸变化会改为销毁旧实例、创建新实例并再次调用 `mounted`。只应在应用明确需要重新创建或布局整个场景时使用；此前的运行时和 Child 引用随后失效。

### passive

`passive` 当前只传给 wheel DOM listener。若 Listener 或 Event 需要对 wheel 的 `originEvent` 调用 `preventDefault()`，必须设为 `false`：

```tsx
<StayCanvas passive={false} />
```

## Ref

```tsx
const canvasRef = useRef<StayCanvasRefType>(null)

<StayCanvas ref={canvasRef} />
```

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `trigger` | `(name, payload?) => void` | 用普通 `Event` 手动触发一个 action |
| `reCreate` | `() => void` | 销毁当前运行时并按最新 props 重建 |
| `focus` | `() => void` | 聚焦顶层 Canvas，使键盘事件可达 |

`trigger()` 不携带指针位置、键盘键值或命中 target。不要因为 action 名称是 `drag` 或 `click` 就假定这些字段存在；详见[手动动作](../interaction-and-events.md#手动触发动作)。

## DOM 结构与布局

外层容器使用：

```css
display: flex;
position: relative;
width: <width>px;
height: <height>px;
```

每个 Canvas 绝对定位到 `(0, 0)`。`width` 和 `height` 控制 View 逻辑尺寸与位图分辨率；父容器如果更宽，不会自动拉伸 Canvas。响应式布局有三种语义不同的方式：

- 传入新的数值尺寸来改变逻辑绘制尺寸；默认保留现有场景和 viewport。
- 只有尺寸变化必须重新创建和布局场景时，才开启 `recreateOnResize` 并在 `mounted` 中重建。
- 保持逻辑场景不变，对渲染后的 Canvas 或其外层应用正数、沿坐标轴的 CSS 缩放。原生指针输入会在事件路由前，从渲染边界换算为 Canvas 局部逻辑坐标。

第三种方式只改变显示，并不会提高位图分辨率。一次 Pointer Session 期间应保持 CSS 显示缩放稳定；单次交互过程中改变 CSS 布局不属于该合同。旋转、倾斜和镜像也不在该坐标行为的支持范围内。

`viewport` 不是 React 受控状态。运行时的平移、缩放和恢复由 [`tools.viewport`](./stay-tools.md#非破坏性视口) 完成；它只改变 Content 到 View 的投影，不修改 Child 或 Shape。

## 相关参考

- [核心概念：Canvas 和图层](../core-concepts.md)
- [交互与事件](../interaction-and-events.md)
- [StayTools API](./stay-tools.md)

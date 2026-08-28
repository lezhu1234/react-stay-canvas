# 核心概念

[文档首页](./README.md) · [English](../en/core-concepts.md)

`react-stay-canvas` 的重点不是把 Canvas API 包成 JSX，而是建立一个可持续修改和交互的场景模型。React 负责组件生命周期和应用界面；Canvas 运行时负责场景对象、绘制、命中测试和动作分发。

## 整体模型

```text
React application
└── StayCanvas
    ├── Canvas layer 0
    ├── Canvas layer 1
    ├── ...
    └── scene runtime
        ├── Child
        │   ├── Shape
        │   └── Shape
        ├── Child
        │   └── Shape
        ├── Event definitions
        ├── Listeners
        └── StayTools
```

理解这张图需要抓住三个边界：

- 图层解决绘制批次和整体前后关系。
- Child 是场景对象和交互目标。
- Shape 负责几何与绘制，一个 Child 可以包含一个或多个 Shape。

## `StayCanvas`：场景入口

`StayCanvas` 是 React 与 Canvas 运行时之间的边界。它负责：

- 创建指定数量的原生 Canvas 图层；
- 初始化事件和 Listener；
- 创建当前实例的 `StayTools`；
- 按配置在尺寸变化后重建运行时，并在主动重建或卸载时统一清理旧实例。

`StayCanvas` 的 `width` 和 `height` 决定场景坐标空间。`layers` 决定实际创建多少个叠放的 `<canvas>`，也可以逐层显式选择 Canvas2D 或 WebGL2。Canvas2D 是默认值；WebGL2 是必须配置 Camera 的 opt-in 原生 Mesh 场景。

场景内容不是 React 子节点。应在 `mounted`、Listener 回调或应用操作中通过 `StayTools` 和 Child/Shape 方法修改场景。

## Shape：几何和绘制

Shape 表示一个具体图形，例如：

- `Rectangle`
- `Circle`
- `Line`
- `StayText`
- `StayImage`

Shape 保存自己的几何、样式、图层和 `zIndex`，并负责：

- 绘制自身；
- 返回边界框和中心点；
- 判断一个坐标是否命中自身；
- 执行移动、缩放和属性更新；
- 在需要时计算动画中间状态。

Shape 不是独立的 selector 目标。它被添加到场景后归属于某个 Child。

## Child：场景对象和交互单位

Child 为一个或多个 Shape 提供共同的：

- `id`
- `className`
- 查询和 selector 身份
- 命中测试结果
- 整体边界框
- 移动和缩放入口
- 从局部空间到 Content 的非破坏性变换
- 历史记录身份

一个按钮可以由背景矩形和文字两个 Shape 组成，但它们应属于同一个 Child。这样点击文字或背景时，命中的都是同一个对象，移动时两部分也会一起移动。

```tsx
tools.appendChild({
  id: "save-button",
  className: "toolbar-button",
  shape: [
    new Rectangle({
      x: 32,
      y: 32,
      width: 140,
      height: 52,
      fillConfig: { color: { r: 49, g: 95, b: 207, a: 1 } },
    }),
    new StayText({
      x: 102,
      y: 58,
      text: "Save",
      textAlign: "center",
      textBaseline: "middle",
      fillConfig: { color: { r: 255, g: 255, b: 255, a: 1 } },
    }),
  ],
})
```

`child.shape` 返回这个 Child 的第一个 Shape，适合最常见的单 Shape Child。多 Shape Child 应使用 `child.shapeMap` 明确访问或遍历全部 Shape。

Child placement 把其中全部 Shape 从同一个局部对象映射到 Content，而不改写 Shape 几何；它可以是 affine，也可以是带有限 local domain 的 projective 平面。绘制、边界、点命中、区域查询、历史、场景传输和区域截图共享同一份 placement。公开指针 `e.point` 仍是 Content 坐标；只有需要局部几何时才调用 `child.toLocalPoint(e.point)`，并处理 projective 域外的 `undefined`。

## 图层与 `zIndex`

图层和 `zIndex` 处理的是两级顺序：

1. `layer` 决定 Shape 画在哪一个原生 Canvas 上；数值更大的图层整体显示在更上方。
2. `zIndex` 只比较同一图层中的 Shape。

因此，较低图层上的 Shape 无论 `zIndex` 多大，都不会盖住更高图层上的 Shape。

多 Shape Child 中的每个 Shape 都可以选择不同图层。例如连线图编辑器可以让边显示在底层、节点显示在上层，同时仍把节点矩形和文字组织成一个 Child。

每个原生图层只有一个 backend 所有者。Canvas2D 图层消费 Shape RenderPlan；WebGL2 图层通过一台 Camera 和持久 GPU cache 消费 `StayWebGLChild` Mesh。两类 Child 共享同一份 identity store、selector、脏层调度、History 事务、state 和场景传输所有权，但不共享几何与排序：Shape `zIndex` 只属于 Canvas2D，WebGL2 由原生 depth 决定遮挡。WebGL2 context loss 只暂停对应图层，也不会触发隐式 Canvas2D fallback。

## `StayTools`：当前实例的操作入口

`StayTools` 聚合了对当前场景的操作，主要分为几类：

- 创建和删除 Child；
- 按 id、selector、区域或坐标查询 Child；
- 切换场景 state；
- 平移、缩放和重置场景；
- 记录、撤销和重做静态内容；
- 创建和推进动画 Child；
- 导入、导出和截取场景内容；
- 主动触发动作或删除 Listener。

它是实例对象，不是全局服务。不要让不同 `StayCanvas` 共享同一个 `StayTools` 引用。

## selector：查找 Child

selector 匹配的是 Child 的 `id` 和 `className`：

- `.node`：匹配 `className` 为 `node` 的 Child（状态后缀形式如 `node:active` 也归入该类）
- `#node-a`：匹配 id 为 `node-a` 的 Child
- `.node|.label`：匹配两者之一
- `#node-a&.node`：同时匹配 id 和基础 class
- `.node&!#node-a`：匹配 node，但排除指定 id

同一套 selector 既可用于查询工具，也可限制 Listener 的目标。selector 不会直接返回某个 Shape；它返回符合条件的 Child。

`className` 不是 DOM 的空格分隔 class 列表。一个 Child 只有一个基础 class，并可用冒号附加后缀，例如 `node:active`；`.node` 会匹配它，`.node:active` 匹配完整值。

## state：控制哪些 Listener 生效

Canvas 运行时维护一个当前 state。Listener 可以声明只在某个 state 下生效，例如绘制模式和选择模式分别使用不同 Listener。

切换 state 不会自动修改场景内容。它改变的是哪些 Listener 可以处理接下来的动作，并重置 state 作用域内的临时存储。跨模式仍需保留的数据应放在持久 store 或应用自己的状态中。

## Event 与 Listener：输入和业务行为分离

事件系统分为两层：

- Event 定义决定动作如何从匹配的 DOM 输入中产生。
- Listener 根据事件名、state 和 selector 接收动作，并执行场景或应用逻辑。

手动动作会直接派发给 Listener，不会求值已注册的 Event 定义。公开 trigger 类型虽然包含 `"frame"`，但当前 renderer 不会发出该 trigger。

预定义事件已经覆盖 click、drag、move、wheel、键盘和历史快捷键等常见输入。多数应用只需要配置 Listener；只有需要改变触发条件或组合新动作时才需要自定义 Event。

拖动等连续交互还具有明确的开始、继续、结束和取消生命周期。Pointer 离开 Canvas 后的释放、窗口失焦和浏览器取消都会进入统一终止路径。详细行为请阅读[交互与事件](./interaction-and-events.md)。

## 静态 Child 与动画 Child

`appendChild` 创建静态 `StayInstantChild`。它适合编辑器对象、标注、节点和其他直接修改的场景内容，并参与普通历史记录。

`createChild` 创建 `StayAnimatedChild`。动画 Child 由关键帧和显式时间驱动，通过 `progress` 推进。它不会被普通静态历史快照冻结。

二者共享绘制和 Child 抽象，但生命周期和更新来源不同。不要为了播放动画而反复用 React state 重建静态 Child。

## 推荐的职责划分

- React state：工具栏、面板、选中项信息、路由和其他 DOM UI。
- StayCanvas runtime：Canvas 场景、Child、Shape、命中测试和交互会话。
- Listener：把动作转换成场景操作和应用反馈。
- `StayTools`：执行当前 Canvas 实例上的命令。

这条边界能避免两个常见问题：让 React 每一帧重建 Canvas 场景，或让 Canvas 内部状态反过来承担整个应用的数据模型。

## 对应示例

- [Shapes](https://lezhu1234.github.io/react-stay-canvas/#/simple/shapes)：内置 Shape 与样式更新。
- [Children](https://lezhu1234.github.io/react-stay-canvas/#/simple/children)：单 Shape 和多 Shape Child 的生命周期。
- [Layers](https://lezhu1234.github.io/react-stay-canvas/#/simple/layers)：图层和同层 `zIndex`。
- [Selectors](https://lezhu1234.github.io/react-stay-canvas/#/simple/selectors)：id、class、逻辑表达式与命中测试。
- [State](https://lezhu1234.github.io/react-stay-canvas/#/simple/state)：按模式启用 Listener，并比较持久 store 与 state store。

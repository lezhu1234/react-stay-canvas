# Shape 与动画

[English](../en/shapes-and-animation.md) · [文档首页](./README.md) · [核心概念](./core-concepts.md)

Shape 负责几何、绘制、命中和自身状态；Child 负责把一个或多个 Shape 组织成可查询、可整体移动的场景对象。静态绘制和关键帧动画共用同一套 Shape，但它们进入场景的方式不同：

- 静态内容通过 `tools.appendChild(...)` 加入场景；
- 时间线内容先通过 `tools.createChild(...)` 创建 `StayAnimatedChild`，再追加关键帧；
- 动画不会自己启动，调用方必须用 `tools.progress({ timeMs })` 指定当前时间。

## 内置 Shape 的当前能力

| Shape | 主要参数 | 默认命中 | 关键帧插值 | 说明 |
| --- | --- | --- | --- | --- |
| `Rectangle` | `x`、`y`、`width`、`height` | 是 | 是 | `x`、`y` 表示左上角 |
| `Circle` | `x`、`y`、`radius` | 是 | 否 | 使用普通坐标进行圆形半径命中 |
| `Line` | `x1`、`y1`、`x2`、`y2` | 否 | 是 | 可用 `nearPoint` 做自定义线段命中 |
| `StayText` | `x`、`y`、`text`、`font` | 否 | 是 | `(x, y)` 当前表示文字包围盒的上方中心 |
| `StayImage` | `image`、`x`、`y`、`width`、`height`、`opacity` | 是 | 是 | 继承矩形边界；应在图片加载后创建 |
| `Point` | `x`、`y` | 否 | 否 | 仅可作为几何工具；追加后会因 `getBound()` 未实现而在渲染时抛错 |
| `Path` | `points`、`radius` | 不可用 | 否 | `getBound()` 未实现，当前不能作为追加到场景的 Shape 渲染 |

这里的“默认命中”指 `Child.containsPointer()` 是否能直接依赖该 Shape 的 `contains()`。一个 Child 只要有任意一个 Shape 命中，就会命中整个 Child。因此常见做法是把不可命中的文字或线条，与一个透明度很低或可见的 `Rectangle` 放在同一个 Child 中，由矩形提供稳定命中区域。

## 样式与绘制顺序

所有 Shape 都接受一组通用属性：

```ts
const rectangle = new Rectangle({
  x: 24,
  y: 32,
  width: 160,
  height: 96,
  layer: 1,
  zIndex: 10,
  fillConfig: {
    color: { r: 54, g: 108, b: 220, a: 0.18 },
  },
  strokeConfig: {
    color: { r: 54, g: 108, b: 220, a: 1 },
    lineWidth: 2,
    dash: [8, 4],
    lineCap: "round",
  },
  globalConfig: {
    gco: "source-over",
  },
})
```

- `layer` 决定 Shape 绘制到哪一个原生 `<canvas>`；
- 同一层内按 `zIndex` 排序；
- 颜色使用 `{ r, g, b, a }`，其中 RGB 范围为 0–255，`a` 范围为 0–1；
- `strokeConfig` 控制描边；`fillConfig` 控制填充；
- `globalConfig.gco` 对应 Canvas 2D 的 `globalCompositeOperation`。

一个 Child 可以跨多个 layer。Child 的查询、移动和删除仍然是整体操作，但每个 Shape 会在自己的层上绘制。

## 一个 Child 包含多个 Shape

传入数组适合“主体 + 标签”这类顺序不需要稳定名称的组合：

```ts
const child = tools.appendChild({
  id: "node-a",
  className: "node:selected",
  shape: [
    new Rectangle({
      x: 40,
      y: 40,
      width: 140,
      height: 80,
      fillConfig: { color: { r: 230, g: 238, b: 255, a: 1 } },
    }),
    new StayText({
      x: 72,
      y: 82,
      text: "Node A",
      fillConfig: { color: { r: 25, g: 32, b: 45, a: 1 } },
    }),
  ],
})
```

`child.shape` 始终返回第一个 Shape。需要稳定访问多个 Shape 时，传入 `Map`：

```ts
const shapes = new Map([
  ["body", new Rectangle({ x: 40, y: 40, width: 140, height: 80 })],
  ["label", new StayText({ x: 72, y: 82, text: "Node A" })],
])

const child = tools.appendChild({
  id: "node-a",
  className: "node",
  shape: shapes,
})

const label = child.shapeMap.get("label") as StayText | undefined
label?.update({ text: "Renamed" })
```

数组会自动用 `"0"`、`"1"` 等索引作为 `shapeMap` 的键。复制、导出和历史快照都会保留这些键。

## 修改 Shape，而不是替换 Child

公开更新路径是 Shape 自己的 `update(...)`：

```ts
const child = tools.getChildById<Rectangle>("node-a")
child?.shape.update({
  x: 80,
  width: 180,
  fillConfig: { color: { r: 255, g: 214, b: 153, a: 1 } },
})
```

`update()` 会通知所属 Child 重绘相关 layer：同层更新只标记当前层，修改 `layer` 时会同时标记旧层和新层，旧 Canvas 会自动清除。`StayInstantChild.update(...)` 是撤销/重做使用的内部替换原语，不应作为应用代码的常规更新入口。

`move()` 表示相对位移；连续手势开始前先调用 `moveInit()`，之后可以反复以“相对手势起点”的偏移调用 `move()`：

```ts
child.moveInit()
child.move(24, 12)
```

## 加载图片

`StayImage` 需要一个已经加载的 `HTMLImageElement`，并要求显式传入 `opacity`：

```ts
const image = new Image()

image.onload = () => {
  tools.appendChild({
    className: "photo",
    shape: new StayImage({
      image,
      x: 20,
      y: 20,
      width: 240,
      height: 160,
      opacity: 1,
    }),
  })
}

image.src = "/photo.png"
```

跨域图片要遵守浏览器 Canvas 污染规则。如果后续需要调用 `toDataURL()` 或 `regionToTargetCanvas()`，图片响应必须允许对应的 CORS 使用方式。

传入 `sx`、`sy`、`swidth` 和 `sheight` 可以裁剪源图片。显式裁剪尺寸会在构造、更新和复制时保留；省略时使用图片 natural size。自定义裁剪尺寸目前不会保留到时间线插值帧中。

## 显式时间线模型

动画 Child 由多个命名 slice 组成。每个 slice 是同一种 AnimatedShape 的关键帧序列，不同 slice 可以并行推进：

```ts
const card = tools.createChild({
  id: "animated-card",
  className: "animated-card",
})

card.appendKeyFrame(
  "body",
  new Rectangle({
    x: 40,
    y: 80,
    width: 100,
    height: 72,
    fillConfig: { color: { r: 54, g: 108, b: 220, a: 1 } },
    transition: { durationMs: 400, type: "easeOutCubic" },
  }),
)

card.appendKeyFrame(
  "body",
  new Rectangle({
    x: 260,
    y: 48,
    width: 140,
    height: 120,
    fillConfig: { color: { r: 46, g: 137, b: 91, a: 1 } },
    transition: {
      delayMs: 120,
      durationMs: 680,
      type: "easeInOutBack",
    },
  }),
)

tools.progress({ timeMs: 0 })
```

第一次 `appendKeyFrame()` 默认会在 slice 开头插入一个透明的零帧，因此上例会先从透明状态进入第一个可见矩形。请保留这个默认行为：第一帧持续时间非零且关闭零帧时，当前运行时不能安全定位到 `timeMs: 0`。详见[当前限制](./known-limitations.md#动画与历史)。

`durationMs` 和 `delayMs` 属于“到达当前关键帧”的 transition：先保持前一帧 `delayMs`，再用 `durationMs` 插值到当前帧。`totalDurationMs` 是所有 slice 中最长的总时长。

## 推进、拖动和播放

库不持有一个自动播放时钟。时间来自你的 UI、媒体时钟或 `requestAnimationFrame`：

```ts
function seek(timeMs: number) {
  tools.progress({ timeMs })
}

let start = performance.now()
let frame = 0

function play(now: number) {
  tools.progress({ timeMs: Math.min(now - start, card.totalDurationMs) })
  if (now - start < card.totalDurationMs) {
    frame = requestAnimationFrame(play)
  }
}

frame = requestAnimationFrame(play)
```

组件卸载或停止播放时，调用方仍应取消自己创建的 animation frame。`progress()` 返回本次绘制更新的 layer 和 Child 信息，可用于调试或外部统计。

`bound: { beforeMs, afterMs }` 可以把当前时间映射到一个子区间，适合时间线裁剪或组合预览：

```ts
tools.progress({
  timeMs: 600,
  bound: { beforeMs: 300, afterMs: 900 },
})
```

## 动画约束

- 只有继承 `AnimatedShape` 并实现插值协议的 Shape 才能进入时间线。当前内置支持 `Rectangle`、`Line`、`StayText` 和 `StayImage`。
- 关键帧加入后，不要直接修改关键帧 Shape。运行时会警告，缓存和插值结果也可能不符合预期；需要变化时应创建新的关键帧。
- `StayAnimatedChild` 不参与 `log()`、`undo()`、`redo()`。历史快照只能保存某一时刻的静态形状，无法无损恢复整条时间线。
- 静态 Child 可以与动画 Child 共存。`tools.progress()` 会跳过静态 Child，`tools.log()` 会跳过动画 Child。

## 下一步

- [场景与 StayTools](./scene-and-tools.md)
- [自定义 Shape](./advanced/custom-shapes.md)
- [Child 与 Shape API](./api/children-and-shapes.md)
- [Timeline 示例](https://lezhu1234.github.io/react-stay-canvas/#/simple/timeline)

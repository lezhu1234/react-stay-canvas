# Child 与 Shape API

[English](../../en/api/children-and-shapes.md) · [Shape 与动画](../shapes-and-animation.md) · [自定义 Shape](../advanced/custom-shapes.md)

## StayInstantChild

静态 Child 由 `tools.appendChild(...)` 创建。

### 属性

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 显式 id 或自动生成的 uuid |
| `className` | `string` | 一个基础 class，可带 `:` 后缀，如 `node:active` |
| `shape` | `T` | `shapeMap` 中的第一个 Shape |
| `shapeMap` | `Map<string, T>` | 当前 Child 的全部 Shape |
| `canvas` | `Canvas` | 所属 Canvas 运行时 |
| `placement` | `ChildPlacementSnapshot` | 已解析的 affine 或 projective 局部到 Content placement 快照 |
| `participatesInHistory` | `boolean` | 静态 Child 为 `true` |

### 常用方法

| 方法 | 返回值 | 说明 |
| --- | --- | --- |
| `getShape()` | `T` | 等同于 `shape` |
| `getBound()` | `Rect` | 合并全部 Shape 边界 |
| `getShapeBound(shape)` | `Rect` | 单个 Shape 放置后的保守 Content 坐标边界 |
| `containsPointer(point)` | `boolean` | 任一 Shape 命中即为 true |
| `inArea(area)` | `boolean` | 任一 Shape 中心在区域内即为 true |
| `update(props)` | `this` | 原子更新 class、完整 Shape 组合与/或 placement |
| `setPlacement(placement)` | `this` | 完整替换 affine 或 projective placement |
| `toLocalPoint(point)` | `PointType \| undefined` | 把 Content 点映射进有限 Child 局部域 |
| `toContentPoint(point)` | `PointType \| undefined` | 把有限 Child 局部域映射到 Content |
| `moveInit()` | `void` | 保存连续移动的起点 |
| `move(offsetX, offsetY)` | `void` | 按 Content 坐标向量破坏性移动全部 Shape |
| `zoom(deltaY, center)` | `void` | 围绕 Content 坐标中心破坏性缩放全部 Shape |
| `getLayers()` | `Set<number>` | Child 使用的 layer 集合 |
| `getShapes(layer)` | `T[]` | 指定 layer 中的 Shape |

更新几何或绘制属性时调用具体 Shape 的 `update(...)`；更新 Child 级属性，或业务流程需要整体替换单个/多个 Shape 组合时，调用 `child.update(...)`。批量更新会先完成校验，再一次性应用；它会重绘被移除和新增 Shape 所在的 layer，并在下一次 `tools.log()` 时进入撤销/重做历史。

Shape 几何始终保留在 Child 局部坐标中；绘制、边界、命中、区域查询、历史、场景传输和区域捕获统一应用同一份 placement。affine placement 支持语义字段或 Canvas 兼容原始矩阵；projective placement 包含 3×3 矩阵和有限正面积 local domain，且 domain 不能接触或跨越齐次地平线。非有限值或不可逆矩阵会抛错，因为局部命中需要逆映射。

`placement` getter 返回判别式快照，修改返回对象不会改变 Child。动画 Child 可以使用同一份静态 placement，但当前还不支持 placement 关键帧和插值。

Child 是绑定 Canvas 的运行时实体，不提供复制操作。需要捕获并重复实例化场景时，使用 `exportChildren()` 和 `importChildren()`。

## StayAnimatedChild

`tools.createChild(...)` 创建 `StayAnimatedChild`。它继承静态 Child 的查询和绘制接口，但 Shape 来自当前时间点的插值结果。

| 属性或方法 | 说明 |
| --- | --- |
| `shapeFramesMap` | `Map<string, AnimatedShape[]>`，每个 key 是一个 slice |
| `totalDurationMs` | 最长 slice 的总时长 |
| `appendKeyFrame(name, shape, prependZeroShape?)` | 向 slice 追加关键帧 |
| `appendKeyFrames(frameMap, prependZeroShape?)` | 批量追加多个 slice |
| `replaceSlice(name, frames, prependZeroShape?)` | 原子替换一个非空 slice；当前投影会在下一次 seek 时改变 |
| `update({ className?, placement? })` | 更新 Child 级状态；不包含 timeline 持有的 Shape 组合 |
| `appendDefaultFrame(shape, prependZeroShape?)` | 向 `default` slice 追加 |
| `getSlice(name)` | 返回 slice；不存在时返回空数组 |
| `hasSlice(name)` | 判断 slice 是否存在 |
| `getSliceTotalDurationMs(name)` | 计算该 slice 的 delay + duration 总和 |
| `disappear(transition?, mode?)` | 为每个 slice 追加透明零帧 |
| `setCurrentTime({ time, bound? })` | 计算当前插值 Shape；通常通过 `tools.progress()` 调用 |
| `participatesInHistory` | 始终为 `false` |

`disappear(..., "afterEach")` 会在每个 slice 自身结尾追加透明帧。默认 transition 的持续时间为 0，因此会立即消失；传入非零 transition 才会形成动画。`"afterAll"` 会补 delay，使所有 slice 等最长时间线结束后再进入各自消失帧。

动画 Shape 组合由 `shapeFramesMap` 独占。替换时间线 slice 应调用 `replaceSlice(...)`；`StayAnimatedChild.update(...)` 只接受 `className` 和 `placement`，若运行时传入 `shape` 字段会直接拒绝。

## 通用 ShapeProps

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `layer` | `number` | `0` | 原生 Canvas 层索引 |
| `zIndex` | `number` | `1` | 同层排序 |
| `strokeConfig` | `CanvasStrokeProps` | 透明描边 | 颜色、线宽、虚线和连接样式 |
| `fillConfig` | `CanvasFillProps` | 透明填充 | 填充颜色 |
| `globalConfig` | `CanvasGlobalProps` | `source-over` | 合成模式 |
| `state` | `string` | `default` | Shape 自身绘制 state |
| `stateDrawFuncMap` | `ShapeProps["stateDrawFuncMap"]` | 内置 default | 每个 Shape state 的绘制阶段覆盖 |
| `shapeStore` | `Map<string, any>` | 新 Map | Shape 私有存储 |
| `zoomY` | `number` | `1` | 当前缩放累计值 |
| `zoomCenter` | `PointType` | `{ x: 0, y: 0 }` | 当前缩放中心 |

Shape state 与 Listener state 是不同概念。`Shape.switchState()` 切换一张 Shape 的绘制函数；`tools.switchState()` 切换哪些 Listener 可触发。

## 样式类型

```ts
interface CanvasStrokeProps {
  color?: RGBA
  lineWidth?: number
  dash?: number[]
  dashOffset?: number
  lineCap?: CanvasLineCap
  lineJoin?: CanvasLineJoin
  miterLimit?: number
}

interface CanvasFillProps {
  color?: RGBA
}

interface CanvasGlobalProps {
  gco?: GlobalCompositeOperation
}
```

## 内置构造参数

| 类型 | 必填几何/内容 | 特有可选属性 |
| --- | --- | --- |
| `Rectangle` | `x`, `y`, `width`, `height` | `filter` |
| `Circle` | `x`, `y`, `radius` | — |
| `Line` | `x1`, `y1`, `x2`, `y2` | — |
| `StayText` | `x`, `y`, `text` | `font`, `decoration`, `border`, `offsetXRatio`, `offsetYRatio`, `textBaseline`, `textAlign`, `autoTransitionDiffText` |
| `StayImage` | `image`, `x`, `y`, `width`, `height`, `opacity` | `sx`, `sy`, `swidth`, `sheight`, `imageLoaded` |
| `Point` | `x`, `y` | — |
| `Path` | `points` | — |
| `Polygon` | `points` | `fillRule`、`filter` |

全部构造参数还可包含通用 `ShapeProps`；动画 Shape `Rectangle`、`Line`、`StayText` 和 `StayImage` 还可包含 `transition`。

`Path` 是基于原生 Canvas 的中心线描边，不是可填充面积。宽度只由 `strokeConfig.lineWidth` 决定；`fillConfig` 不属于 `PathAttr`。默认端帽和连接样式为圆形，显式传入的 Canvas 描边配置会被保留。

`Polygon` 是闭合可填充区域。`PolygonAttr.points` 至少需要三个坐标。`fillRule` 接受 `"nonzero"`（默认值）或 `"evenodd"`，并同时决定 Canvas 填充与命中检测。Shape 会复制传入的点，并通过标准 Shape 几何方法提供派生边界、面积与质心。

`StayImage` 在省略 `swidth` 或 `sheight` 时使用图片 natural size；显式源裁剪尺寸会在构造、更新和复制时保留。时间线插值目前不会保留自定义裁剪尺寸；见[当前限制](../known-limitations.md#渲染与几何)。

`StayText` 的 `x`、`y` 始终是由 `textAlign` 和 `textBaseline` 定义的 Canvas 文字锚点。默认 `start + alphabetic` 使用左侧字母基线锚点；常用的 `center + middle` 会以 `(x, y)` 作为文字视觉中心。

`CircleAttr` 还保留 `stroke` 和 `fill` 字段，但当前构造函数不会使用它们；统一使用 `strokeConfig` 和 `fillConfig`。`StayText` 的 `decoration` 当前也没有进入构造后的绘制状态，不应作为稳定效果使用。

## Font 与 transition

| Font 字段 | 类型 | 说明 |
| --- | --- | --- |
| `size` | `number` | 字号 |
| `fontFamily` | `string` | 字体族 |
| `fontWeight` | `number` | 字重 |
| `italic` | `boolean` | 斜体 |
| `underline` | `boolean` | 下划线 |
| `strikethrough` | `boolean` | 删除线 |

| transition 字段 | 类型 | 说明 |
| --- | --- | --- |
| `type` | `EasingFunction` | easing 名称 |
| `durationMs` | `number` | 到达当前关键帧的插值时长 |
| `delayMs` | `number` | 插值前保持上一帧的时长 |

## ShapeDrawProps

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `context` | `CanvasRenderingContext2D \| OffscreenCanvasRenderingContext2D` | 当前 layer 的绘制 context |
| `now` | `number` | 当前绘制时间戳 |
| `width`, `height` | `number` | Canvas 逻辑尺寸 |
| `forchDraw` | `boolean?` | 内部强制绘制标志；公开拼写保持现状 |

## InstantShape 公开协议

自定义静态 Shape 必须实现：

```ts
abstract copy(): InstantShape
abstract commonDraw(props: ShapeDrawProps): void
abstract stroke(props: ShapeDrawProps): void
abstract fill(props: ShapeDrawProps): void
abstract move(offsetX: number, offsetY: number): void
abstract update(props: ShapeProps): InstantShape
abstract zoom(zoomScale: number): void
abstract getBound(): Rect
```

基类提供 `contains()` 的边界框实现、`getCenterPoint()`、`applyUpdate()`、缩放坐标辅助以及样式应用。非矩形几何应覆盖 `contains()`。

## AnimatedShape 额外协议

| 方法 | 责任 |
| --- | --- |
| `getTransProps()` | 列出参与递归插值的字段 |
| `intermediateState(before, after, ratio, type)` | 创建中间 Shape |
| `zeroShape(shapeFramesMap)` | 创建透明零帧 |
| `childSameAs(shape)` | 比较子类几何和内容 |

完整实现建议见[自定义 Shape](../advanced/custom-shapes.md)。

## 当前限制

- `Line.contains()` 和 `StayText.contains()` 当前固定返回 false；
- `Point.getBound()` 尚未实现，因此追加到场景后会在正常渲染时抛错；
- `Circle` 不继承 `AnimatedShape`，不能直接作为时间线关键帧；
- `Root` 虽然从包入口导出，但属于运行时内部边界 Shape，不建议应用代码直接创建。

这些限制会影响基础渲染，以及命中、Child 边界、历史和场景传输。不要用强制类型转换掩盖它们。

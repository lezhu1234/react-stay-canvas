# 自定义 Shape

[English](../../en/advanced/custom-shapes.md) · [文档首页](../README.md) · [Shape 与动画](../shapes-and-animation.md)

只有当内置 Shape 无法表达几何、绘制或命中语义时，才需要自定义 Shape。业务上的“节点”“标注”“卡片”通常应该是多个内置 Shape 组成的 Child，而不是新的 Shape 子类。

自定义 Shape 的最重要契约不是“能画出来”，而是以下行为保持一致：

- `copy()` 产生独立副本，供历史和场景传输使用；
- `getBound()` 返回稳定边界，供裁剪、Child 边界和区域查询使用；
- `contains()` 表达真实命中区域；
- `move()`、`zoom()` 和 `update()` 更新几何；
- `update()` 调用 `applyUpdate()`，通知所属 Child 重绘；
- `commonDraw()`、`stroke()` 和 `fill()` 各自只负责一个绘制阶段。

## 一个完整的静态 Shape

下面的菱形示例覆盖最小完整契约：

```ts
import {
  InstantShape,
  type PointType,
  type Rect,
  type ShapeDrawProps,
  type ShapeProps,
} from "react-stay-canvas"

interface DiamondProps extends ShapeProps {
  x: number
  y: number
  halfWidth: number
  halfHeight: number
}

class Diamond extends InstantShape {
  x: number
  y: number
  halfWidth: number
  halfHeight: number

  constructor(props: DiamondProps) {
    super(props)
    this.x = props.x
    this.y = props.y
    this.halfWidth = props.halfWidth
    this.halfHeight = props.halfHeight
    this.area = this.halfWidth * this.halfHeight * 2
  }

  commonDraw({ context }: ShapeDrawProps) {
    context.beginPath()
    context.moveTo(this.x, this.y - this.halfHeight)
    context.lineTo(this.x + this.halfWidth, this.y)
    context.lineTo(this.x, this.y + this.halfHeight)
    context.lineTo(this.x - this.halfWidth, this.y)
    context.closePath()
  }

  stroke({ context }: ShapeDrawProps) {
    context.stroke()
  }

  fill({ context }: ShapeDrawProps) {
    context.fill()
  }

  getBound(): Rect {
    return {
      x: this.x - this.halfWidth,
      y: this.y - this.halfHeight,
      width: this.halfWidth * 2,
      height: this.halfHeight * 2,
    }
  }

  contains(point: PointType) {
    const dx = Math.abs(point.x - this.x) / this.halfWidth
    const dy = Math.abs(point.y - this.y) / this.halfHeight
    return dx + dy <= 1
  }

  copy() {
    return new Diamond({
      x: this.x,
      y: this.y,
      halfWidth: this.halfWidth,
      halfHeight: this.halfHeight,
      layer: this.layer,
      zIndex: this.zIndex,
      state: this.state,
      stateDrawFuncMap: Object.fromEntries(
        Object.entries(this.stateDrawFuncMap).map(([name, stages]) => [
          name,
          { ...stages },
        ]),
      ),
      shapeStore: new Map(this.shapeStore),
      zoomY: this.zoomY,
      zoomCenter: { ...this.zoomCenter },
      strokeConfig: {
        ...this.strokeConfig,
        color: { ...this.strokeConfig.color },
        dash: [...this.strokeConfig.dash],
      },
      fillConfig: {
        ...this.fillConfig,
        color: { ...this.fillConfig.color },
      },
      globalConfig: { ...this.globalConfig },
    })
  }

  move(offsetX: number, offsetY: number) {
    this.update({ x: this.x + offsetX, y: this.y + offsetY })
  }

  zoom(scale: number) {
    const center = this.getZoomPoint(scale, { x: this.x, y: this.y })
    this.update({
      x: center.x,
      y: center.y,
      halfWidth: this.halfWidth * scale,
      halfHeight: this.halfHeight * scale,
    })
  }

  update(props: Partial<DiamondProps>) {
    this.x = props.x ?? this.x
    this.y = props.y ?? this.y
    this.halfWidth = props.halfWidth ?? this.halfWidth
    this.halfHeight = props.halfHeight ?? this.halfHeight
    this.area = this.halfWidth * this.halfHeight * 2
    this.applyUpdate(props)
    return this
  }
}
```

然后像内置 Shape 一样加入场景：

```ts
tools.appendChild({
  id: "decision-a",
  className: "decision",
  shape: new Diamond({
    x: 160,
    y: 120,
    halfWidth: 72,
    halfHeight: 48,
    fillConfig: { color: { r: 255, g: 214, b: 153, a: 1 } },
    strokeConfig: { color: { r: 214, g: 114, b: 48, a: 1 }, lineWidth: 2 },
  }),
})
```

## 绘制阶段

Shape 的默认绘制顺序是：

```text
commonDraw → stroke（如果描边不透明）→ fill（如果填充不透明）→ afterDraw
```

`commonDraw()` 通常建立路径或设置这个 Shape 独有的 Canvas context 状态；`stroke()` 与 `fill()` 执行具体绘制；`afterDraw()` 恢复临时状态。全局样式由基类在每个阶段前应用，不要在子类里重复解析 `strokeConfig` 和 `fillConfig`。

如果修改了 `filter`、`globalAlpha`、transform 等共享 context 状态，必须在 `afterDraw()` 中恢复，否则同层后续 Shape 会继承污染后的状态。

## 边界与命中必须分开思考

边界框主要用于快速查询、裁剪和视口判断；它不一定等于真实几何。菱形的 `getBound()` 返回外接矩形，而 `contains()` 使用菱形方程。如果直接继承基类的矩形 `contains()`，四个外接矩形角落也会误命中。

命中逻辑应满足：

- 与 Canvas 局部坐标一致；
- 对描边宽度有明确策略；
- 不做 DOM 查询或产生副作用；
- 足够便宜，可以在 `mousemove` 中重复执行。

## 更新与脏层

几何 setter 本身不会自动通知渲染器。自定义 `update()` 必须在字段赋值后调用 `applyUpdate(props)`：

```ts
update(props: Partial<DiamondProps>) {
  // 更新自己的几何字段
  this.applyUpdate(props)
  return this
}
```

`applyUpdate()` 会合并 `layer`、`zIndex`、缩放字段、`state`、`stateDrawFuncMap`、`strokeConfig` 和 `fillConfig`，并通过 `parent.onChildShapeChange()` 上报修改前后的 layer。所属 Child 会为同层更新标记一个 layer，换层时标记新旧两个 layer。它不会合并 `globalConfig` 或 `shapeStore`。遗漏 `applyUpdate()` 时，数据可能已经变化，但屏幕仍不更新。

## copy 的独立性

历史、`exportChildren()` 和导入流程都会调用 `copy()`。最低要求是：

- 返回同一具体 Shape 类型；
- 复制几何和绘制配置；
- 后续修改副本不会修改原对象；
- 不复用会被原地修改的数组、Map 或业务对象。

如果自定义 Shape 持有数组或对象，需要在 `copy()` 中按它们的可变性决定浅拷贝或深拷贝。

上例对 `shapeStore` 做了浅拷贝。如果 Map 的 value 本身可变，自定义 Shape 仍需按自己的数据模型复制这些 value；通用基类无法替应用判断任意业务对象的深拷贝规则。

## 何时扩展 AnimatedShape

只有确实需要关键帧插值时才扩展 `AnimatedShape`。除了静态 Shape 契约，还必须实现：

- `getTransProps()`：列出参与插值的字段；
- `intermediateState()`：根据前后 Shape、比例和 easing 创建中间 Shape；
- `zeroShape()`：创建透明的零帧；
- `childSameAs()`：比较 Shape 自身几何和内容。

这四项会影响缓存、关键帧边界和动画可见性。先完成并测试静态 Shape，再单独加入动画协议，不要用一个不完整的 AnimatedShape 同时调试绘制、命中和插值。

## 最低测试清单

一个自定义 Shape 至少应验证：

1. 构造后的 `getBound()` 和中心点；
2. `contains()` 的内部、边界和外部点；
3. `move()` 和以任意中心进行的 `zoom()`；
4. `copy()` 后原件与副本独立；
5. `update()` 会使所属 layer 重绘；
6. 放进多 Shape Child 后，Child 边界和整体移动正确；
7. 若支持动画，0、关键帧中间、关键帧结束和 delay 区间结果正确。

## 相关参考

- [Child 与 Shape API](../api/children-and-shapes.md)
- [Shape 与动画](../shapes-and-animation.md)

# 当前限制

[English](../en/known-limitations.md) · [文档首页](./README.md)

下面列出当前实现尚不能可靠提供的用户可见行为。

## 渲染与几何

- `Line` 和 `StayText` 没有默认命中区域。请把它们与可命中的 Shape 组合，或提供明确的 selector/命中策略。
- `Point.getBound()` 和 `Path.getBound()` 尚未实现。正常渲染会先按边界判断 viewport，因此追加任意一个 Shape 都会在绘制前抛错；`Point` 仍可单独作为几何工具使用，`Path.copy()` 也尚未实现。
- `StayText({ x, y })` 当前以文字包围盒的上方中心为锚点，不是 `Circle` 所使用的视觉中心。
- `StayImage` 会在构造、更新和复制时保留显式源裁剪尺寸，但自定义 `swidth`、`sheight` 尚未纳入 transition，时间线插值帧不会保留它们。
- 类型接受 `CircleAttr.stroke`、`CircleAttr.fill` 和 `StayText.decoration`，但它们不会产生对应的稳定绘制效果。Circle 样式请使用 `strokeConfig` 和 `fillConfig`。

## 动画与历史

- `Circle`、`Point` 和 `Path` 不是动画 Shape。
- 第一帧使用 `prependZeroShape: false` 且持续时间非零时，`timeMs: 0` 不能安全定位。请保留默认零帧。
- 动画 Child 不参与 `log()`、`undo()` 或 `redo()`。
- 更新已有 Shape 不会自动把 Child 标记为待记录历史；`log()` 只记录由 append/remove 标记的静态 Child。

## 场景操作

- `reset()` 在场景移动后不能可靠执行逆变换，因为它会复用旧的移动快照。不要把它当成“恢复初始状态”的稳定入口。
- 内置 `Shape.copy()` 不会保留所有公共字段，并可能共享嵌套的可变样式值；`StayAnimatedChild.copy()` 还会丢失时间线并退化为静态快照。因此历史和场景传输不能对所有 Shape 或动画场景保证完整保真。

## 事件与目标

- 默认目标 comparator 不提供稳定排序保证。指针目标重叠时请传入 `sortBy`。
- 公开 Event trigger 类型包含 `"frame"`，但当前 renderer 不会通过 `EventRuntime` 发出 frame action。

# 当前限制

[English](../en/known-limitations.md) · [文档首页](./README.md)

下面列出当前实现尚不能可靠提供的用户可见行为。

## 渲染与几何

- `Line` 和 `StayText` 没有默认命中区域。请把它们与可命中的 Shape 组合，或提供明确的 selector/命中策略。
- `Point.getBound()` 尚未实现。正常渲染会先按边界判断 viewport，因此追加 Point 会在绘制前抛错；它仍可单独作为几何工具使用。
- `StayImage` 会在构造、更新和复制时保留显式源裁剪尺寸，但自定义 `swidth`、`sheight` 尚未纳入 transition，时间线插值帧不会保留它们。
- 类型接受 `CircleAttr.stroke`、`CircleAttr.fill` 和 `StayText.decoration`，但它们不会产生对应的稳定绘制效果。Circle 样式请使用 `strokeConfig` 和 `fillConfig`。
- 原生 WebGL2 支持带 depth 的索引三角形 Mesh、不透明 unlit/Lambert 材质、显式逐顶点法线、环境光，以及每层最多四个方向光；纹理、透明/玻璃材质、透明排序、阴影和 WebGL2 区域截图尚未提供。

## 动画与历史

- `Circle`、`Point` 和 `Path` 不是动画 Shape。
- 第一帧使用 `prependZeroShape: false` 且持续时间非零时，`timeMs: 0` 不能安全定位。请保留默认零帧。
- 动画 Child 不参与 `log()`、`undo()` 或 `redo()`。

## 场景操作

- `reset()` 在场景移动后不能可靠执行逆变换，因为它会复用旧的移动快照。不要把它当成“恢复初始状态”的稳定入口。
- `tools.viewport` 和二维 Child placement 不会移动 WebGL2 Camera；Camera pose/projection 是显式的图层显示状态。

## 事件与目标

- 默认目标 comparator 不提供稳定排序保证。指针目标重叠时请传入 `sortBy`。
- 公开 Event trigger 类型包含 `"frame"`，但当前 renderer 不会通过 `EventRuntime` 发出 frame action。
- WebGL2 Canvas 上的 DOM 与 root action 仍可用，但在原生 raycast 加入前，`StayWebGLChild` 不是指针 target。

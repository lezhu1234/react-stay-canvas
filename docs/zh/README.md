# react-stay-canvas 中文文档

[English](../en/README.md)

`react-stay-canvas` 是一个面向 React 应用的分层 Canvas 渲染与交互库。它把图形绘制、场景对象、命中测试、事件、动画和历史记录组织成一套可组合的模型，适合编辑器、标注工具、流程图和动效编排等需要持续交互的 Canvas 场景。

## 从哪里开始

- [快速开始](./getting-started.md)：安装库，渲染第一个场景，并理解尺寸和容器布局。
- [核心概念](./core-concepts.md)：认识 Canvas、图层、Child、Shape 和 StayTools 之间的关系。
- [交互与事件](./interaction-and-events.md)：理解 Listener、selector、state、ActionEvent、手动动作和 Pointer Session。
- [Shape 与动画](./shapes-and-animation.md)：使用内置 Shape、组合对象并构建显式关键帧时间线。
- [场景与 StayTools](./scene-and-tools.md)：查询、变换、历史、场景传输和区域输出。
- [当前限制](./known-limitations.md)：当前运行时尚不能可靠提供的行为。
- [在线示例](https://lezhu1234.github.io/react-stay-canvas/)：通过聚焦示例和集成示例了解常用能力。

如果你第一次使用这个库，建议先完成“快速开始”，再阅读“核心概念”。不要从 API 列表开始；理解场景对象和事件模型后，具体接口会更容易使用。

## 进阶指南

- [自定义 Shape](./advanced/custom-shapes.md)：实现绘制、边界、命中、复制、移动与更新协议。

## API 参考

- [StayCanvas](./api/stay-canvas.md)
- [Child 与 Shape](./api/children-and-shapes.md)
- [Event 与 Listener](./api/events-and-listeners.md)
- [StayTools](./api/stay-tools.md)

## 术语

| 标识符 | 含义 |
| --- | --- |
| Canvas | 一组尺寸一致、上下叠放的原生 `<canvas>` 图层，以及管理它们的运行时 |
| Child | 场景中的可查询、可命中、可整体操作的对象 |
| Shape | Child 内负责几何、绘制和命中判断的图形 |
| Listener | 根据事件、状态和 selector 接收动作的监听器 |
| Event | 把匹配的 DOM 输入转换为动作的定义；手动动作走直接派发路径 |
| StayTools | 当前 Canvas 实例的场景操作入口 |

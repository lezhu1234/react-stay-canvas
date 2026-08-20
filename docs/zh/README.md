# react-stay-canvas 中文文档

[English](../en/README.md)

`react-stay-canvas` 是一个面向 React 应用的分层 Canvas 渲染与交互库。它把图形绘制、场景对象、命中测试、事件、动画和历史记录组织成一套可组合的模型，适合编辑器、标注工具、流程图和动效编排等需要持续交互的 Canvas 场景。

## 从哪里开始

- [快速开始](./getting-started.md)：安装库，渲染第一个场景，并理解尺寸和容器布局。
- [核心概念](./core-concepts.md)：认识 Canvas、图层、Child、Shape、StayTools、selector、state 和事件系统之间的关系。
- [在线示例](https://lezhu1234.github.io/react-stay-canvas/)：10 个单项示例和 3 个集成示例，可直接操作并按页面验收手册回归。

如果你第一次使用这个库，建议先完成“快速开始”，再阅读“核心概念”。不要从 API 列表开始；理解场景对象和事件模型后，具体接口会更容易使用。

## 文档地图

| 主题 | 当前状态 | 内容 |
| --- | --- | --- |
| 快速开始 | 已重写 | 安装、首个场景、布局、修改和删除对象 |
| 核心概念 | 已重写 | 渲染模型、对象所有权、图层和交互入口 |
| 交互与事件 | 迁移中 | Listener、Event、selector、state、Pointer Session |
| Shape 与动画 | 迁移中 | 内置 Shape、样式、关键帧和自定义 Shape |
| 场景与工具 | 迁移中 | 查询、变换、历史、导入导出和截图 |
| API 参考 | 迁移中 | `StayCanvas`、Child、Shape、Event、Listener、`StayTools` |

迁移期间，尚未重写的内容仍可在[旧版中文文档](../README.zh.md)中查阅。旧文档包含过时接口，只适合作为临时参考；公开类型和当前行为以包导出和仓库示例为准。

## 文档与示例各自负责什么

- 本文档解释概念、使用方式和公开行为。
- TypeScript 导出声明决定 API 名称和类型签名。
- [示例站点](https://lezhu1234.github.io/react-stay-canvas/)展示可运行的交互。
- [验收手册](../../example/ACCEPTANCE.md)定义需要人工验证的场景、结果和证据。
- [事件架构](../EVENT_ARCHITECTURE.md)和[源码架构](../SOURCE_ARCHITECTURE.md)面向维护者，不是入门教程。

## 术语约定

文档保留代码中的英文标识符，避免把类型名翻译成另一套名称。

| 标识符 | 文档中的含义 |
| --- | --- |
| Canvas | 一组尺寸一致、上下叠放的原生 `<canvas>` 图层，以及管理它们的运行时 |
| Child | 场景中的可查询、可命中、可整体操作的对象 |
| Shape | Child 内负责几何、绘制和命中判断的图形 |
| Listener | 根据事件、状态和 selector 接收动作的监听器 |
| Event | 把 DOM 输入或程序调用转换为动作的事件定义 |
| StayTools | 当前 Canvas 实例的场景操作入口 |

## 本地验证

```bash
pnpm install --frozen-lockfile
npm ci --prefix test
npm ci --prefix example
pnpm verify
```

`pnpm verify` 会构建库、运行测试、检查示例 TypeScript 类型，并构建示例站点。

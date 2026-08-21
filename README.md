# react-stay-canvas

用于 React 的分层 Canvas 渲染与交互库。它提供 Shape、Child、selector、状态、历史记录、动画和可组合事件等能力。

A layered Canvas rendering and interaction library for React, with shapes, children, selectors, state, history, animation, and composable events.

[中文文档](./docs/zh/README.md) · [English documentation](./docs/en/README.md) · [示例 / Examples](https://lezhu1234.github.io/react-stay-canvas/) · [验收手册 / Acceptance handbook](./example/ACCEPTANCE.md)

> 本页只作为项目入口。使用指南和 API 参考按主题维护在中英文文档中，不在根 README 维护第三份副本。
>
> This page is only the project entry point. Guides and API reference are maintained by topic in the Chinese and English documentation instead of being copied here.

## 安装 / Installation

```bash
npm install react-stay-canvas
```

React 是 peer dependency。请在应用中安装兼容版本的 `react` 与 `react-dom`。

React is a peer dependency. Install compatible versions of `react` and `react-dom` in the application.

## 最小示例 / Minimal example

```tsx
import { Rectangle, StayCanvas, StayTools } from "react-stay-canvas"

function mounted(tools: StayTools) {
  tools.appendChild({
    className: "box",
    shape: new Rectangle({
      x: 40,
      y: 40,
      width: 120,
      height: 80,
    }),
  })
}

export function Demo() {
  return <StayCanvas width={440} height={260} mounted={mounted} />
}
```

完整的事件、selector、变换、历史记录、场景传输和集成示例请查看示例站点。建议先阅读对应语言的快速开始和核心概念，再按主题查阅后续文档。

See the example gallery for events, selectors, transforms, history, scene transfer, and integrated workflows. Start with Getting started and Core concepts in the language-specific documentation, then use the topic guides as reference.

## 本地验证 / Local verification

```bash
pnpm install --frozen-lockfile
npm ci --prefix test
npm ci --prefix example
pnpm verify
```

`pnpm verify` 会检查双语文档，然后依次构建库、运行测试、检查示例 TypeScript 类型并构建示例站点。

`pnpm verify` checks the bilingual documentation, builds the library, runs the tests, type-checks the examples, and builds the example gallery.

## License

[MIT](./LICENSE)

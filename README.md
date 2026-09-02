# react-stay-canvas

用于 React 的分层 Canvas 渲染与交互库。它提供 Shape、Child、selector、状态、历史记录、动画和可组合事件等能力。

A layered Canvas rendering and interaction library for React, with shapes, children, selectors, state, history, animation, and composable events.

[中文文档](./docs/zh/README.md) · [English documentation](./docs/en/README.md) · [1.3.0 迁移](./docs/zh/migration-1.3.md) · [1.3.0 migration](./docs/en/migration-1.3.md) · [Changelog](./CHANGELOG.md) · [示例 / Examples](https://lezhu1234.github.io/react-stay-canvas/)

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

完整的事件、selector、变换、历史记录、场景传输和集成示例请查看示例站点。建议先阅读对应语言的快速开始和核心概念，再按需要阅读其他主题。

See the example gallery for events, selectors, transforms, history, scene transfer, and integrated workflows. Start with Getting started and Core concepts, then continue with the topics relevant to your application.

## License

[MIT](./LICENSE)

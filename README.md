# react-stay-canvas

用于 React 的分层 Canvas 渲染与交互库。它提供 Shape、Child、selector、状态、历史记录、动画和可组合事件等能力。

A layered Canvas rendering and interaction library for React, with shapes, children, selectors, state, history, animation, and composable events.

[中文文档](./docs/README.zh.md) · [English documentation](./docs/README.en.md) · [示例 / Examples](https://lezhu1234.github.io/react-stay-canvas/) · [验收手册 / Acceptance handbook](./example/ACCEPTANCE.md)

> 本页只作为项目入口。中文和英文 API 文档分别是对应语言的规范来源，不再在根 README 维护第三份 API 副本。
>
> This page is only the project entry point. The Chinese and English API documents are the canonical sources for their respective languages.

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

完整的事件、selector、变换、历史记录、场景传输和集成示例请查看示例站点。API、类型和行为契约请查看对应语言文档。

See the example gallery for events, selectors, transforms, history, scene transfer, and integrated workflows. See the language-specific documentation for the API, types, and behavior contracts.

## 本地验证 / Local verification

```bash
pnpm install --frozen-lockfile
npm ci --prefix test
npm ci --prefix example
pnpm verify
```

`pnpm verify` 会依次构建库、运行测试、检查示例 TypeScript 类型并构建示例站点。

`pnpm verify` builds the library, runs the tests, type-checks the examples, and builds the example gallery.

## License

[MIT](./LICENSE)

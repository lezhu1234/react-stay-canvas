# Child 快照与场景传输验收记录

## 验收目标

| 字段 | 值 |
| --- | --- |
| 日期与时区 | 2026-08-22 19:49:02 +0800 |
| 操作人 | Codex |
| 候选来源 | PR 原 head `5b5ed1b2745fa5af7d85ebb33f7464d2ace2361c` + `origin/dev@62510abfc42eed18c18d56d12ab354957d9d326d`；最终合并提交在推送后补录 |
| Node / npm / pnpm | Node `v22.23.2`；npm `10.9.8`；pnpm `11.7.0` |
| 完整门禁 | `pnpm verify`：通过 |
| 聚焦 API 验收 | 1 个专用验收文件、A1/A2/A3 三个场景（4 项测试）全部通过 |
| A1 历史状态 | 通过 |
| A2 场景导出与导入 | 通过 |
| A3 动画投影与历史隔离 | 通过 |
| 可选视觉补充 | 未执行；本次 API 验收不要求 |
| 下游服务 | 阻塞：未加载候选产物 |
| 清理 | 已关闭本次启动的 `:4173` preview；测试无持久数据 |

## API 验收方法

聚焦命令：

```sh
npm test --prefix test -- child-snapshot-api-acceptance.test.ts --reporter=verbose
```

Vitest 通过 jsdom 和 node-canvas 创建真实 `Stay`，调用真实 `StayTools`，并把 `react-stay-canvas` 映射到当前仓库的 `src/index.ts`。专用验收文件直接检查实际 Child、Shape、ShapeMap、SceneFragment 和历史状态，不通过界面现象反推结果；其他测试文件只作为局部回归证据。

## 已验证行为

### A1：历史状态

- `appendChild` 与 `log` 后，`undo`、`redo` 每次只改变一个对应的静态 Child。
- 历史恢复后的 Child 保持 ID、className、Rectangle 类型和几何属性。
- 历史起点和终点的额外 `undo`、`redo` 安全无效果。
- 撤销后新增并记录 Child 会截断旧的重做分支；旧 Child 不会被错误恢复。
- 静态 Child 参与历史，动画 Child 不参与静态历史。

### A2：场景导出与导入

- `SceneChildFragment.sourceId` 等于源 Child ID。
- 导入后的 Child 生成新的运行时 ID，且多次导入之间的 ID 也不相同。
- 源 Shape、导出片段 Shape、导入 Shape 和各次导入的 ShapeMap 均不是同一对象。
- 修改源 Shape 或导入 Shape，不会改变导出片段或其他导入结果。
- 同一场景片段可重复导入不同目标区域，片段的几何值不被修改。
- 关系消费者可使用 `sourceId` 将节点与边映射到新的运行时 Child；节点和 Line 均保持具体 Shape 类型，副本修改不影响原图。
- 导出的片段不暴露 Child 的 canvas，也不存在通用 Child `copy()`。

### A3：动画投影与历史隔离

- 静态历史操作不会删除、冻结或复制动画 Child 的时间线。
- 动画 Child 被移除后不会通过静态历史错误复活。
- 导出只捕获动画 Child 当前渲染投影，不包含 `shapeFramesMap`。
- 导入后的投影是新的静态 Child，并正常参与静态历史。

## 完整门禁证据

`pnpm verify` 依次通过：

- 文档校验；
- CJS、ESM 与类型声明构建；
- 21 个测试文件、144 项测试；
- example TypeScript 检查；
- example Vite 生产构建（122 个模块）。

Rollup 构建仍输出既有的 `"use client"` 指令忽略警告，但构建成功；本次测试和文档变更没有修改该行为。

## 下游服务说明

本机 `:80` 服务来自 `/Volumes/2TB/chun/stay/apps/web`，使用 Next.js `15.5.7`，实际解析的是 pnpm store 中已发布的 `react-stay-canvas@1.1.9`。该服务不能作为本次候选变更的证据，也不会在隔离集成验收中被替换或停止。精确候选 tarball 的 `stay` 隔离工作树验收将在 PR 修复推送后按手册 S1 执行并补录。

## 验收结论

当前合并候选树的本地 API 行为验收通过。完整门禁为 21 个测试文件、144 项测试；其中新增回归直接证明恢复后的运行时 Shape 修改不会污染持久历史步骤。已验证的结论限定于 Child、Shape、ShapeMap、历史状态、场景传输和动画投影语义；未声称完成像素输出或浏览器输入链路验收。

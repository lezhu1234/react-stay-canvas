# 本地 API 验收手册

## 目的与范围

本手册用于直接调用当前检出版本 `react-stay-canvas` 的 API，并检查实际 Child、Shape、ShapeMap、历史状态和动画时间线。核心验收不依赖浏览器点击或界面观察。

当前测试环境通过 jsdom 和 node-canvas 创建真实 `Stay` 实例；测试调用真实 `StayTools`，并将包名 `react-stay-canvas` 映射到当前仓库的 `src/index.ts`。mock 仅用于控制渲染时机，不替换业务 API 或领域对象。

历史快照与场景传输边界覆盖以下行为：

- `/simple/history`
- `/simple/transfer`
- `/integrations/diagram`
- `/integrations/motion-studio`

上述路由用于说明业务场景，不是核心验收的执行入口。各路由页面中的“验收手册”标签仅作为可选视觉补充。

API 验收通过不等于像素、浏览器事件或视觉效果已经验收。若变更触及绘制、DOM 输入或浏览器生命周期，仍需单独执行对应的视觉或浏览器验收，且必须分别报告结果。

## 环境与安全规则

### 账号、运行环境与测试数据

- 账号：无需账号。
- 运行环境：仓库 `test` 包声明的 Vitest、jsdom 和 node-canvas。
- 测试数据：测试内创建的 Child、Shape、场景片段和历史操作，不读写外部数据。
- 浏览器：核心 API 验收不启动浏览器。视觉补充场景才需要桌面浏览器。
- 网络：核心 API 验收不需要网络，不得发布软件包、部署服务或写入生产数据。

### 将运行版本绑定到待验变更

执行前记录以下信息：

```sh
git status --short --branch
git rev-parse HEAD
node --version
npm --version
```

先执行完整的仓库确定性门禁：

```sh
pnpm verify
```

再执行本次历史快照与场景传输的聚焦 API 验收：

```sh
npm test --prefix test -- child-snapshot-api-acceptance.test.ts --reporter=verbose
```

`test/vitest.config.ts` 将 `react-stay-canvas` 映射到 `../src/index.ts`，所以聚焦验收直接执行当前检出的源码。`child-snapshot-api-acceptance.test.ts` 是 A1、A2、A3 结论的唯一验收证据所有者；其他测试文件继续负责局部回归，不从分散断言推导本手册的广义结论。必须记录提交、命令、测试文件数、测试数和结果。

### 核心 API 验收项

#### A1：Child 与 Shape 历史状态

调用 `appendChild`、`log`、`undo` 和 `redo`，然后通过 `getChildrenWithoutRoot`、`getChildById` 和 Child 的 `shapeMap` 检查：

- 每次有效撤销或重做只改变对应的静态 Child。
- 恢复后的 Child 保留 ID、className、Shape 类型、几何属性和 ShapeMap 内容。
- 历史边界上的额外撤销或重做安全无效果。
- 动画 Child 的 `participatesInHistory` 为 `false`，静态 Child 为 `true`。

对应验收：`child-snapshot-api-acceptance.test.ts` 的 A1 场景。

#### A2：场景导出与导入

调用 `exportChildren` 和 `importChildren`，然后直接检查导出的 `SceneFragment` 与目标 Stage 中的 Child：

- `sourceId` 等于源 Child ID，但导入后生成新的运行时 Child ID。
- 片段只包含 className、sourceId 和 ShapeMap 快照，不暴露 Child 的 canvas 或通用 `copy()`。
- 导入后的 Shape 保持具体类型、几何属性和 ShapeMap 键。
- 重复使用同一片段导入不同目标区域时，片段本身不被修改。
- 不同导入结果和源 Child 可以分别修改，Shape 对象互不共享。

对应验收：`child-snapshot-api-acceptance.test.ts` 的 A2 场景。

#### A3：动画投影与历史隔离

调用 `createChild`、关键帧 API、`progress`、`log`、`undo`、`exportChildren` 和 `importChildren`，然后检查：

- 静态历史操作不会删除、冻结或复制动画时间线。
- 动画 Child 被移除后不会通过静态历史错误复活。
- 场景导出只捕获动画 Child 当前渲染投影，不携带 `shapeFramesMap`。
- 导入后的投影是新的静态 Child，正常参与静态历史。

对应验收：`child-snapshot-api-acceptance.test.ts` 的 A3 场景。

### API 验收失败标准

- 任一聚焦测试失败、超时或未执行。
- 实际 Child、Shape、ShapeMap、SceneFragment 或历史状态与上述约束不一致。
- 测试未解析到当前检出源码，或提交与记录不一致。
- 只能通过界面现象推断状态，无法从真实 API 对象直接断言。

### API 验收证据与清理

- 保留提交 SHA、Node/npm/pnpm 版本、完整命令和 Vitest 汇总。
- 失败时保留首个失败测试、断言差异和堆栈。
- 测试进程正常退出后无需清理持久数据；测试创建的 Stage、Child 和 Shape 只存在于进程内。
- API 验收不需要启动 example 服务。若之前为了视觉验收启动了 preview，应在不再使用后停止。

## 可选视觉补充

只有在变更触及像素输出、DOM 输入、命中测试、拖拽、浏览器事件生命周期或动画视觉连续性时，才执行以下浏览器场景。它们不替代上述 API 验收。

不得因为其他本地应用已经启动就用它替代 example。只有在能够证明下游服务解析到的 `react-stay-canvas` 依赖就是待验候选产物时，该服务才可计入验收。必须记录服务目录、启动命令、监听地址、候选包校验值或源码提交，以及消费方提交。

### 路由隔离与通用失败标准

- 每个路由都通过新的文档导航打开，不得从其他场景继承状态。
- 重试前点击“重置”或重新加载当前路由。
- 出现任何未捕获的 Console 错误或 React 错误，场景即失败。
- 出现残影、一次输入被重复处理、状态数量偏离下述步骤，或任一预期结果无法稳定复现一次，场景即失败。
- 步骤被阻塞或未执行时，不得判定通过。

## 场景 H1：静态历史快照

路由：`/?example=%2Fsimple%2Fhistory#/simple/history`

前置条件：全新打开路由，并确认“可见 Children”为 `0`。

操作与预期结果：

1. 点击三次“添加并记录”。可见数量依次变为 `1、2、3`，Canvas 中出现编号为 `1、2、3` 的矩形。
2. 点击四次“撤销”。数量依次变为 `2、1、0、0`；每次有效撤销只移除最后一个编号矩形，额外一次撤销安全无效果。
3. 点击四次“重做”。数量依次变为 `1、2、3、3`；矩形编号保持不变，额外一次重做安全无效果。
4. 点击“移除并记录”，再点击“撤销”。数量按 `3 -> 2 -> 3` 变化，矩形 `3` 恢复原有编号和外观。
5. 点击“添加并记录”，再点击“重做”。矩形 `4` 出现；重做后的数量仍为 `4`，已废弃的重做分支不会移除矩形 `3`。

所需证据：

- 步骤 3 后截图：数量为 `3`，矩形编号为 `1、2、3`。
- 步骤 5 后截图：数量为 `4`，矩形编号为 `1` 至 `4`。
- Console 截图，或明确记录整个场景执行期间 Console 无错误。

清理：点击“重置”，确认数量恢复为 `0`。

## 场景 T1：可复用场景传输与截图

路由：`/?example=%2Fsimple%2Ftransfer#/simple/transfer`

前置条件：全新打开路由，并确认源数量为 `3`、目标数量为 `0`、快照状态为“未截取”。

操作与预期结果：

1. 点击“复制场景”。目标数量变为 `3`；目标几何位置与源一致，标签标识为“副本 1”。
2. 点击“移动源对象 A”。源对象 A 与其内部标签一起移动；目标中的副本 1 不移动。
3. 点击“移动最新副本 A”。副本 1 中的 A 与其标签一起移动；源对象 A 不移动。
4. 再次点击“复制场景”。目标数量变为 `6`；新副本明显错开，标签标识为“副本 2”，副本 1 保持自己的位置。
5. 点击“截取区域”。快照状态变为“已就绪”；预览包含源对象 A、源对象 B 和场景说明文字，并保持它们当前在源 Canvas 中的位置。

所需证据：

- 步骤 4 后截图：能看到两个相互独立的副本、目标数量 `6`，最近变更状态对应副本 2。
- 步骤 5 后截图：包含快照预览和“已就绪”状态。
- Console 截图，或明确记录整个场景执行期间 Console 无错误。

清理：点击“重置”，确认目标数量为 `0`，且页面不再显示快照预览。

## 场景 D1：图表关系传输

路由：`/?example=%2Fintegrations%2Fdiagram#/integrations/diagram`

前置条件：全新打开路由，并确认模式为“选择”、节点数量为 `3`、边数量为 `2`。

操作与预期结果：

1. 选择一个节点，再点击 Canvas 空白处。蓝色选择外框和匹配的“已选择”值先出现，随后一起清除。
2. 依次拖动三个初始节点。节点标签与矩形一起移动，所有相连的边立即跟随端点，且边始终显示在节点后方。
3. 切换到“连接”，依次点击节点 1 和节点 3，再切回“选择”。第一次点击显示橙色虚线外框；第二次点击清除外框，边数量从 `2` 增加到 `3`。
4. 点击“添加节点”和“放大”。节点数量变为 `4`，新节点可以正常操作，缩放期间所有标签和边保持正确的图层顺序。
5. 点击“保存场景”，再点击“导入副本”。节点数量变为 `8`、边数量变为 `6`；导入节点明显错开，并带有可见的“副本 1”标签。
6. 拖动一个露出部分的导入节点。只有该副本节点和副本中的依赖边移动；原节点及其原始边保持不变。

所需证据：

- 步骤 3 中橙色虚线连接起点外框的瞬时截图。
- 步骤 5 后截图：节点数量 `8`、边数量 `6`，且能看到副本标签。
- 步骤 6 后截图：能看出原图与副本几何位置相互独立。
- Console 截图，或明确记录整个场景执行期间 Console 无错误。

清理：点击“重置”，确认节点数量恢复为 `3`、边数量恢复为 `2`。

## 场景 M1：动画轨道不进入静态历史

路由：`/?example=%2Fintegrations%2Fmotion-studio#/integrations/motion-studio`

前置条件：全新打开路由，并确认动画轨道为 `3`、静态参考线为 `0`、撤销范围显示“仅静态内容”。

操作与预期结果：

1. 在“完整区间”下完整播放一次，再分别拖动到起点、中间和终点。滑块时间与实际时间相等；面板、连接线和标题同步变化，图层顺序保持稳定。
2. 将滑块停在起点，切换到“限定区间”，再拖动到终点。滑块时间为 `0 ms` 时，实际时间映射为 `480 ms`；滑块时间为 `2200 ms` 时，实际时间映射为 `1740 ms`。切换区间后，当前滑块位置会立即重新应用。
3. 点击两次“添加静态参考线”。静态参考线数量变为 `2`；三个动画轨道仍然存在，时间线仍可拖动。
4. 点击两次“撤销静态参考线”。静态参考线数量依次变为 `1、0`；动画轨道不会消失、冻结或进入静态历史。

所需证据：

- 限定区间两个端点的截图，分别显示上述时间映射。
- 两次撤销后的截图：静态参考线为 `0`、动画轨道为 `3`，并在非零时间能看到动画内容。
- Console 截图，或明确记录整个场景执行期间 Console 无错误。

清理：点击“重置”，确认恢复为完整区间、两个时间均为 `0 ms`、静态参考线为 `0`。

## 下游本地服务验收

下游服务是独立验收目标，不能替代 H1 至 M1。执行下游服务的 Canvas 流程前：

1. 记录消费方仓库与提交、服务启动命令、地址，以及实际解析的 `react-stay-canvas` 包位置。
2. 证明实际解析的包来自完全相同的候选提交，例如记录候选产物校验值并在隔离环境中安装。
3. 遵循消费方仓库自己的验收手册和清理规则。

如果无法证明第 2 项，应将场景记录为“阻塞：未加载候选产物”。不得根据相近的已发布版本声称兼容性或真实环境验收通过。

### 场景 S1：`stay` 隔离候选包集成

目的：证明 `stay` 的真实源码可以解析由当前 PR 精确构建的候选包，并验证其自定义 `VisualizerShape` 在候选 `StayAnimatedChild` 时间线中的实际对象、ShapeMap 和生命周期行为。该场景不操作浏览器，也不启动或替换现有 `:80` 服务。

前置条件：

- 当前仓库 PR head 已通过 `pnpm verify`，并记录提交 SHA。
- 从该提交执行 `pnpm pack --pack-destination <临时目录>`，记录 tarball 绝对路径及 SHA-256。
- 记录 `/Volumes/2TB/chun/stay` 的消费方提交和状态；在 `/Volumes/2TB/chun/stay/.worktrees/react-stay-canvas-pr47-acceptance` 创建 detached 隔离工作树。
- 使用消费方 `package.json` 声明的 `pnpm@8.15.6`。候选依赖替换只允许发生在该隔离工作树；不得修改原工作目录、当前 `:80` 服务或 npm registry。

操作：

1. 在隔离工作树中把根包和 `apps/admin` 的 `react-stay-canvas` 依赖临时改为候选 tarball 的 `file:` 绝对路径，再使用 `corepack pnpm@8.15.6 install --no-frozen-lockfile` 生成仅供本次验收的依赖图。
2. 分别从根包和 `apps/admin` 解析 `react-stay-canvas/package.json`，确认解析路径位于隔离工作树依赖目录，版本为候选包内版本；同时保留 tarball SHA-256 作为源码与消费产物的绑定证据。
3. 在 `apps/web/components/algorithmVisilize/` 下创建仅供本次验收的临时 Vitest 探针，使用消费方真实 `Rect`（`VisualizerShape` 子类）构造两个关键帧，并调用候选包真实 `StayAnimatedChild.appendKeyFrame()` 与 `setCurrentTime()`。直接断言：
   - Child 的 `participatesInHistory` 为 `false`；
   - `shapeFramesMap` 保留命名轨道和两个关键帧；
   - 中间时刻的 `shapeMap` 含真实 `Rect` 实例，Shape 的 `parent` 是该 Child；
   - 插值后的几何位于两个关键帧之间，修改当前投影不替换或清空时间线。
4. 执行消费方确定性入口：

   ```sh
   corepack pnpm@8.15.6 check-types
   corepack pnpm@8.15.6 --filter web test -- --run components/algorithmVisilize/react-stay-canvas-candidate.acceptance.test.ts
   corepack pnpm@8.15.6 --filter web build
   ```

预期结果：依赖解析、全仓类型检查、1 个候选 API 探针和 web 生产构建全部以状态码 `0` 结束；探针必须检查实际 Child、消费方 Shape、ShapeMap 和时间线对象，不能只断言界面文本或 mock 返回值。

失败标准：任一命令失败；根包或 admin 仍解析到已发布版本；探针没有加载 tarball；实际对象或时间线与上述断言不符；构建依赖未声明的生产凭据；或执行影响现有 `:80` 服务。

证据：记录两仓提交、PR 编号、Node/pnpm 版本、tarball 路径与 SHA-256、两处解析路径、各命令摘要、消费方工作树状态和首个偏差。

清理：删除临时探针，移除明确命名的 detached 工作树和 tarball 临时目录，执行 `git worktree prune`；保留共享 pnpm store。清理后确认消费方原工作目录提交与状态未改变，且现有 `:80` 监听进程未被停止或替换。

## 证据记录

每次执行都建立一份记录：

| 字段 | 值 |
| --- | --- |
| 日期与时区 | |
| 操作人 | |
| 仓库提交 | |
| Node / npm / pnpm 版本 | |
| 完整门禁命令与结果 | |
| 聚焦 API 命令与结果 | |
| A1 历史状态 | 通过 / 失败 / 阻塞 / 未执行 |
| A2 场景导出与导入 | 通过 / 失败 / 阻塞 / 未执行 |
| A3 动画投影与历史隔离 | 通过 / 失败 / 阻塞 / 未执行 |
| 可选视觉补充 | 通过 / 失败 / 阻塞 / 未执行 / 不要求 |
| 下游服务 | 通过 / 失败 / 阻塞 / 未执行 |
| 证据位置 | |
| 清理结果 | |
| 备注 / 首个偏差 | |

截图默认保存在仓库外；只有明确要维护为长期文档时才纳入仓库。整个示例集验收完成后关闭 preview 服务。

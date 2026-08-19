# Event Architecture

## Goal

在不引入 Pointer Session 的前提下，将事件输入、事件定义执行和 listener 派发拆成单向、职责清晰的架构，并保持现有公共 API 可用。

```text
DOM
  -> DomInputAdapter
  -> EventRuntime
  -> ActionRouter
  -> User Listener
```

## Accepted decisions

- `ActionRouter` 独占 listener registry、listener state gate、selector/target 解析、gesture owner、`composeStore` 和用户 callback 派发。
- `EventRuntime` 独占 `EventProps` 匹配、`conditionCallback`、`successCallback` 和动态事件生命周期。
- `DomInputAdapter` 只负责无 Pointer 的 DOM listener 绑定、解绑和输入标准化，不接触 Child、selector 或事件 DSL。
- `StayTools.triggerAction` 和 `deleteListener` 作为兼容门面保留，内部委托 `ActionRouter`。
- listener callback 每次获得属于本次调用的 routed event envelope；一个 listener 对 event envelope 的修改不能污染另一个 listener。
- target predicate 检查的 Child 必须就是 callback 最终收到的 target。
- gesture continuation/end 使用 gesture start 捕获的 owner；start 没有 owner 时，后续不得重新命中。
- listener state 仍在处理该 listener 时读取；本轮不改变同一次 dispatch 中同步 `switchState` 的现有时序。
- 同名 listener 替换视为新的 registration：旧的 `composeStore`、gesture owner 和注册顺序都不继承。
- 只有物理 `MouseEvent`、phase 名称与标准 trigger 同时匹配时才进入 gesture owner 流程；手动触发或自定义的同名事件仍按普通 action 派发，且不得捕获或释放真实手势的 owner。
- 现有 `EventProps`、`ListenerProps`、`ActionEvent`、`StayCanvasRef.trigger` 和 StayTools 公共签名保持不变。

这些决定仅在出现与现有公共文档、真实调用或回归测试矛盾的新证据时重新讨论。

## Non-goals

- 本轮不实现 Pointer Capture、Pointer Session、多指针或 MouseEvent/PointerEvent 双轨兼容。
- 不引入 FSM 框架、事件总线、Observable、DI 容器或通用 gesture plugin 系统。
- 不顺带重写 renderer、history、shape、selector 语法或公开手势 DSL。

## Delivery map

### U1 — ActionRouter

- Outcome: listener 派发不再位于 `stayTools.ts`，listener/target/gesture/compose 状态有单一所有者。
- Scope: `ActionRouter`、Stay/EventDispatcher 委托、路由契约测试和相关文档。
- Evidence: 单元测试、类型检查、库与 example 构建；Events、Selectors、State、Annotator、Diagram 手册场景。
- Intended PR: base `codex/example-regression-gallery`。

### U2 — EventRuntime and EventRegistry

- Outcome: 事件定义与动态生命周期原子管理，事件执行流程为 match -> seed -> condition -> success -> route。
- Scope: runtime/registry、EventDispatcher 委托、动态链 characterization tests。
- Evidence: 动态事件增删覆盖、手动 trigger、同步异常和现有完整测试。
- Dependency: U1 merged or explicitly selected as a stacked base.

### U3 — DomInputAdapter and PressedInputState

- Outcome: DOM wiring 与业务事件执行分离，EventDispatcher 成为薄协调层。
- Scope: 无 Pointer DOM adapter、pressed input state、mount/destroy/reCreate 生命周期测试。
- Evidence: keyboard、mouse、wheel、drag/drop、多 Canvas、reCreate/destroy；受影响的真实验收手册场景。
- Dependency: U2 merged or explicitly selected as a stacked base.

## Merge gates

- 每个单元独立完成 deterministic checks 和 PR-boundary CR。
- 架构整洁、职责清晰、单向依赖和可读控制流是硬性验收条件；测试通过不能替代这些条件。
- 默认等待人工合并后再推进下一个依赖单元。

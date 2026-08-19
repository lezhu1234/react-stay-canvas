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

## Module layout

```text
src/stay/events/
├── contracts.ts
├── input/
│   ├── domInputAdapter.ts
│   ├── eventDispatcher.ts
│   └── pressedInputState.ts
├── runtime/
│   ├── eventRegistry.ts
│   └── eventRuntime.ts
└── routing/
    ├── actionEventEnvelope.ts
    ├── actionRouter.ts
    └── actionTargetResolver.ts
```

- `input` 将 DOM 输入标准化为 `EventInput`，维护按键快照，并负责绑定生命周期。
- `runtime` 匹配和执行事件定义，管理动态事件注册表。
- `routing` 解析 listener、state、selector、target 和 gesture owner，最后调用用户 callback。
- `contracts.ts` 只声明相邻层之间使用的窄接口，不保存状态，也不实现业务逻辑。
- `Stay` 是组合根，负责创建并连接上述对象；各层不反向依赖 `Stay`。

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

## Runtime invariants

- `EventRegistry` 是事件定义的唯一存储；注册、替换、删除和清空都经由该对象完成。
- 每次原始输入先快照事件名称，随后按名称实时读取定义：新增名称下一轮生效，删除立即生效，同名替换保持原位置并可在本轮生效。
- 每个匹配定义独立创建 `ActionEvent`，并在执行该定义时实时读取 state；一个定义修改 event seed 不污染后续定义。
- `conditionCallback`、`successCallback` 和 listener callback 的同步异常继续向调用方抛出；已经完成的动态增删不回滚。
- 物理 `mouseup` 的 gesture owner 清理位于 runtime 的 terminal `finally` 中，事件定义抛错不能跳过清理。

## Input and lifecycle invariants

- `DomInputAdapter` 只将顶层 Canvas 的 DOM 事件标准化为 runtime input，并对所有绑定提供对称解绑。
- `PressedInputState` 是键盘按键和鼠标按钮状态的唯一所有者；每次派发获得独立快照，销毁时统一清空。
- `EventDispatcher` 仅协调 input adapter、pressed state 与 `EventRuntime`，不保存事件定义或 listener 状态。
- `Stay.destroy()` 是 DOM 监听、render loop、事件定义、gesture owner 和 listener 状态的统一终止出口。
- React unmount、显式 `reCreate()` 和 resize recreate 都必须先销毁旧 Stay，不能遗留 DOM listener 或 animation frame。

# Event Architecture

## Goal

将 DOM 输入、Pointer Session、事件定义执行和 listener 派发拆成单向、职责清晰的架构，并保持现有公共事件名称可用。

```text
DOM
  -> DomInputAdapter
  -> PointerSession
  -> EventInput { rawAction?, sessionTransition? }
  -> EventRuntime
  -> ActionRouter
  -> User Listener
```

## Module layout

```text
src/stay/events/
├── clickPairing.ts
├── contracts.ts
├── gesturePhases.ts
├── input/
│   ├── domInputAdapter.ts
│   ├── eventDispatcher.ts
│   ├── manualActionAdapter.ts
│   ├── pointerSession.ts
│   └── pressedInputState.ts
├── runtime/
│   ├── eventRegistry.ts
│   └── eventRuntime.ts
└── routing/
    ├── actionEventEnvelope.ts
    ├── actionRouter.ts
    └── actionTargetResolver.ts
```

- `input` 将 DOM 输入标准化为 `EventInput`，其中公开 raw action 与 Pointer Session 状态转换彼此独立。
- `runtime` 按一次注册顺序同时处理 raw action 和 session transition，并管理带 role/scope 的动态事件注册表。
- `routing` 解析 listener、state、selector、target 和绑定 session id 的 gesture owner，最后调用用户 callback。
- `gesturePhases.ts` 定义事件 definition 的 role/scope；`clickPairing.ts` 保存绑定 session id 的点击配对状态。
- `contracts.ts` 只声明相邻层之间使用的窄接口，不保存状态，也不实现业务逻辑。
- `Stay` 是组合根，负责创建并连接上述对象；各层不反向依赖 `Stay`。

## Accepted decisions

- `ActionRouter` 独占 listener registry、listener state gate、selector/target 解析、gesture owner、`composeStore` 和用户 callback 派发。
- `EventRuntime` 独占 `EventProps` 匹配、`conditionCallback`、`successCallback` 和动态事件生命周期。
- `DomInputAdapter` 只负责 DOM listener 的对称绑定、解绑和输入标准化，不保存手势目标，也不接触 selector 或事件 DSL。
- `PointerSession` 独占主指针会话、Pointer Capture 和开始/继续/终止状态；所有正常释放与取消路径都汇入同一个幂等终止出口。
- `PressedInputState` 独占键盘键和鼠标按钮状态；Pointer Session 只能通过它更新与快照输入状态。
- 公开 `mousedown/mousemove/mouseup` action 与内部 `start/continue/end/cancel` transition 是正交维度；一个真实输入可以携带其中一个或两者。
- 普通 initiating 输入由 Pointer Events 同步产生公开 action；compatibility Mouse Events 只补充 Pointer Events 不表达的 mouse chord 按钮变化。
- terminal input 从进入 `EventRuntime` 到定义执行、listener 派发和 session 清理完成，是一个不可重入的同步边界。在这个边界内通过 `dispatchEvent` 同步发起的新 `pointerdown`，以及 Mouse fallback 的 `mousedown`，会被忽略，不创建新 Pointer Session，也不派发公开 `mousedown` action。
- `StayTools.triggerAction` 和 `deleteListener` 作为公共门面保留，内部委托 `ActionRouter`；手动触发的 `info` 只接受普通 action 数据。
- `originEvent` 专门保存原生 Event；listener 的 `e` 始终是标准化后的普通 `ActionEvent`，两者不共享身份或可变字段。
- `NormalizedActionEvent` 是 runtime 与 router 之间的内部数据契约，不包含 target；只有 Router 能在 routed `ActionEvent` 上附加 target。
- evaluated action map 的 key 是权威 action 名称；definition callback 不能通过修改 seed 的 `name` 改变 target predicate 或 listener 看到的路由身份。
- listener callback 每次获得属于本次调用的 routed action envelope；一个 listener 对 action envelope 的修改不能污染另一个 listener。
- target predicate 检查的 Child 必须就是 callback 最终收到的 target。
- gesture continuation/end 使用 gesture start 捕获的 owner；start 没有 owner 时，后续不得重新命中。
- listener 声明了标准 gesture family 的后续事件名、但该动态 definition 在 start 时尚未注册时，Router 仍预先捕获 start owner，以保持逐阶段 `successCallback` 事件链；definition 后续实际注册为非标准 trigger 时仍按 ordinary action 路由，不使用该 owner。
- listener state 仍在处理该 listener 时读取；本轮不改变同一次 dispatch 中同步 `switchState` 的现有时序。
- 同名 listener 替换视为新的 registration：旧的 `composeStore`、gesture owner 和注册顺序都不继承。
- 只有带标准 gesture role 和真实 session transition 的输入才进入 gesture owner 流程；手动触发或非标准 trigger 的同名事件仍按普通 action 派发，且不得捕获或释放真实手势的 owner。
- `StayCanvasRef.trigger(name, payload)` 保持不变；直接调用 `StayTools.triggerAction` 时，不再支持把原生 Event 放入 `triggerEvents.info`。
- 旧的公开 `TriggerEvents` 类型仅作为 `ManualTriggerEvents` 的 deprecated alias 保留，不再暴露内部 evaluated action 结构。

这些决定仅在出现与现有公共文档、真实调用或回归测试矛盾的新证据时重新讨论。

## Decision record: synchronous native start reentry

### Decision

不支持在 `dragend`、`moveend`、`mouseup` 或取消终止链尚未返回时，通过用户 callback 同步调用 `canvas.dispatchEvent(...)` 开始另一条原生 Pointer Session。嵌套的 `pointerdown`/fallback `mousedown` 输入由当前 Canvas 忽略。

这不是对真实用户输入的限制：浏览器只有在当前 JavaScript 事件处理栈返回后，才会派发下一次独立的物理按下。该边界只影响 callback 中人为同步派发的原生 down 事件。应用级联动应使用 `StayTools.triggerAction`；测试若确实需要开始下一条原生会话，应在当前 terminal callback 返回后再派发。

### Evidence

连续三轮 CR 证明“立即同步开启第二条 Pointer Session”会让两个会话同时竞争动态事件 definition、预定义 drag/move 进度 store、click pairing、gesture owner 和 terminal cleanup。仅把 Registry 或 owner 改为多 session 容器，仍会把冲突移动到另一处全局手势状态，因此不继续支持这一内部重入模型。

### Reopen condition

只有在出现真实公共调用依赖同步嵌套原生 down，并且需求明确要求它在当前 terminal callback 返回前立即生效时，才重新讨论此决定。重新支持时必须先定义完整的 per-session execution context，不能通过增加局部 Map、标记或兼容分支恢复。

## Non-goals

- 本轮只跟踪每个 Canvas 的主指针，不实现多指针手势。
- Pointer Events 是主输入链；不支持 Pointer Events 的环境使用 Mouse Events 会话作为兼容入口。
- 不引入 FSM 框架、事件总线、Observable、DI 容器或通用 gesture plugin 系统。
- 不顺带重写 renderer、history、shape、selector 语法或公开手势 DSL。

## Runtime invariants

- `EventRegistry` 是事件定义的唯一存储；注册、替换、删除和清空都经由该对象完成。
- Registry entry 显式保存 ordinary/click/gesture role 与 persistent/current-session scope；Runtime 不在派发分支中临时猜测动态定义归属，也不保存并发 Pointer Session 槽位。
- 每次原始输入先快照事件名称，随后按名称实时读取定义：新增名称下一轮生效，删除立即生效，同名替换保持原位置并可在本轮生效。
- 每个匹配定义独立创建 `NormalizedActionEvent`，并在执行该定义时实时读取 state；一个定义修改 event seed 不污染后续定义。
- DOM 和手动输入在进入 listener 路由前都转换为 `NormalizedActionEvent`；Router 不读取原生 Event 上的自定义字段。
- Router 根据权威 action key 和 target decision 创建全新的 routed `ActionEvent`；definition seed 上附加的 `name` 或 `target` 不能越过该边界。
- 手动 action 在 dispatch 开始时统一快照 state、pressedKeys 和 point；原生 Event 仅作为独立的 `originEvent` 传递。
- `conditionCallback`、`successCallback` 和 listener callback 的同步异常继续向调用方抛出；已经完成的动态增删不回滚。
- Pointer Session 的 terminal 清理位于 runtime 的 `finally` 中，事件定义或 listener 抛错不能跳过动态事件、点击配对和 gesture owner 清理。
- Registry、click pairing 和 gesture owner 使用同一个 session id；terminal `finally` 只清理该 id。新的原生 Pointer Session 必须等当前 terminal 边界完成后才能开始。
- 取消只派发当前会话动态注册的标准 `dragend`/`moveend`，不得产生 `click`、普通 `mouseup` 或清除无关动态事件。
- 正常点击没有达到 drag/move 条件时，不派发 `dragend`/`moveend`，但仍清理本次会话注册的动态事件。

## Input and lifecycle invariants

- `DomInputAdapter` 只将顶层 Canvas 和必要的 window/document 终止信号标准化为 runtime input，并对所有绑定提供对称解绑。
- `PressedInputState` 是键盘按键和鼠标按钮状态的唯一所有者；每次派发获得独立快照，销毁时统一清空。
- Canvas 内开始的主指针会话通过 Pointer Capture 延续到 Canvas 外；`pointerup`、`pointercancel`、`lostpointercapture`、window blur 和 document hidden 统一终止且只终止一次。initiating button 已松开后的 `lostpointercapture` 属于正常隐式释放，按键仍按下时的异常 Capture 丢失才属于取消。
- Pointer Session 正在同步派发 terminal input 时不接受新的原生 down；被忽略的输入不得修改 pressed state、获取 Pointer Capture 或注册动态 gesture definition。
- Pointer Capture 不可用时，window terminal listener 是释放兜底；多个 Canvas 的会话状态彼此隔离。
- Canvas path 内或经 Pointer Capture 重定向到 Canvas 的释放由 Canvas target listener 处理；window capture listener 只处理 composed path 不含 Canvas 的外部释放。
- `pointercancel`、异常 `lostpointercapture`、blur 和 visibilitychange 保留真正的原生 cause Event；terminal 坐标独立取自 session 的最后 pointer sample。
- `EventDispatcher` 仅协调 input adapter、pressed state 与 `EventRuntime`，不保存事件定义或 listener 状态。
- `Stay.destroy()` 是 DOM 监听、render loop、事件定义、gesture owner 和 listener 状态的统一终止出口。
- React unmount、显式 `reCreate()` 和 resize recreate 都必须先销毁旧 Stay，不能遗留 DOM listener 或 animation frame。

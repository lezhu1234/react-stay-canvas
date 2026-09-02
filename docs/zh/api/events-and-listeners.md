# Event 与 Listener API

[English](../../en/api/events-and-listeners.md) · [交互与事件指南](../interaction-and-events.md)

事件流、selector、状态、Pointer Session、macOS 修饰键和手动动作见[交互与事件](../interaction-and-events.md)。

## ListenerProps

```ts
import type { ListenerProps } from "react-stay-canvas"

const saveListener: ListenerProps = {
  name: "save-listener",
  event: "save",
  callback: () => {},
}
```

| 字段 | 说明 |
| --- | --- |
| `name` | Listener 唯一标识，也是 composeStore 的隔离边界 |
| `state` | 当前 Canvas state 满足表达式时才参与路由 |
| `selector` | 目标查询；原生指针 action 省略时默认使用 root selector `.stay-canvas` |
| `event` | 订阅一个或多个 action 名称 |
| `sortBy` | 覆盖默认的较小边界优先目标顺序 |
| `callback` | action 路由完成后同步执行 |

Listener 的目标在标准 drag/move 手势开始时确定，后续 continuation 和 terminal 阶段保持同一 owner。普通手动 action 即使使用同名 `drag`，也不会进入 Pointer Session owner 流程。

## ActionCallbackProps

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `originEvent` | `Event` | 当前输入的原生事件对象；不得跨异步阶段依赖其传播状态 |
| `e` | `ActionEvent` | 当前 Listener 独立的 action envelope |
| `store` | `Map` 或 `StayStore<Schema>` | Event 定义共享存储 |
| `stateStore` | `Map` 或 `StayStore<Schema>` | 当前 Canvas state 的存储，切 state 时清空 |
| `composeStore` | object | 同一 Listener 内由回调返回函数合并的状态 |
| `canvas` | `Canvas` | 当前运行时 Canvas |
| `tools` | `StayTools` | 当前 Canvas 的工具实例 |
| `payload` | object | 手动 trigger 传入的业务数据 |

`callback` 可以返回一个以 action 名为 key 的函数映射。函数返回的对象会同步合并到该 Listener 的 `composeStore`。

`StayStore<Schema>` 是同一个原生 Map 的类型化视图；`get()` 和 `set()` 会按已知字符串 key 推导各自的 value 类型。可通过 `EventProps`、`ListenerProps` 或 `StayCanvasProps` 末尾的泛型传入 store schema；省略时仍保持原有 `Map<string, any>` 回调类型。schema 不会初始化数据，因此 key 尚未写入时 `get()` 仍返回 `undefined`。示例见[交互与事件：类型化回调 store](../interaction-and-events.md#类型化回调-store)。

## ActionEvent

始终存在：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | `string` | 当前注册 action 名；Event successCallback 修改后仍会恢复该名称 |
| `state` | `string` | 当前 Canvas state |
| `pressedKeys` | `Set<string>` | 当前 Listener 的独立快照 |
| `isMouseEvent` | `boolean` | action 是否携带指针坐标语义 |

按输入来源可选：

| 字段 | 出现条件 |
| --- | --- |
| `target` | selector 成功解析出 Child |
| `x`, `y`, `point` | 原生指针、鼠标或 wheel 输入时是 Content 坐标；手动 action 仅保留调用方显式提供的值 |
| `movement` | Pointer Session 中相邻采样的 View 坐标增量；普通无状态鼠标事件为 `{ x: 0, y: 0 }` |
| `key` | 键盘 action 或显式提供 key 的手动 action |
| `deltaX`, `deltaY`, `deltaZ` | wheel action 或显式提供 delta 的手动 action |
| `pointerId`, `pointerType` | Pointer Events 输入 |
| `cancelled`, `cancelReason` | Pointer Session 取消产生的 terminal action；原因包括 DOM 取消和逻辑 `resize` |

action 名不决定这些字段是否存在。使用属性前应用类型守卫：

```ts
import type { ActionEvent, ContentPoint } from "react-stay-canvas"

function hasPointerPosition(
  e: ActionEvent,
): e is ActionEvent & { x: number; y: number; point: ContentPoint } {
  return e.x !== undefined && e.y !== undefined && e.point !== undefined
}
```

原生指针链路依次经过三套内部坐标：Client 是浏览器窗口像素；View 是 CSS 尺寸归一化后的 `width × height` Canvas 平面；Content 是逆向应用 `tools.viewport` 后的场景坐标。公开 `e.point` 的类型是 `ContentPoint`，保证命中和 Child 操作不需要关心视口；`e.movement` 的类型是 `ViewVector`，保证拖拽阈值和平移手感不随缩放改变。需要显式转换时使用 `tools.coordinates`。

## EventProps

```ts
import type {
  EventProps,
} from "react-stay-canvas"

const saveEvent: EventProps<"save"> = {
  name: "save",
  trigger: "keydown",
}
```

导出的 `EventProps<EventName, StoreSchema?, StateStoreSchema?>` 组合了必需的 `name`/`trigger` 字段、可选的条件与成功回调，以及可选的目标谓词。请直接使用导出类型，不要在应用中重写内部 trigger union。

- `conditionCallback` 在目标解析前判断 action 是否成立；
- `successCallback` 在 action 成立后执行，可注册后续动态 Event；
- `deleteEvent(name)` 删除当前可见的 Event 定义；
- `withTargetConditionCallback` 对某个候选 Child 做附加判断；
- 动态 Event 的 session/global scope 由运行时决定，应用不应用 action 名推断生命周期。

## 预定义 action 名

鼠标与指针：

```text
mousedown, mouseup, mousemove, mouseenter, mouseleave, click,
dragstart, drag, dragend, startmove, move, moveend,
dragover, drop, zoomin, zoomout
```

键盘：

```text
keydown, keyup, undo, redo
```

`dragstart` 会在符合条件的主键按下时触发；后续 `drag` 需要至少移动 10 px，正常 `dragend` 还要求 continuation 已经开始。`startmove/move/moveend` 是按下后立即进入的移动链。具体条件以 `PredefinedEventList` 当前定义为准。

`PredefinedMouseEventName` 类型还包含 `wheel` 和 `hover`，但当前 `PredefinedEventList` 没有注册这两个同名 Event 定义。需要它们时，应用必须通过 `eventList` 提供明确的定义，不能只添加同名 Listener。

## ManualTriggerEvents

```ts
type ManualTriggerEvents<EventName extends string> = Partial<
  Record<EventName, { info: ManualActionEvent }>
>
```

`ManualActionEvent` 是普通数据，不是原生 `Event`。可以提供 `state`、`pressedKeys`、`isMouseEvent`、`x`、`y`、`point`、`key`、`deltaX`、`deltaY` 和 `deltaZ`；不能提供 `target`、Pointer Session id 或 cancellation metadata。原生 Event 必须作为 `tools.triggerAction()` 的第一个参数传入。

## 相关参考

- [交互与事件](../interaction-and-events.md)
- [StayCanvas API](./stay-canvas.md)
- [StayTools API](./stay-tools.md)

# 交互与事件

[文档首页](./README.md) · [English](../en/interaction-and-events.md)

`react-stay-canvas` 不会让业务 Listener 直接处理所有 DOM 细节。原生输入先被标准化，再由 Event 定义判断是否产生动作，最后根据 Listener 的 state、selector 和目标规则进入回调。

## 一次输入如何到达 Listener

```text
PointerEvent / MouseEvent / KeyboardEvent / WheelEvent
  → DOM 输入适配与按键状态
  → Pointer Session（仅连续指针交互）
  → Event 定义：trigger → conditionCallback → successCallback
  → 命名动作与 ActionEvent
  → Listener：event → state → selector / target
  → callback
```

这里有三个不同的“名称”：

- DOM 类型，例如 `pointerdown`、`keydown`、`wheel`；
- Event 的 `trigger`，例如库内部统一使用的 `mousedown`；
- 动作名，也就是 Event 的 `name`，例如 `dragstart`、`zoomin` 或自定义的 `save-request`。

Listener 订阅的是动作名。支持 Pointer Events 的浏览器中，`mousedown` 动作的 `originEvent` 可能是原生 `PointerEvent`，所以不要用动作名推断原生事件类型。

程序调用走一条更短的路径：

```text
StayCanvas ref.trigger / StayTools.triggerAction
  → 手动 ActionEvent
  → Listener 的 state 门禁
  → callback（默认没有场景 target）
```

手动动作不会执行 `eventList` 中的 `conditionCallback` 或 `successCallback`，也不会开始、继续或结束真实 Pointer Session。

## 第一个 Listener

```tsx
import { useMemo, useState } from "react"
import { StayCanvas, type ListenerProps } from "react-stay-canvas"

export function SelectableCanvas() {
  const [selectedId, setSelectedId] = useState<string>()

  const listeners = useMemo<ListenerProps[]>(
    () => [
      {
        name: "select-card",
        event: "click",
        selector: ".card",
        callback: ({ e }) => {
          if (!e.target) return
          setSelectedId(e.target.id)
        },
      },
    ],
    []
  )

  return (
    <>
      <StayCanvas width={440} height={260} listenerList={listeners} />
      <output>{selectedId ?? "未选择"}</output>
    </>
  )
}
```

这个 Listener 只有在以下条件同时满足时才会调用：

1. `click` 动作已经由 Event 定义产生；
2. Listener 的 state 当前可用；
3. 点击位置命中 `.card` selector 选出的 Child。

没有命中时不会调用回调，而不是调用回调并把 `target` 设为空。

示例假设场景中已经通过 `mounted` 添加了 `className: "card"` 的 Child。

## Listener 的筛选顺序

`ListenerProps` 的主要字段是：

| 字段 | 作用 |
| --- | --- |
| `name` | Listener 的唯一名称；同名注册会替换旧 Listener |
| `event` | 一个动作名或动作名数组 |
| `state` | Listener 可用的 Canvas state，默认 `default-state` |
| `selector` | 可成为目标的 Child，默认 `.stay-canvas` 根 Child |
| `sortBy` | 多个候选 Child 的排序函数；重叠目标应提供明确 comparator |
| `callback` | 接收动作并执行场景或应用逻辑 |

Listener 按注册顺序处理。state 会在处理每个 Listener、每个动作前实时读取，因此前面的 Listener 同步调用 `switchState` 后，后面的 Listener 会看到新 state。

同名替换会创建一份新的 Listener 注册：旧的 `composeStore`、手势目标和原注册顺序不会继承。

## selector 与目标

selector 匹配 Child，而不是 Shape：

```text
.node                 className 为 node
.node:active          完整 className 为 node:active
#node-a               id 为 node-a
.node|.label          node 或 label
.node&!#node-a        node，但排除 node-a
(.node|.label)&!#node-a 使用括号明确组合关系
```

支持 `&`、`|`、`!` 和括号。表达式中不要加入空格；组合复杂时应使用括号，不要依赖运算符优先级猜测结果。

Child 的 `className` 不是 DOM 的空格分隔列表。`node:active` 以 `node` 为基础 class；`.node` 与 `.node:active` 分别匹配基础类和完整值。

指针动作会先按 selector 找出候选 Child，再按当前 Canvas 坐标进行命中测试。当前默认 comparator 不提供稳定排序保证，因此重叠目标应始终传入 `sortBy(a, b)`。

`withTargetConditionCallback` 是 Event 定义上的第二层目标判断。它收到候选 `target`，只有返回 `true` 的 Child 才能进入 Listener。通过这个判断的 Child 就是回调最终收到的 `e.target`。

键盘和手动动作默认没有场景 target。没有目标判断函数时，selector 不会过滤这类动作；event 和 state 匹配的 Listener 会以无 target 的方式运行。手动触发也不会因为 Listener 写了 selector 就自动查找 Child。

## 连续手势的目标保持不变

`dragstart → drag → dragend` 和 `startmove → move → moveend` 会在开始阶段为每个 Listener 捕获自己的目标：

- 后续阶段继续使用开始时命中的 Child；
- 指针经过另一个 Child 时不会转移目标；
- 开始时没有命中，就不会在移动途中重新获取目标；
- 开始时 Listener 因 state 不可用而跳过，途中切换 state 也不会让它接管当前手势。

因此，拖动对象时可以安全地把 `e.target` 当作本次手势的所有者，而不需要在每次 `drag` 中重新命中。

## state、store 与 composeStore

Canvas 初始 state 是 `default-state`。通过 `tools.switchState("draw")` 切换后，只有 state 表达式匹配 `draw` 的 Listener 才可用。

```tsx
const listeners: ListenerProps[] = [
  { name: "draw", state: "draw", event: "click", callback: drawItem },
  { name: "select", state: "select", event: "click", callback: selectItem },
  { name: "always", state: "all-state", event: "mousedown", callback: recordInput },
]
```

state 也支持 `&`、`|`、`!` 和括号，例如 `draw|select`、`!disabled`。`all-state` 是保留值，表示所有已知 state。

回调中的三种存储用途不同：

| 存储 | 生命周期 |
| --- | --- |
| `store` | 当前 Canvas 实例持续存在，切换 state 不清空 |
| `stateStore` | 当前 Canvas 实例持有，但每次 `switchState` 都会清空 |
| `composeStore` | 每个 Listener 注册独占，用于连接该 Listener 的多次动作 |

推荐通过回调返回的动作函数更新 `composeStore`：

```tsx
const dragListener: ListenerProps = {
  name: "drag-card",
  event: ["dragstart", "drag", "dragend"],
  selector: ".card",
  callback: ({ e, composeStore }) => {
    if (!e.target || e.x === undefined || e.y === undefined) return
    const target = e.target
    const x = e.x
    const y = e.y

    return {
      dragstart: () => {
        target.moveInit()
        return { target, start: { x, y } }
      },
      drag: () => {
        composeStore.target.move(
          x - composeStore.start.x,
          y - composeStore.start.y
        )
      },
    }
  },
}
```

每次动作都会先调用外层 `callback`，然后只执行返回对象中与当前 `e.name` 同名的函数。该函数返回的对象会合并进这个 Listener 自己的 `composeStore`。

## `originEvent` 与 `ActionEvent`

Listener 回调同时收到两个事件对象：

- `originEvent` 是触发当前动作的原生 Event；需要 `preventDefault()`、检查 DOM 类型或读取浏览器字段时使用它。
- `e` 是库生成的普通 `ActionEvent`；使用它读取动作名、Canvas 坐标、按键状态和场景 target。

它们不是同一个对象。每次 Listener 调用也会获得独立的 `ActionEvent` 外壳，`point` 和 `pressedKeys` 都会复制；一个 Listener 对它们的修改不会污染下一个 Listener。

`ActionEvent` 始终具有：

- `name`
- `state`
- `pressedKeys`
- `isMouseEvent`

其余字段取决于输入来源和路由结果：

| 字段 | 何时存在 |
| --- | --- |
| `x`、`y`、`point` | 具有指针坐标的原生输入，或手动提供这些字段 |
| `target` | 当前 Listener 的目标解析成功 |
| `key` | 键盘输入，或手动提供 |
| `deltaX/Y/Z` | Wheel 输入，或手动提供 |
| `pointerId`、`pointerType` | 真实 Pointer Session |
| `cancelled`、`cancelReason` | 手势终止信息；取消时 `cancelled` 为 `true` |

`isMouseEvent` 是为兼容保留的名称，表示动作带有指针位置语义，并不保证设备一定是鼠标。区分鼠标、触控笔和触摸应读取 `pointerType`。

## 先缩小类型，再读取可选字段

动作名不能保证字段存在，因为手动动作也可以命名为 `drag` 或 `keydown`。读取坐标和 target 前应使用类型守卫：

```tsx
import type { ActionEvent, Coordinate } from "react-stay-canvas"

type PositionedAction<EventName extends string = string> =
  ActionEvent<EventName> & {
    x: number
    y: number
    point: Coordinate
  }

function hasPointerPosition<EventName extends string>(
  e: ActionEvent<EventName>
): e is PositionedAction<EventName> {
  return e.x !== undefined && e.y !== undefined && e.point !== undefined
}

function hasPointerTarget<EventName extends string>(
  e: ActionEvent<EventName>
): e is PositionedAction<EventName> & { target: NonNullable<ActionEvent["target"]> } {
  return hasPointerPosition(e) && e.target !== undefined
}
```

对象级类型守卫在返回的动作函数和 `forEach` 等嵌套闭包中仍能保持缩小结果，比只在外层分别判断 `e.x`、`e.y` 更可靠。

## 预定义动作

默认 Event 定义提供以下常用动作：

| 动作 | 默认条件 |
| --- | --- |
| `mousedown`、`mouseup` | 主指针按下和松开；mouse chord 的额外按键也会分别产生动作 |
| `mousemove` | 指针移动且主键 `mouse0` 未按下 |
| `mouseenter`、`mouseleave` | 指针进入或离开顶层 Canvas |
| `click` | 正常按下和松开间隔小于 500ms，且移动距离小于 10px |
| `dragstart` | 主键按下，且未按 Control |
| `drag` | 主键保持按下，移动至少 10px，且未按 Control |
| `dragend` | 已进入 drag 后正常结束，或当前 drag 会话被取消 |
| `startmove` | Control 与主键同时按下 |
| `move` | Control 与主键保持按下并移动 |
| `moveend` | 已进入 move 后正常结束，或当前 move 会话被取消 |
| `zoomin`、`zoomout` | Wheel 的 `deltaY` 分别小于或大于 0 |
| `keydown`、`keyup` | Canvas 获得焦点后的键盘输入 |
| `undo` | Control 保持按下时松开 Z |
| `redo` | Control 和 Shift 保持按下时松开 Z |
| `dragover`、`drop` | 浏览器原生拖放输入 |

`undo` 和 `redo` 只是动作名，不会自动调用 `tools.undo()` 或 `tools.redo()`；应用需要注册对应 Listener。

## `pressedKeys`、焦点和平台差异

`pressedKeys` 是当前输入状态的快照：

- 键盘使用 `KeyboardEvent.key`，例如 `Control`、`Shift`、`Meta` 和空格 `" "`；
- 鼠标主键/左键是 `mouse0`；
- 中键是 `mouse1`；
- 右键是 `mouse2`。

键盘动作只在顶层 Canvas 获得焦点时产生。`focusOnInit` 默认开启，也可以调用 `StayCanvasRef.focus()` 主动聚焦。按键在 Canvas 外松开时，库会对账内部按键状态，但不会伪造一条 Canvas `keyup` 动作。

当前预定义 `startmove`、`undo` 和 `redo` 使用 Control，不会自动把 macOS Command 当作 Control。macOS 的 Control + 主键还可能触发系统右键菜单。需要跨平台平移时，推荐像 Transform 示例一样覆盖为“空格 + 主键”；需要 macOS 快捷键时，应显式支持 `Meta`。

如果 Wheel Listener 调用 `originEvent.preventDefault()`，请给 `StayCanvas` 设置 `passive={false}`。

## Pointer Session 和 Canvas 外释放

每个 `StayCanvas` 最多跟踪一条主 Pointer Session。它解决的是“在 Canvas 内开始，离开后仍应继续并正确结束”的生命周期问题。

```text
pointer down inside Canvas
  → start session and capture pointer
pointer move inside or outside
  → continue the same session and retain the start target
pointer up
  → normal terminal
pointercancel / lostpointercapture / window blur / document hidden
  → cancelled terminal
```

浏览器支持 Pointer Events 时，库会在开始阶段请求 Pointer Capture。Capture 不可用或没有建立时，window 上的终止监听器作为外部释放兜底。Canvas 内或被 capture 重定向回 Canvas 的松开仍由 Canvas 自己的 DOM listener 处理。

所有正常和取消路径只终止一次。取消终止具有以下行为：

- `dragend` 或 `moveend` 可收到 `e.cancelled === true`；
- `e.cancelReason` 为 `pointercancel`、`lostpointercapture`、`blur` 或 `visibilitychange`；
- 坐标使用本次会话最后收到的指针位置；
- `originEvent` 保留真正导致取消的原生 Event；
- 不产生 `click`，也不把取消伪装成普通 `mouseup`。

当前模型只跟踪每个 Canvas 的主指针，不提供双指缩放等多指针手势。不同 Canvas 的按键状态、目标和 session 相互隔离。

## 用空格键覆盖默认平移

下面的 Event 定义保留 `startmove → move → moveend` 动作名，但把默认 Control 条件改为空格键：

```tsx
import {
  MOUSE_EVENTS,
  type EventProps,
  type ListenerProps,
} from "react-stay-canvas"

const isSpacePressed = (keys: Set<string>) =>
  keys.has(" ") || keys.has("Spacebar")

const spaceMoveEnd: EventProps<string> = {
  name: "moveend",
  trigger: MOUSE_EVENTS.MOUSE_UP,
  conditionCallback: ({ e, store }) =>
    Boolean(e.cancelled || store.get("spaceMoving")),
  successCallback: ({ store, deleteEvent }) => {
    store.set("spaceMoving", false)
    deleteEvent("move")
    deleteEvent("moveend")
  },
}

const spaceMove: EventProps<string> = {
  name: "move",
  trigger: MOUSE_EVENTS.MOUSE_MOVE,
  conditionCallback: ({ e }) =>
    isSpacePressed(e.pressedKeys) && e.pressedKeys.has("mouse0"),
  successCallback: ({ store }) => {
    store.set("spaceMoving", true)
    return spaceMoveEnd
  },
}

export const spaceStartMove: EventProps<string> = {
  name: "startmove",
  trigger: MOUSE_EVENTS.MOUSE_DOWN,
  conditionCallback: ({ e }) =>
    isSpacePressed(e.pressedKeys) && e.pressedKeys.has("mouse0"),
  successCallback: ({ store }) => {
    store.set("spaceMoving", false)
    return [spaceMove, spaceMoveEnd]
  },
}

export const spacePanListener: ListenerProps = {
  name: "space-pan",
  event: ["startmove", "move", "moveend"],
  callback: ({ e, composeStore, tools }) => {
    if (e.x === undefined || e.y === undefined || !e.point) return
    const { x, y, point } = e
    return {
      startmove: () => {
        tools.moveStart()
        return { start: point }
      },
      move: () => {
        void tools.move(
          x - composeStore.start.x,
          y - composeStore.start.y
        )
      },
    }
  },
}
```

把 `spaceStartMove` 放进 `eventList` 会按名称覆盖默认 `startmove`。它返回的 `move` 和 `moveend` 只属于当前 Pointer Session，并在终止时清理。

还应注册键盘 Listener，在空格按下时对 `originEvent` 调用 `preventDefault()`，防止页面滚动。

## 自定义 Event 和动态事件链

`EventProps` 的核心字段是：

| 字段 | 作用 |
| --- | --- |
| `name` | 产生的动作名；同名 persistent Event 会被替换 |
| `trigger` | 原始输入类型，例如 `mousedown`、`mousemove`、`keyup` |
| `conditionCallback` | 返回 `true` 时才产生动作 |
| `successCallback` | 动作成立后的副作用，可删除或返回新 Event 定义 |
| `withTargetConditionCallback` | 对 Listener selector 找到的候选 Child 做二次判断 |

`successCallback` 返回一个或多个 Event 定义时，新名称从下一次输入开始生效。它也可以通过 `deleteEvent(name)` 立即删除当前作用域内的定义。

由标准 drag/move 开始阶段返回的同族后续定义会绑定当前 Pointer Session，终止后自动清理。其他动态定义默认持续存在，直到被删除、替换或 Canvas 销毁。

一次输入开始时会快照待检查的 Event 名称：新增名称下一次输入生效；删除会立即生效；尚未轮到的同名替换可以在本次输入中生效。`conditionCallback`、`successCallback` 和 Listener 的同步异常会向调用方抛出，已经完成的事件增删不会回滚。

## 手动触发动作

React 侧优先使用组件 ref：

```tsx
const canvasRef = useRef<StayCanvasRefType>(null)

canvasRef.current?.trigger("save-request", {
  documentId: "doc-42",
})
```

对应 Listener 从 `payload` 读取数据：

```tsx
const saveListener: ListenerProps = {
  name: "save-request-listener",
  event: "save-request",
  callback: ({ payload }) => {
    console.log(payload.documentId)
  },
}
```

需要明确构造 ActionEvent 字段时，可以使用 `StayTools.triggerAction`：

```tsx
tools.triggerAction(
  new Event("save-request"),
  {
    "save-request": {
      info: {
        state: "editing",
        pressedKeys: new Set(["Meta"]),
      },
    },
  },
  { documentId: "doc-42" }
)
```

第一个参数是独立的原生 `originEvent`。`info` 只能是普通 action 数据；把原生 Event 放入 `info` 会抛出 `TypeError`，包括来自 iframe 等其他 realm 的 Event。

未提供的手动字段使用安全默认值：state 为触发时的当前 state，`pressedKeys` 为空，`isMouseEvent` 为 `false`。手动动作默认没有 target，即使动作名恰好是 `dragstart` 或 Listener 配置了 selector，也不会接管真实手势。

`info.state` 只设置回调看到的 `e.state`，不会调用 `switchState`，也不会改变 Listener 的 state 门禁；门禁始终读取 Canvas 的真实当前 state。

## 终止和同步重入边界

Pointer Session 的 terminal 从进入 EventRuntime、执行 Event 定义和 Listener，到清理动态定义、点击配对和手势目标，是一段同步边界。

不要在 `dragend`、`moveend`、`mouseup` 或取消回调尚未返回时，通过 `canvas.dispatchEvent(...)` 同步伪造下一次原生 `pointerdown`/`mousedown`。这类嵌套输入会被当前 Canvas 忽略。

应用内级联动作应使用 `ref.trigger()` 或 `tools.triggerAction()`。新的原生 down 应在当前 terminal 回调返回后再派发。

即使 Event 定义或 Listener 在 terminal 中同步抛错，本次 Pointer Session 的动态定义、点击配对和目标仍会在 `finally` 中清理，然后异常继续向外抛出。

## 对应示例

- [Events](https://lezhu1234.github.io/react-stay-canvas/#/simple/events)：DOM 输入、拖动、焦点、ref trigger 和重新创建。
- [Selectors](https://lezhu1234.github.io/react-stay-canvas/#/simple/selectors)：selector 查询、命中测试和可视反馈。
- [State](https://lezhu1234.github.io/react-stay-canvas/#/simple/state)：state 门禁、store 和 stateStore。
- [Transform](https://lezhu1234.github.io/react-stay-canvas/#/simple/transform)：空格拖动、Wheel 缩放和 Canvas 外释放。
- [Diagram](https://lezhu1234.github.io/react-stay-canvas/#/integrations/diagram)：稳定手势目标、模式切换和依赖对象更新。

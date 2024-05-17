# react-stay-canvas

stay-canvas for react

<div align="center"><a href="./README.en.md">
  <strong>English</strong>
</a> | <a href="./README.zh.md">
  <strong>中文简体</strong>
</a></div>



## 简介

`react-stay-canvas` 提供了一组易于使用的 API，帮助开发者在 React 项目中集成画布功能。无论是拖拽操作、图形绘制，还是复杂的事件处理，这个组件都能满足您的需求。

## 主要功能

- **快速上手**：开发者可以快速上手，轻松实现各种图形和交互效果。
- **灵活强大的可配置性**：支持自定义事件、自定义监听器以及自定义绘制的组件等等，使得开发者能够根据具体需求进行高度定制。
- **丰富的图形支持**：支持多种基本图形如矩形、圆形，路径，图像等
- **易于集成**：简洁的 API 设计使其能够快速集成到现有的 React 项目中。

`react-stay-canvas` 让您无需深入了解复杂的 Canvas API，即可在 React 中轻松实现各种图形和交互效果。

# 安装

```bash
npm install react-stay-canvas
```

# 使用

```typescript
import { ListenerProps, Point, Rectangle, StayCanvas } from "react-stay-canvas"

export function Demo() {
  const DragListener: ListenerProps = {
    name: "dragListener",
    event: ["dragstart", "drag"],
    callback: ({ e, composeStore, tools: { appendChild, updateChild } }) => {
      const eventMap = {
        dragstart: () => ({
          dragStartPosition: new Point(e.x, e.y),
          dragChild: appendChild({
            shape: new Rectangle({
              x: e.x,
              y: e.y,
              width: 0,
              height: 0,
              props: { color: "red" },
            }),
            className: "label",
          }),
        }),
        drag: () => {
          const { dragStartPosition, dragChild } = composeStore
          const x = Math.min(dragStartPosition.x, e.x)
          const y = Math.min(dragStartPosition.y, e.y)
          const width = Math.abs(dragStartPosition.x - e.x)
          const height = Math.abs(dragStartPosition.y - e.y)
          updateChild({
            child: dragChild,
            shape: dragChild.shape.update({ x, y, width, height }),
          })
        },
      }
      return eventMap[e.name as keyof typeof eventMap]() || {}
    },
  }
  return <StayCanvas className="border" width={500} height={500} listenerList={[DragListener]} />
}
```

<!-- ![alt text](videos/demo.mp4 "Title") -->

<video src="videos/demo.mp4" controls="">
</video>

# Listeners
在 react-stay-canvas 中，你可以通过 listenerList 属性来注册监听器， 该属性是一个数组，数组中的每个元素都是一个监听器，监听器是一个对象， 该对象需要满足 ListenerProps 类型约束

```typescript
declare const DEFAULTSTATE = "default-state";

interface ListenerProps {
    name: string; // 监听器名称，你可以使用任意字符串作为名称，但是需要唯一
    state?: string; // 监听器状态，我们将在后续中介绍， 默认值为 DEFAULTSTATE
    selector?: string; // 监听器选择器，我们将在后续中介绍
    event: string | string[]; // 监听器事件, 当该事件触发时，将执行监听器的回调函数，当event为数组时，任意一个事件触发时，将执行监听器的回调函数，同时，会在回调函数中的e.name中返回该事件的名称
    sortBy?: SortChildrenMethodsValues | ChildSortFunction; // 选择器选中元素后，对选中的元素进行排序的方法，我们将在后续中介绍，默认值为 SORT_CHILDREN_METHODS.AREA_ASC = area-asc， 即按面积从小到大排序, 你也可以自定义排序函数
    callback: (p: ActionCallbackProps) => {
        [key: string]: any;
    } | void;
}

// 自定义元素排序方法
export type ChildSortFunction = (a: StayChild, b: StayChild) => number
```

## 简单的逻辑运算
你可以对某些属性使用一些非常简单的逻辑运算。目前受支持的属性包括 state 和 selector 两种。
```typescript
export const SUPPORT_LOGIC_OPRATOR = {
  AND: "&",
  OR: "|",
  NOT: "!",
}

const selector = ".A&#B" //选中名称为A并且id为B的元素
const selector = ".A&!#B" //选中名称为A并且id不为B的元素
const selector = "!.A" //选中名称不为A的元素

const state = "!selected" //当状态不为selected时
const state = "default-state|selected"  //当状态为default-state或者selected时
```

## selector 选择器
在 react-stay-canvas 中实现了一个非常简单的选择器功能，主要用来筛选元素的名称和id,在我们使用appendChild、updateChild等函数时，需要提供一个 <code>className</code> 属性，而这些工具函数返回的对象中会包含一个 <code>id</code> 属性。在定义selector时，你可以通过在 <code>className</code> 属性前添加一个符号 <code>.</code>，在 <code>id</code> 属性前添加一个符号 <code>#</code>来选中对应的元素
```typescript
const child1 = appendChild({
  className: "label",
  ...
})
const child2 = appendChild({
  className: "label",
  ...
})

getChildrenBySelector(".label") //返回 [child1, child2]
getChildrenBySelector("#" + child1.id) //返回 child1
getChildrenBySelector("!.label") //返回 []
```

## state 状态
在 react-stay-canvas 中，你可以通过 state 属性来控制当前的状态，该属性是一个字符串， 默认状态为 DEFAULTSTATE  = "default-state"
状态的概念来源于自动状态机，通过设置状态，你可以灵活的控制监听器应该在什么时候触发，
设想我们希望实现下面这个功能
- 默认情况下在canvas上拖拽会根据鼠标画一个矩形
- 我们选中这个矩形之后，在这个矩形上面进行拖拽会移动这个矩形

我们可以设置三个监听器来实现这个功能
- 第一个监听器的 state 属性为 DEFAULTSTATE，监听拖拽事件，并在 callback 函数中实现队形的绘制功能
- 第二个监听器的 state 属性为 DEFAULTSTATE， 监听点击事件，在 callback 函数中我们如果监听到用户点击了这个绘制的元素，那改变当前的状态为 "selected"， 否则将状态更改为 DEFAULTSTATE
- 第三个监听器的 state 属性为 "selected"，监听拖拽事件，并在 callback 函数中实现对选中的矩形的移动功能

你可以对状态字段进行一些简单的逻辑运算

## event 事件
event 属性接受一个字符串, 你可以在 StayCanvas 的 eventList 中传入一个事件数组来对事件进行自定义或者字节覆盖预定义的事件，相同名称的事件会被覆盖，如何自定义事件将在之后介绍

在 react-stay-canvas 中,预定义了以下几种事件
- mousedown: 鼠标按下
- mousemove: 鼠标移动
- mouseup: 鼠标松开
- keydown: 键盘按下
- keyup: 键盘松开
- zoomin: 鼠标滚轮向上滚动
- zoomout: 鼠标滚轮向下滚动
- dragstart: 鼠标左键按下时
- drag: 鼠标左键按下移动并且鼠标距离鼠标按下位置大于10时
- dragend: 拖拽结束
- startmove: ctrl键按下并且鼠标左键按下时
- move: ctrl键按下并且鼠标左键按下移动时
- click: 点击
- forward: ctrl + shift + z
- backward: ctrl + z

## Listener callback 函数
callback 函数是用来控制用户在 canvas 上交互的核心函数，该函数的定义如下
```typescript
type ListenerCallback = (p: ActionCallbackProps) => Record<string, any> | void
// 其中  ActionCallbackProps 为
export interface ActionCallbackProps {
  originEvent: Event // 原生事件，该参数为 addEventListener 回调时传递的 event 参数
  e: ActionEvent // react-stay-canvas 中定义的事件对象，具体信息可以参考下面的 ActionEvent 类型
  store: storeType // 一个类型为Map的全局的存储对象
  stateStore: storeType // 一个类型为Map的存储对象，跟 store 的区别在于，当状态改变时，该对象对被清空
  composeStore: Record<string, any> // 当我们在定义 listener 时，如果 event 参数我们传递的是数组，那么每一个事件触发时 composeStore 都将是同一个对象
  tools: StayTools // StayTools 对象，该对象包含了一些工具函数，具体信息将在 StayTools中进行介绍
  payload: Dict // 当我们手动调用 trigger 函数时传递的参数
}

export interface ActionEvent {
  state: string // 事件触发时的状态
  name: string // 事件名称
  x: number // 鼠标相对于 canvas 的 x 坐标
  y: number // 鼠标相对于 canvas 的 y 坐标
  point: Point // 鼠标相对于 canvas 的坐标
  target: StayChild // 触发事件的元素
  pressedKeys: Set<string> // 当前按下的键盘键和鼠标键, 鼠标左键为 mouse0 ，鼠标右键为 mouse1, 鼠标滚轮为 mouse2
  key: string | null // 触发事件的键盘键，当我们触发 mouseup 事件时, pressedKeys 中不会有该键，而 key 中有该键
  isMouseEvent: boolean // 是否为鼠标事件
  deltaX: number // 鼠标滚轮滑动时的 x 轴偏移
  deltaY: number // 鼠标滚轮滑动时的 y 轴偏移
  deltaZ: number // 鼠标滚轮滑动时的 z 轴偏移
}
```


### StayTools 工具函数
StayTools 对象包含了一些工具函数，定义如下
```typescript
export interface StayTools {
  createChild: <T extends Shape>(props: createChildProps<T>) => StayChild<T>
  appendChild: <T extends Shape>(props: createChildProps<T>) => StayChild<T>
  updateChild: (props: updateChildProps) => StayChild
  removeChild: (childId: string) => void
  getContainPointChildren: (props: getContainPointChildrenProps) => StayChild[]
  hasChild: (id: string) => boolean
  fix: () => void
  switchState: (state: string) => void
  getChildrenBySelector: (selector: string, sortBy?: SortChildrenMethodsValues | ChildSortFunction) => StayChild[]
  getAvailiableStates: (selector: string) => string[]
  changeCursor: (cursor: string) => void
  moveStart: () => void
  move: (offsetX: number, offsetY: number) => void
  zoom: (deltaY: number, center: SimplePoint) => void
  log: () => void
  forward: () => void
  backward: () => void
  triggerAction: (originEvent: Event, triggerEvents: Record<string, any>, payload: Dict) => void
  deleteListener: (name: string) => void
  forceUpdateCanvas: () => void
}
```

### 元素创建和更新

- [`createChild`](#createchild) - 创建一个新元素
- [`appendChild`](#appendchild) - 创建一个新元素并将其添加到画布上
- [`updateChild`](#updatechild) - 更新一个已有元素的属性
- [`removeChild`](#removechild) - 从画布上移除一个元素

### 元素查询和判断 

- [`getContainPointChildren`](#getcontainpointchildren) - 获取包含某一点的所有元素
- [`hasChild`](#haschild) - 判断一个元素是否存在于画布上
- [`getChildrenBySelector`](#getchildrenbyselector) - 根据选择器获取元素
- [`getAvailableStates`](#getavailablestates) - 获取所有可用的状态

### 状态和视图控制

- [`fix`](#fix) - 将所有元素的层级调整到最下层
- [`switchState`](#switchstate) - 切换当前状态
- [`changeCursor`](#changecursor) - 改变鼠标指针样式
- [`moveStart`](#movestart) - 开始移动所有元素
- [`move`](#move) - 移动所有元素
- [`zoom`](#zoom) - 缩放所有元素

### 快照控制
- [`log`](#log) - 保存当前画布快照
- [`forward`](#forward) - 前进到下一个快照
- [`backward`](#backward) - 后退到上一个快照  

### 事件触发

- [`triggerAction`](#triggeraction) - 手动触发事件
- [`deleteListener`](#deletelistener) - 删除监听器
- [`forceUpdateCanvas`](#forceupdatecanvas) - 强制重新渲染画布

### createChild
createChild函数用来创建一个元素，该函数接受一个对象作为参数，参数定义如下

```typescript
createChild: <T extends Shape>(props: createChildProps<T>) => StayChild<T>

export interface createChildProps<T> {
  id?: string // 元素的id，如果未指定，则自动生成
  zIndex?: number // 元素的zIndex，该值会影响元素的在canvas上面的绘制顺序， zIndex 值越小，绘制越靠前，默认值为 1
  shape: T // 元素的形状，该值可必须是一个继承 Shape 的对象，react-stay-canvas 中内置了一些 Shape 的子类，你也可以自定义自己的 Shape 子类，具体信息将在后面介绍
  className: string // 元素的className，
  layer?: number // 元素所在的层，该值为元素所在 canvas 层的索引，0 表示最下面一层，数值越大，越靠近上层，你也可以使用负数来表示层，-1表示最上面一层，-2 表示最上一层的下一层，以此类推，默认值为 -1
}
```

#### appendChild
appendChild 函数用来创建一个元素并直接添加到canvas 上，该函数接受一个对象作为参数，参数定义和 createChild 函数相同

#### updateChild
updateChild 函数用来更新一个元素，该函数接受一个对象作为参数，该函数接收的参数和 createChild 函数不同的是，它需要一个 child 对象，该对象可以通过 appendChild 函数或者 createChild 函数返回的值来获取， 除此之外，其他的参数均为可选项。参数定义如下
```typescript
export type updateChildProps<T = Shape> = {
  child: StayChild
} & Partial<createChildProps<T>>
```
#### removeChild
removeChild 函数用来删除一个元素，该函数接受一个字符串参数 childId，该参数为元素的id，无返回值

#### getContainPointChildren
getContainPointChildren 函数用来获取包含某一个点的所有元素，使用该函数时，你需要指定 选择器来划定查找的范围，参数定义如下
```typescript
export interface getContainPointChildrenProps {
  selector: string | string[] // 选择器，该值可以是一个字符串，也可以是一个字符串数组，当为字符串数组时，会返回所有选择器查找结果的并集
  point: SimplePoint // 鼠标相对于 canvas 的坐标 || interface SimplePoint {x: number y: number}
  returnFirst?: boolean | undefined // 是否仅仅返回第一个元素，默认值为 false
  sortBy?: SortChildrenMethodsValues | ChildSortFunction // 排序方法，默认值为  SORT_CHILDREN_METHODS.AREA_ASC = area-asc， 你也可以传入一个函数来自定义元素排序方法
}

//下面是内置的几种排序方法
export type SortChildrenMethodsValues = valueof<typeof SORT_CHILDREN_METHODS>
export const SORT_CHILDREN_METHODS = {
  X_ASC: "x-asc", // 按X轴升序排序
  X_DESC: "x-desc", // 按X轴降序排序
  Y_ASC: "y-asc", // 按Y轴升序排序
  Y_DESC: "y-desc", // 按Y轴降序排序
  WIDTH_ASC: "width-asc", // 按宽度升序排序
  WIDTH_DESC: "width-desc", // 按宽度降序排序
  HEIGHT_ASC: "height-asc", // 按高度升序排序
  HEIGHT_DESC: "height-desc", // 按高度降序排序
  AREA_ASC: "area-asc", // 按面积升序排序
  AREA_DESC: "area-desc", // 按面积降序排序
}
```

#### hasChild
hasChild 函数用来判断一个元素是否存在于canvas上，该函数接受一个字符串参数 childId，该参数为元素的id，返回值为布尔值，true 表示存在，false 表示不存在

#### fix
fix 函数用来将 canvas 上的所有元素的 layer 全部调整到最下层，即相当于将所有元素的 layer 设置为 0

#### switchState
switchState 函数用来当前的状态，该函数接受一个字符串参数 state，切换状态后, stateStore 中的值会被清空

#### getChildrenBySelector
getChildrenBySelector 函数用来获取选择器查找到的元素，其 selector 和 sortBy 参数与 getContainPointChildren 函数相同，返回值为 StayChild 数组

#### getAvailiableStates
getAvailiableStates 函数是一个工具函数，该函数接受一个字符串，返回目前出现过的状态中所有符合该选择器的状态
```typescript
// 假设目前所有注册的 listener 中包含的状态中有 state1, state2, state3, state4, state5, state6, state7, state8, state9, state10，其中，被触发过的状态有 state1, state2, state3, state4, state5
// 特别的，当 selector 为 "all-state" 时，返回所有状态
getAvailiableStates("all-state") // 返回值为 ["state1", "state2", "state3", "state4", "state5"]
getAvailiableStates("!state1") // 返回值为 ["state2", "state3", "state4", "state5"]
getAvailiableStates("all-state&!(state1|state2)") // 返回值为 ["state3", "state4", "state5"]
```

#### changeCursor
changeCursor 函数用来改变鼠标指针的样式，该函数接受一个字符串参数 cursor，该参数为鼠标指针的样式,具体值可参考 https://developer.mozilla.org/zh-CN/docs/Web/CSS/cursor

#### moveStart
moveStart 函数用来开始移动canvas上面的所有元素，在调用 move 函数前，需要调用该函数以保存移动前的位置

#### move
move 函数用来移动canvas上面的所有元素, offsetX 和 offsetY 分别表示移动相对于开始时的横纵坐标的偏移量

#### zoom
zoom 函数用来缩放canvas上面的所有元素，该函数接受两个参数，第一个参数为缩放比例，通常是 e.deltaY，第二个参数为缩放中心点，当我们实现以鼠标为中心缩放功能的时，这个参数为鼠标所在位置

#### log
log 函数保存当前 canvas 快照，将当前canvas快照存入栈中，当我们执行完该函数之后，可以通过调用 forward 和 backward 函数来恢复之前的 快照

#### forward
前进到下一个快照

#### backward
后退到下一个快照

forward 函数 和 backward 函数用来将当前 canvas 改变为栈中的快照

我们可以在最初的示例中修改一些代码来简单理解一下这个功能
```diff
- import { ListenerProps, Point, Rectangle, StayCanvas } from "react-stay-canvas"
+ import { ALLSTATE, ListenerProps, Point, Rectangle, StayCanvas, trigger } from "react-stay-canvas"

export function Demo() {
  const DragListener: ListenerProps = {
    name: "dragListener",
-    event: ["dragstart", "drag"],
-    callback: ({ e, composeStore, tools: { appendChild, updateChild } }) => {
+    event: ["dragstart", "drag", "dragend"],
+    callback: ({ e, composeStore, tools: { appendChild, updateChild, log } }) => {
      const eventMap = {
        dragstart: () => ({
          dragStartPosition: new Point(e.x, e.y),
          dragChild: appendChild({
            shape: new Rectangle({
              x: e.x,
              y: e.y,
              width: 0,
              height: 0,
              props: { color: "red" },
            }),
            className: "annotation",
          }),
        }),
        drag: () => {
          const { dragStartPosition, dragChild } = composeStore
          const x = Math.min(dragStartPosition.x, e.x)
          const y = Math.min(dragStartPosition.y, e.y)
          const width = Math.abs(dragStartPosition.x - e.x)
          const height = Math.abs(dragStartPosition.y - e.y)
          updateChild({
            child: dragChild,
            shape: dragChild.shape.update({ x, y, width, height }),
          })
        },
+        // 添加 dragend 事件, 在拖拽结束后，我们将当前的canvas 快照保存下来
+        dragend: () => {
+          log()
+        },
      }
      return eventMap[e.name as keyof typeof eventMap]() || {}
    },
  }

+  // 添加 forward  和 backward 两个监听器
+  const BackwardListener: ListenerProps = {
+    name: "backwardListener",
+    event: "backward",
+    callback: ({ tools: { backward } }) => {
+      backward()
+    },
+  }
+
+  const ForwardListener: ListenerProps = {
+    name: "forwardListener",
+    event: "forward",
+    callback: ({ tools: { forward } }) => {
+      forward()
+    },
+  }

  return (
    <>
+     添加两个按钮来分别触发 forward 和 backward 事件
+     <button className="border border-red-50 r-5" onClick={() => trigger("forward")}>
+       forward
+     </button>
+     <button className="border border-red-50" onClick={() => trigger("backward")}>
+       backward
+     </button>
-      return <StayCanvas className="border" width={500} height={500} listenerList={[DragListener]} />
+      <StayCanvas
+        className="border"
+        width={500}
+        height={500}
+        // 将我们新增的两个监听器添加到 listenerList 中
+        listenerList={[DragListener, ForwardListener, BackwardListener]}
+      />
    </>
  )
}

```

<video src="videos//forward-backward.mp4" controls="">
</video>


#### triggerAction
triggerAction 函数用来手动触发事件，其效果与调用 trigger 一致，但是需要手动构造 Event 对象， 同时需要传入 triggerEvents 对象
```typescript
type triggerEventsProps = { [key: string]: ActionEvent },
```

#### deleteListener
deleteListener 函数用来删除监听器，该函数接受一个字符串参数 listenerName，该参数为监听器的名称，该函数会删除该监听器，如果监听器不存在，则不会进行任何操作

#### forceUpdateCanvas
forceUpdateCanvas 函数用来强制更新 canvas，该函数会强制更新 canvas，包括重新渲染 canvas 上的所有元素，该函数会触发一次重绘，但是不会触发任何监听器，该函数可以用于在某些情况下，比如在监听器中触发了某些事件，但是希望在触发事件之后，重新渲染 canvas，此时可以使用该函数来实现该功能


# 事件
在 react-stay-canvas 中，你可以通过 eventList 来注册事件，该事件列表是一个数组，数组中的每个元素都是一个事件对象，该对象需要满足 EventProps 的类型约束

```typescript
type EventProps = {
  name: string
  trigger: valueof<typeof MOUSE_EVENTS> | valueof<typeof KEYBOARRD_EVENTS>
  conditionCallback?: (props: UserConditionCallbackProps): boolean
  successCallback?: (props: UserSuccessCallbackProps) => void | EventProps
}

export const MOUSE_EVENTS = {
  MOUSE_DOWN: "mousedown", // 鼠标按下事件类型常量，用于鼠标按下事件监听器中使用。
  MOUSE_UP: "mouseup", // 鼠标松开事件类型常量，用于鼠标松开事件监听器中使用。
  MOUSE_MOVE: "mousemove", // 鼠标移动事件类型常量，用于鼠标移动事件监听器中使用。
  WHEEL: "wheel", // 鼠标滚轮事件类型常量，用于鼠标滚轮事件监听器中使用。
  CLICK: "click", // 鼠标点击事件类型常量，用于鼠标点击事件监听器中使用。
  DB_CLICK: "dblclick", // 鼠标双击事件类型常量，用于鼠标双击事件监听器中使用。
  CONTEXT_MENU: "contextmenu", // 鼠标右键事件类型常量，用于鼠标右键事件监听器中使用。
} as const

export const KEYBOARRD_EVENTS = {
  KEY_DOWN: "keydown", // 键盘按下事件类型常量，用于键盘按下事件监听器中使用。
  KEY_UP: "keyup", // 键盘松开事件类型常量，用于键盘松开事件监听器中使用。
} as const
```

接下来我们将对 EventProps 中的各个属性进行介绍

## name 
name 属性用来标识事件，该属性是一个字符串，当存在两个相同名称的事件时，后者会覆盖前者

## trigger
trigger 表示的是触发该事件的触发器, 目前支持 MOUSE_EVENTS 和 KEYBOARRD_EVENTS 中的一些值，详见上方的常量定义
### 说明
- 如果我们想要自定义一个移动整个画布的事件 move，该事件的触发条件是用户需要按住键盘的 ctrl 键，同时鼠标左键按下进行拖拽，那么这个 trigger 的值应该为 "mousemove", 因为我们在触发这个事件的时候需要知道鼠标移动的位置，需要实时的根据鼠标位置来更新画布， 使用 "keydown" 和 "mousedown" 是不合适的，因为这两个事件只会触发一次，我们需要的是一个持续触发的事件，因此我们需要使用 "mousemove"
```typescript
const MoveEvent: EventProps = {
  name: "move",
  trigger: MOUSE_EVENTS.MOUSE_MOVE,
  conditionCallback: ({ e, store }) => {
    return e.pressedKeys.has("Control") && e.pressedKeys.has("mouse0")
  }
}
```

## conditionCallback
conditionCallback 属性接受一个函数，该函数的参数满足 UserConditionCallbackProps 类型约束, 参数中的 e/store/stateStore 与在 listener callback 中传入的 e/store/stateStore 相同: [Listener-callback-函数](#listener-callback-函数) 该函数需要返回一个布尔值，如果返回 true，则表示该事件触发条件成立，如果返回 false，则表示该事件触发条件不成立
```typescript
export interface UserConditionCallbackFunction {
  (props: UserConditionCallbackProps): boolean
}

export interface UserConditionCallbackProps {
  e: ActionEvent
  store: storeType
  stateStore: storeType
}
```
conditionCallback 是一个可选参数，当我们不传递这个参数是，表示当 trigger 条件满足就触发事件，比如如果我们需要定义一个鼠标按下事件，那么我们可以这样定义:

```typescript
const MouseDownEvent: EventProps = {
  name: "mousedown",
  trigger: MOUSE_EVENTS.MOUSE_DOWN
}
```

## successCallback
successCallback 属性接受一个函数，该函数的参数满足 UserSuccessCallbackProps 类型约束, 参数中的 e/store/stateStore 与在 listener callback 中传入的 e/store/stateStore 相同: [Listener-callback-函数](#listener-callback-函数) 同时，参数中还有一个额外的 deleteEvent 函数，用来对事件 进行删除，该函数还接受一个可选的返回值，当返回值为 EventProps 类型的时候，会在本事件触发之后注册返回的事件

这个函数在某些情况下会非常有用，一个场景是，当我们需要定义一组拖拽事件时，一个做法是我们可以定义开始拖拽，拖拽中，结束拖拽三个事件，但是我们希望拖拽中的事件仅仅在开始拖拽事件触发之后才会生效，这样我们可以避免鼠标从canvas外按下，然后移动到canvas内直接触发拖拽事件的情况，这样我们是无法得到开始拖拽时的鼠标位置的。我们也希望仅仅在拖拽事件触发之后，才触发结束拖拽事件，
想象一下如果用户直接在canvas中进行点击，那么我们将先触发开始拖拽事件，然后跳过拖拽事件的触发，然后直接触发结束拖拽事件，这样在某些情况下可能会得到无法预料的结果。

以下是一种拖拽事件的注册方法:
```typescript
// 定义结束拖拽的事件
const DragEndEvent: EventProps = {
  name: "dragend", // 事件名称
  trigger: MOUSE_EVENTS.MOUSE_UP, // 触发事件的条件，此处为鼠标释放
  successCallback: ({ store, deleteEvent }) => {
    deleteEvent("drag") // 在成功回调中删除进行中的拖拽事件
    deleteEvent("dragend") // 删除自身事件
    store.set("dragging", false) // 更新状态，表示拖拽结束
  },
}

// 定义进行中的拖拽事件
const DragEvent: EventProps = {
  name: "drag", // 事件名称
  trigger: MOUSE_EVENTS.MOUSE_MOVE, // 触发条件，鼠标移动
  conditionCallback: ({ e, store }) => {
    const dragStartPosition: Point = store.get("dragStartPosition")
    return (
      e.pressedKeys.has("mouse0") && // 检查鼠标左键是否按下
      (dragStartPosition.distance(e.point) >= 10 || store.get("dragging")) // 检查鼠标移动距离是否足够或已处于拖拽状态
    )
  },
  successCallback: ({ store }) => {
    store.set("dragging", true) // 设置状态为正在拖拽
    return DragEndEvent // 返回结束拖拽事件，以便其可以被注册
  },
}

// 定义开始拖拽的事件
export const DragStartEvent: EventProps = {
  name: "dragstart", // 事件名称
  trigger: MOUSE_EVENTS.MOUSE_DOWN, // 触发事件的条件，鼠标按下
  conditionCallback: ({ e }) => {
    return e.pressedKeys.has("mouse0")// 鼠标左键按下
  },
  successCallback: ({ e, store }) => {
    store.set("dragStartPosition", e.point) // 存储开始拖拽时的鼠标位置
    return DragEvent // 返回进行中的拖拽事件，以便其可以被注册
  },
}

// 事件注册列表只包含开始拖拽事件，其他事件通过回调动态注册
const eventList = [DragStartEvent]

```

`DragStartEvent`：定义了一个开始拖拽的事件。当鼠标左键被按下时触发。在成功回调中，它设置了拖拽开始的位置，并返回 DragEvent 对象以注册此事件，开始跟踪拖拽的移动。

`DragEvent`：定义了拖拽进行中的事件。此事件在鼠标移动时触发，但只有在满足一定条件下（鼠标左键被按住，且移动距离超过10像素或已经处于拖拽状态）。它的成功回调设置拖拽状态为进行中，并返回 DragEndEvent 对象以便注册结束拖拽的事件。

`DragEndEvent`：定义了结束拖拽的事件。当鼠标按钮释放时触发。其成功回调中将清除关于拖拽的所有事件（包括进行中和结束自己的事件），并设置拖拽状态为非进行中。


# trigger 函数
你可以使用 trigger 函数来手动触发事件， 有时候你可能需要在canvas外部触发事件，比如更改整个 canvas 的状态， 加载一些数据，保存一些数据等等，你可能希望用户在点击 canvas 外面的按钮或者自动的触发，那么使用 trigger 函数就可以实现

该函数接受两个参数，第一个参数是事件名称，第二个参数是事件携带的参数，这个参数会被传递到 [Listener-callback-函数](#listener-callback-函数)的 payload 参数中
```typescript
export type Dict = Record<string, any>
export type TriggerFunction = (name: string, payload: Dict) => void

// example:
export const StateChangeListener: ListenerProps = {
  name: "changeState",
  event: "changeState",
  state: ALLSTATE,
  callback: ({ tools: { switchState }, payload }) => {
    switchState(payload.state)
  },
}

trigger("changeState", { state: "draw" })
```


# Shape
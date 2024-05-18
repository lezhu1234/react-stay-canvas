# react-stay-canvas

stay-canvas for react

<div align="center"><a href="./README.en.md">
  <strong>English</strong>
</a> | <a href="./README.zh.md">
  <strong>中文简体</strong>
</a></div>

## 目录
- [介绍](#介绍)
- [主要特征](#主要特征)
- [安装](#安装)
- [入门示例](#入门示例)
- [核心概念](#核心概念)
    - [Shape](#shape)
    - [Listener](#listener)
    - [Event](#event-事件)
- [API 文档](#api-文档)
    - [StayCanvas 组件](#staycanvas-组件)
    - [Listener API](#listener-api)
        - [Listener Callback 函数](#listener-callback-函数)
        - [StayTools 工具函数](#staytools-工具函数)
    - [Event API](#event-api)
    - [StayChild 对象](#staychild-对象)
        - [内置 Shape 子类](#内置-shape-子类)
        - [自定义 Shape](#自定义-shape)
    - [trigger 函数](#trigger-函数)
- [常见问题](#常见问题)
- [结语](#结语)

## 介绍

`react-stay-canvas` 提供了一组易于使用的 API，帮助开发者在 React 项目中集成画布功能。无论是拖拽操作、图形绘制，还是复杂的事件处理，这个组件都能满足您的需求。

## 主要特征

- **快速上手**：开发者可以快速上手，轻松实现各种图形和交互效果。
- **灵活强大的可配置性**：支持自定义事件、自定义监听器以及自定义绘制的组件等等，使得开发者能够根据具体需求进行高度定制。
- **丰富的图形支持**：支持多种基本图形如矩形、圆形，路径，图像等
- **易于集成**：简洁的 API 设计使其能够快速集成到现有的 React 项目中。
- **零依赖**：无任何第三方依赖，当然，需要安装 React。

`react-stay-canvas` 让您无需深入了解复杂的 Canvas API，即可在 React 中轻松实现各种图形和交互效果。

## 安装

```bash
npm install react-stay-canvas
```

## 入门示例

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

## 核心概念
### Shape
在 react-stay-canvas 中，canvas 上的所有元素都是一个 `StayChild` 对象，在使用 `createChild`、`appendChild`、`updateChild` 函数时会返回该对象
Shape 是创建或者更新 `StayChild` 对象时非常重要的一个属性，该属性接受一个 Shape 子类的对象，定义了该对象在 canvas 上的所以绘制行为， 目前 react-stay-canvas 中有以下几种内置的 Shape, 你也可以直接继承 Shape 类来轻松的创建自定义的 Shape
- Shape： 基础类
  `StayChild`对象中的`Shape`应继承该类， 其构造函数定义如下
  ```typescript
  constructor({ color, lineWidth, type, gco }: ShapeProps)

  export interface ShapeProps {
    color?: string | CanvasGradient // 绘制对象的颜色, 该属性会被传递给 strokeStyle/fillStyle
    lineWidth?: number // 绘制对象的线宽, 该属性会被传递给 lineWidth
    type?: valueof<typeof SHAPE_DRAW_TYPES> // "fill" | "stroke", 绘制对象的绘制类型
    gco?: GlobalCompositeOperation // 绘制对象的全局混合模式, 该属性会被传递给 globalCompositeOperation

    //以下两个属性你可以不必关心
    zoomY?: number 
    zoomCenter?: SimplePoint
  }
  ```

### Listener
在 react-stay-canvas 中，你可以通过 listenerList 属性来注册监听器， 该属性是一个数组，数组中的每个元素都是一个监听器，监听器是一个对象， 该对象需要满足 ListenerProps 类型约束

## Event 事件
在 react-stay-canvas 中，你可以通过 eventList 来注册事件，该事件列表是一个数组，数组中的每个元素都是一个事件对象，该对象需要满足 EventProps 的类型约束


## API 文档
### StayCanvas 组件
```typescript
// StayCanvas 组件接受一个 StayCanvasProps 类型的 props
export interface StayCanvasProps {
  className?: string // 容器的 class,设置类样式
  width?: number // 容器的宽度，默认为 500px 你必须要在这里设置容器的宽高，而不是在 style 中进行设置
  height?: number // 容器的高度，默认为 500px
  layers?: number  // 容器的层数，每一层会生成一个 canvas 容器，默认为 2
  eventList?: EventProps[] // 容器的事件列表，该列表是一个数组，数组中的每个元素都是一个事件对象，在 react-stay-canvas 中，预定义了一些事件，你可以通过新建一个相同名称的事件来覆盖默认事件
  listenerList?: ListenerProps[] // 容器的监听器列表，该列表是一个数组，数组中的每个元素都是一个监听器对象
  mounted?: (tools: StayTools) => void // 容器的挂载函数，该函数会在容器挂载完成后执行
}

export default function StayCanvas({
  width = 500,
  height = 500,
  eventList,
  listenerList,
  mounted,
  layers = 2,
  className = "",
}: StayCanvasProps)

// example
<StayCanvas
  mounted={init}
  width={width}
  height={height}
  listenerList={listeners}
  layers={4}
  className="border border-solid border-red-50"
/>
```

### 内置 Shape 子类
- Image: 图片
  - 该对象在canvas上绘制一张图片，其构造函数的定义如下
  ```typescript
  // x, y, width,  height 相当于文档中的 dx, dy, dWidth, dHeight
  // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage
  export interface ImageProps {
    src: string // 图片的src
    x: number // 绘制图片时,图片左上角在canvas上的x坐标，该值是相对于屏幕像素来说的
    y: number // 绘制图片时,图片左上角在canvas上的y坐标，该值是相对于屏幕像素来说的
    width: number // 绘制图片时的宽度，该值是相对于屏幕像素来说的
    height: number  // 绘制图片时的高度，该值是相对于屏幕像素来说的
    sx?: number  // 绘制图片时,起始点在图片上的x坐标，该值是相对于图片原始像素来说的
    sy?: number  // 绘制图片时,起始点在图片上的y坐标，该值是相对于图片原始像素来说的
    swidth?: number // 绘制图片时,图片的宽度，该值是相对于图片原始像素来说的
    sheight?: number // 绘制图片时,图片的高度，该值是相对于图片原始像素来说的
    imageLoaded?: (image: StayImage) => void // 图片加载完成后的回调
    props?: ShapeProps // 该对象继承自Shape
  }
  constructor(imageProps: ImageProps)
  ```
  - 该对象的以下方法在某些时候可能会比较有用
  ```typescript
  //该方法用来更新点的属性
  declare update({
    src,
    x,
    y,
    width,
    sx,
    sy,
    swidth,
    sheight,
    height,
    props,
  }: Partial<ImageProps>): this
  ```

- Point： 点
  - 该对象在canvas上绘制一个点，其构造函数的定义如下
  ```typescript
  // x:number 点的x坐标
  // y:number 点的y坐标
  // props 将会被传递给Shape的构造函数
  constructor(x: number, y: number, props: ShapeProps = {})
  ```
  - 该对象的以下几个方法在某些时候可能会比较有用
  ```typescript
  //该方法用来更新点的属性
  declare update({ x, y, props }: PointProps) this

  // 该方法可以计算两个点之间的距离
  declare distance(point: Point): number

  // 该方法可以判断两个点是否在某个距离内,其实就是调用了 distance 方法和 offset 作比较
  declare near(point: Point, offset: number = 10): boolean

  // 该方法可以判断一个点与线段的最小距离是否在指定距离内
  // 当点与线段某端点的连线在线段上的投影在线段上时，最小距离为点到直线的垂直距离，否则为点到线段两个端点距离中较小的一个
  // https://en.wikipedia.org/wiki/Distance_from_a_point_to_a_line
  declare nearLine(line: Line, offset: number = 10): boolean
  ```

- Line： 线段
  - 该对象在canvas上绘制一个线段，其构造函数的定义如下
  ```typescript
  // x1:number 线段的起点x坐标
  // y1:number 线段的起点y坐标
  // x2:number 线段的终点x坐标
  // x2:number 线段的终点y坐标
  // props 将会被传递给Shape的构造函数
  constructor({ x1, y1, x2, y2, props }: LineProps)
  ```
  - 该对象的以下几个方法在某些时候可能会比较有用
  ```typescript

  //该方法用来更新线段的属性
  declare update({ x1, y1, x2, y2, props }: UpdateLineProps)this

  // 该方法用来计算点到直线的垂直距离
  declare distanceToPoint(point: Point): number

  // 该方法用来计算线段的长度
  declare len(): number

  // 与 Point 对象的 nearLine 计算方法相同 
  declare segmentDistanceToPoint(point: Point): number

  // 该方法可以判断一个点与线段的最小距离是否在指定距离内，调用 segmentDistanceToPoint 方法
  declare nearPoint(point: Point, offset: number = 10): boolean

  
  ```

- Rectangle： 矩形
  - 该对象在canvas上绘制一个矩形，其构造函数的定义如下
    ```typescript
    // x:number 矩形左上角的x坐标
    // y:number 矩形左上角的y坐标
    // width:number 矩形的宽度
    // height:number 矩形的高度
    // props 将会被传递给Shape的构造函数
    constructor({ x, y, width, height, props = {} }: RectangleAttr)
    ```
  - 在创建完成之后，该对象中会新增以下属性
    ```typescript
    // leftTop: Point 矩形左上角的坐标
    // rightTop: Point 矩形右上角的坐标
    // leftBottom: Point 矩形左下角的坐标
    // rightBottom: Point 矩形右下角的坐标
    // leftBorder: Line 矩形左边的线
    // rightBorder: Line 矩形右边的线
    // topBorder: Line 矩形上边的线
    // bottomBorder: Line 矩形下边的线
    // area: number 矩形的面积
    ```
  - 该对象的以下几个方法在某些时候可能会比较有用
    ```typescript
    //该方法用来更新对象的属性
    declare update(Partial<RectangleAttr>): this

    //该方法用来方便的为你计算将另外一个矩形等比例缩放并居中放置在当前矩形中所需要的缩放比例和偏移量
    //调用该方法时，你需要传入宽高值，会返回一个新的 Rectangle 对象和三个属性
    type FitInfoAttr = {
      rectangle: Rectangle
      scaleRatio: number
      offsetX:number
      offsetY:number
    }
    declare computeFitInfo(width: number, height: number): FitInfoAttr
    
    //example:
    //创建一个宽高为200*300的矩形，然后计算将这个矩形等比例缩放并居中放置在宽高为600*600的容器矩形中，需要缩放的比例和偏移量。
    // rectangle 为新创建的等比例缩放并居中的矩形，scaleRatio 为缩放比例，offsetX 和 offsetY 为偏移量
    const containerRect = new Rectangle({ x: 0, y: 0, width:600, height:600 })
    const { rectangle, scaleRatio, offsetX, offsetY } = containerRect.computeFitInfo(200, 300)

    //该方法用来判断一个点是否在矩形内
    declare (point: Point): boolean
    
    //该方法用来复制一个矩形，复制后的矩形会拥有和当前矩形一样的属性，但是不会共享同一个对象
    declare copy(): Rectangle
    
    //这两个方法用来将世界坐标系下的矩形坐标转换为屏幕坐标系下的矩形坐标，反之亦然
    declare worldToScreen(offsetX: number, offsetY: number, scaleRatio: number): Rectangle
    declare screenToWorld(offsetX: number, offsetY: number, scaleRatio: number):{ x: number, y: number, width: number, height: number }
    
    ```


- Circle: 圆形
  - 该对象在canvas上绘制一个圆形，其构造函数的定义如下
  ```typescript
  export interface CircleAttr {
    x: number // 圆心的x坐标
    y: number // 圆心的y坐标
    radius: number // 圆的半径
    props?: ShapeProps
  }
  declare constructor({ x, y, radius, props }: CircleAttr)
  ```
  - 该对象的以下几个方法在某些时候可能会比较有用
  ```typescript
  // 该方法用来更新圆的属性
  declare update({ x, y, radius, props }: Partial<CircleAttr>): this

  // 该方法可以判断一个点是否在圆内
  declare (point: Point): boolean
  ```

- Text: 文本
  - 该对象在canvas上绘制一个文本，其构造函数的定义如下
  ```typescript
  // x:number 文本的x坐标， 该坐标为包含文本的矩形的中心点 x 坐标
  // y:number 文本的y坐标， 该坐标为包含文本的矩形的中心点 y 坐标
  // font:string 文本的字体 https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/font
  constructor({ x, y, text, font, props }: TextAttr)
  ```
   - 该对象的以下几个方法在某些时候可能会比较有用
  ```typescript
  // 该方法用来更新文本的属性
  declare update({
    x,
    y,
    font,
    text,
    props,
  }: Partial<TextAttr>)

  // 该方法可以判断一个点是否在Text所在的矩形内
  declare (point: Point): boolean
  ```

- Path: 路径
  - 该对象在canvas上绘制一个路径，其构造函数的定义如下
  ```typescript
  // points: Point[] 路径上的点
  // radius: number 路径的半径
  constructor({ points, radius, props }: PathAttr)
  ```

#### 自定义 Shape
- 自定义 Shape
  - 我们将以Rectangle为例，详细的介绍如何自定义一个Shape (注意，这不是完整的Rectangle代码，只是提取出其中必要的部分，以用来介绍自定义Shape的流程)
  ```typescript
  // 你定义的类必须要继承 Shape 并实现以下几个抽象方法

  // abstract contains(point: SimplePoint, cxt?: CanvasRenderingContext2D): boolean
  // abstract copy(): Shape
  // abstract draw(ctx: CanvasRenderingContext2D, canvas?: HTMLCanvasElement): void
  // abstract move(offsetX: number, offsetY: number): void
  // abstract update(props: any): Shape
  // abstract zoom(zoomScale: number): void
  export class Rectangle extends Shape {
    constructor({ x, y, width, height, props = {} }: RectangleAttr) {
      // 你可以在这里将props传递给Shape， props 中的属性在之前的模块中有过介绍，
      super(props)
      this.x = x
      this.y = y
      this.width = width
      this.height = height
      ...
    }

    ...

    // 这个函数判断一个点是否在你自定义的Shape中，当我们定义 listener 时，会调用这个函数来判断该对象是否符合当前 selector 触发的区域条件，该函数的参数是鼠标所在位置的坐标
    contains(point: Point): boolean {
      return (
        point.x > this.x &&
        point.x < this.x + this.width &&
        point.y > this.y &&
        point.y < this.y + this.height
      )
    }

    // 这个函数复制一个当前对象，返回结果需要是一个新的对象，其中，你可以调用 Shape 的 _copy() 方法来复制 props
    copy(): Rectangle {
      return new Rectangle({
        ...this,
        props: this._copy(),
      })
    }

    // 核心绘制函数，这个函数绘制你的Shape，该函数的参数是CanvasRenderingContext2D对象，你可以调用 ctx 的方法来绘制你的 Shape, 该函数还有第二个可选参数 canvas
    draw(ctx: CanvasRenderingContext2D, canvas?: HTMLCanvasElement) {
      ctx.lineWidth = this.lineWidth

      if (this.type === SHAPE_DRAW_TYPES.STROKE) {
        ctx.strokeStyle = this.color
        ctx.strokeRect(this.x, this.y, this.width, this.height)
      } else if (this.type === SHAPE_DRAW_TYPES.FILL) {
        ctx.fillStyle = this.color
        ctx.fillRect(this.x, this.y, this.width, this.height)
      }
    }

   // 这个函数会在移动整个画布的时候被调用，你可以在这里更新你的Shape的位置，该函数的参数是移动的偏移量
    move(offsetX: number, offsetY: number) {
      this.update({
        x: this.x + offsetX,
        y: this.y + offsetY,
      })
    }

    // 更新函数，用来更新Shape的属性
    update({
      x = this.x,
      y = this.y,
      width = this.width,
      height = this.height,
      props,
    }: Partial<RectangleAttr>) {
      this.x = x
      this.y = y
      this.width = width
      this.height = height
      this._update(props || {})
      this.init()

      return this
    }

    // 这个函数会在缩放整个画布的时候被调用，你可以在这里更新你的Shape的位置，该函数的参数是缩放的比例，你可以使用 Shape 的 getZoomPoint 方法来计算某个坐标缩放后的位置
    // 在本例中，Rectangle 调用了 getZoomPoint 方法，并将 zoomScale 和 左上角的坐标作为参数传入，可以得到缩放后的左上角坐标
    // 而对于宽高，则直接使用原来的宽高和 zoomScale 相乘来得到
    zoom(zoomScale: number) {
      const leftTop = this.getZoomPoint(zoomScale, this.leftTop)
      this.update({
        x: leftTop.x,
        y: leftTop.y,
        width: this.width * zoomScale,
        height: this.height * zoomScale,
      })
    }
  }

  ```



### Listener API
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



### selector 选择器
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

### state 状态
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

### 简单的逻辑运算
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

### event
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

### Listener callback 函数
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



### Event API
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

### name 
name 属性用来标识事件，该属性是一个字符串，当存在两个相同名称的事件时，后者会覆盖前者

### trigger
trigger 表示的是触发该事件的触发器, 目前支持 MOUSE_EVENTS 和 KEYBOARRD_EVENTS 中的一些值，详见上方的常量定义
  #### 说明
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

### conditionCallback
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

### successCallback
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


## trigger 函数
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

// example:
createChild({
  shape: new Rectangle({
    x: e.x,
    y: e.y,
    width: 0,
    height: 0,
    props: { color: "white" },
  }),
  className: "annotation",
})
```

#### appendChild
appendChild 函数用来创建一个元素并直接添加到canvas 上，该函数接受一个对象作为参数，参数定义和 createChild 函数相同
```typescript
//example 
appendChild({
  shape: new Rectangle({
    x: e.x,
    y: e.y,
    width: 0,
    height: 0,
    props: { color: "white" },
  }),
  className: "annotation",
})
```

#### updateChild
updateChild 函数用来更新一个元素，该函数接受一个对象作为参数，该函数接收的参数和 createChild 函数不同的是，它需要一个 child 对象，该对象可以通过 appendChild 函数或者 createChild 函数返回的值来获取， 除此之外，其他的参数均为可选项。参数定义如下
```typescript
export type updateChildProps<T = Shape> = {
  child: StayChild
} & Partial<createChildProps<T>>

//example
updateChild({
  child,
  shape: child.shape.update({
    x,
    y,
    width,
    height,
  }),
})
```

#### removeChild
removeChild 函数用来删除一个元素，该函数接受一个字符串参数 childId，该参数为元素的id，无返回值
```typescript
//example
removeChild(image.id)
```

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

//example
getContainPointChildren({
  point: new Point(100, 100),
  selector: ".annotation",
  sortBy: "area-asc",
})
```

#### hasChild
hasChild 函数用来判断一个元素是否存在于canvas上，该函数接受一个字符串参数 childId，该参数为元素的id，返回值为布尔值，true 表示存在，false 表示不存在
```typescript
//example
hasChild(image.id)
```

#### fix
fix 函数用来将 canvas 上的所有元素的 layer 全部调整到最下层，即相当于将所有元素的 layer 设置为 0
```typescript
//example
fix()
```

#### switchState
switchState 函数用来当前的状态，该函数接受一个字符串参数 state，切换状态后, stateStore 中的值会被清空
```typescript
//example
switchState("state1")
```

#### getChildrenBySelector
getChildrenBySelector 函数用来获取选择器查找到的元素，其 selector 和 sortBy 参数与 getContainPointChildren 函数相同，返回值为 StayChild 数组
```typescript
//example
getChildrenBySelector({
  selector: ".annotation",
  sortBy: (a, b) => a.shape.area - b.shape.area,
})
```

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
```typescript
//example
changeCursor("pointer")
```

#### moveStart
moveStart 函数用来开始移动canvas上面的所有元素，在调用 move 函数前，需要调用该函数以保存移动前的位置

#### move
move 函数用来移动canvas上面的所有元素, offsetX 和 offsetY 分别表示移动相对于开始时的横纵坐标的偏移量

```typescript
//example
//假设我们需要实现一个拖拽的时候canvas整体移动的功能，listener 可以这么写
export const MoveListener: ListenerProps = {
  name: "moveListener",
  event: ["startmove", "move"],
  state: ALLSTATE,
  callback: ({ e, composeStore, tools: { moveStart, move } }) => {
    const eventMap = {
      startmove: () => {
        moveStart()
        return {
          startMovePoint: new Point(e.x, e.y),
        }
      },
      move: () => {
        const { startMovePoint } = composeStore
        if (!startMovePoint) {
          return
        }
        move(e.x - startMovePoint.x, e.y - startMovePoint.y)
      },
    }
    return eventMap[e.name as keyof typeof eventMap]()
  },
}
```

#### zoom
zoom 函数用来缩放canvas上面的所有元素，该函数接受两个参数，第一个参数为缩放比例，通常是 e.deltaY，第二个参数为缩放中心点，当我们实现以鼠标为中心缩放功能的时，这个参数为鼠标所在位置
```typescript
//example
// 假设我们需要实现一个鼠标滚轮滑动时整个canvas的缩放功能， listener 可以这么写
export const ZoomListener: ListenerProps = {
  name: "zoomListener",
  event: ["zoomin", "zoomout"], 
  state: ALLSTATE,
  callback: ({ e, tools: { zoom } }) => {
    zoom(e.deltaY, new Point(e.x, e.y))
  },
}
```

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



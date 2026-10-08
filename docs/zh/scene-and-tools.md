# 场景与 StayTools

[English](../en/scene-and-tools.md) · [文档首页](./README.md) · [交互与事件](./interaction-and-events.md)

每个 `StayCanvas` 实例都有独立的 `StayTools`。它是应用代码读取和修改场景的唯一高层入口：创建对象、查询对象、平移缩放、记录历史、复制场景、截取区域以及手动触发动作都从这里开始。

## 获取当前 Canvas 的工具

最常见的入口是 `mounted`：

```tsx
const toolsRef = useRef<StayTools | null>(null)

<StayCanvas
  width={720}
  height={420}
  mounted={(tools) => {
    toolsRef.current = tools
  }}
/>
```

`StayTools` 只属于这个 Canvas。不要用源 Canvas 的 tools 去操作目标 Canvas 中的 Child，也不要在组件卸载后继续调用旧引用。

## 创建、读取和删除

```ts
const child = tools.appendChild({
  id: "node-a",
  className: "node:selected",
  shape: new Rectangle({ x: 20, y: 20, width: 120, height: 72 }),
})

tools.hasChild("node-a")
tools.getChildById<Rectangle>("node-a")
tools.getChildBySelector<Rectangle>("#node-a")
tools.getChildrenBySelector<Rectangle>(".node")

await tools.removeChild(child.id)
```

`getChildrenWithoutRoot()` 返回应用创建的所有 Child。内部 root Child 代表 Canvas 边界，不应删除；需要做全场景遍历时通常也应排除它。

应用可以自行选择业务 Child，合并它们的 Content 边界，再显式适配到当前 View：

```ts
const children = tools.getChildrenBySelector(".node|.edge")
const bounds = unionRects(children.map((child) => child.getBound()))

if (bounds) tools.viewport.fit(bounds, { padding: 32 })
```

库负责几何和 viewport 计算；哪些 Child 属于业务场景、何时触发适配，仍由应用决定。

## 不改写几何地放置单个 Child

每个 Child 只拥有一份局部坐标到 Content 的 `placement`。仿射 placement 可以使用语义字段：

```ts
const plane = tools.appendChild({
  className: "plane",
  placement: {
    type: "affine",
    x: 180,
    y: 96,
    rotation: -6,
    skewX: -18,
    scaleY: 0.78,
    origin: { x: 0, y: 0 },
  },
  shape: [background, ...gridLines, label],
})

plane.setPlacement({ type: "affine", x: 220, y: 120, rotation: 12 })
const local = plane.toLocalPoint(e.point)
const content = local && plane.toContentPoint(local)
```

`x`、`y`、`origin`、缩放、旋转和倾斜共同定义非破坏性的仿射 placement。旋转和倾斜使用角度制。矩阵按 `translate(x, y) · translate(origin) · rotate · skew · scale · translate(-origin)` 组合。`scaleX`、`scaleY` 默认是 `1`，其余值默认是 `0`。

高级仿射调用方可以传 `{ type: "affine", matrix: { a, b, c, d, e, f } }`。透视平面可以把有限局部矩形映射到四个具名的 Content 顶点：

```ts
plane.setPlacement(projectivePlacementFromQuad(
  { x: 0, y: 0, width: 320, height: 180 },
  {
    topLeft: { x: 24, y: 18 },
    topRight: { x: 350, y: 42 },
    bottomRight: { x: 332, y: 210 },
    bottomLeft: { x: 12, y: 232 },
  }
))
```

`projectivePlacementFromQuad()` 返回与 `appendChild()`、`createChild()`、`setPlacement()` 相同的公开 `{ type: "projective", matrix, domain }` placement；已经持有单应矩阵的调用方仍可直接传原始 placement。四个顶点按顺时针具名，工具只负责构造并验证有限映射，不替应用决定绘制或交互行为。

projective domain 必须有限、宽高为正，并始终位于齐次地平线同一侧；域外点映射为 `undefined`。`child.placement` 返回带判别字段的快照；`setPlacement()` 完整替换 placement，不合并字段。绘制、边界、命中、工具查询、事件路由、历史、场景传输和区域截图都读取同一份值。`e.point` 继续使用 Content。

静态 placement 变更会进入下一次 `log()` 事务。Animated Child 可以使用一份静态 placement，但当前不包含 placement 关键帧或插值。

## 追加完整时间步骤

当计算过程每次产出一个完整目标步骤时，使用 `tools.scene.appendStep()`。每次提交都描述该步骤存在的全部 Child 及其具名 Shape：

```ts
const controller = new AbortController()

tools.scene.appendStep({
  revision: "step-0",
  resourceRevision: "fonts-4",
  durationMs: 0,
  children: [{
    id: "value-1",
    className: "value",
    shapes: new Map([["body", new Rectangle({
      x: 20, y: 20, width: 80, height: 40,
      transition: { type: "easeInOutSine" },
    })]]),
  }],
}, { signal: controller.signal })

const accepted = tools.scene.appendStep({
  revision: "step-1",
  resourceRevision: "fonts-4",
  durationMs: 180,
  children: [{
    id: "value-1",
    className: "value",
    shapes: new Map([["body", new Rectangle({
      x: 180, y: 20, width: 80, height: 40,
      transition: { type: "easeInOutSine" },
    })]]),
  }],
}, { signal: controller.signal })

tools.progress({ timeMs: accepted.endTimeMs - 90 })
```

第一步通常使用 `durationMs: 0`。后续 `durationMs` 控制本次新增的完整时间区间，每个目标 Shape 保留自己的 easing 类型；输入 Shape 的 delay 和 duration 不会形成第二套时钟。完整步骤中缺少的 Shape 会退出到其原生透明零 Shape，后来再次出现时从零状态进入。省略整个 Child 会对它的所有轨道应用同一规则，同时保留其时间线供较早位置回看。

相同的原生终点只保存一次。重复步骤经过的时间会成为下一次真实变化前的 hold，因此整数和小数采样继续使用同一条原生时间线，不复制既有历史前缀。`appendStep()` 不移动当前播放位置。如果当前采样已经落入新接受的区间，Canvas 会在同一位置刷新投影；追加更晚的区间不会改变当前画面。

接受过程同步完成，不等待 `requestAnimationFrame`。返回的 `SceneStepReceipt` 包含 `revision`、`resourceRevision` 和已经接受的 `endTimeMs`，不表示某一显示帧已经绘出。发布前会先准备全部 Child，因此取消或靠后的无效 Child 都不会改变已接受时间线和当前投影。

`className` 与 `placement` 仍是 Child 的静态元数据。后续步骤必须保持原 class；placement 可以省略或重复原值，但不能通过步骤改变或插值。后续步骤还必须保持当前 `resourceRevision`。资源、静态 Child 元数据或作者编排的完整时间线需要替换时，使用整场景 `prepare()` 与 `commit()` 事务；该既有事务仍在显示帧边界提交。

替换场景也可用 `SceneStepSequenceSubmission`，以 `{ revision, resourceRevision, steps }` 传入完整步骤的异步迭代器。库沿同一个原生追加机制准备待提交时间线，每次消费后释放输入步骤；应用无需保存一套完整画面历史。迭代期间旧场景、播放位置和视口仍可使用，全部步骤准备完后由 `commit()` 一次接受。准备或取消失败不会改变旧场景。每个步骤的 `resourceRevision` 必须与本次替换一致。

## selector 查询

工具查询使用下面的 selector 表达式。Listener 的 `selector` 接受相同的字符串表达式，但不接受字符串数组或 selector 函数：

- `#node-a`：按 id；
- `.node`：按基础 className；也会匹配 `node:selected` 这样的冒号后缀；
- `.node:selected`：只匹配完整 className；
- `#node-a|.label`：并集；
- `#node-a&.node`：id 与基础 class 的交集；
- `.node&!#node-a`：从 node 中排除一个 id；
- 括号控制组合顺序；
- `(child) => boolean`：仅用于工具查询 API 的复杂过滤。

```ts
const selectedNodes = tools.getChildrenBySelector(
  ".node:selected",
  (a, b) => b.shape.zIndex - a.shape.zIndex,
)
```

`sortBy` 会影响查询返回顺序，也会影响 `getContainPointChildren({ returnFirst: true })` 选中的第一项。Listener 自身未提供 `sortBy` 时，目标路由采用稳定默认规则：较小边界优先、相同面积保留场景插入顺序、root 最后兜底。工具查询不会套用这套 Listener 默认规则；未传 comparator 时保留 selector 的结果顺序。

## 点命中与区域查询

```ts
const [frontmost] = tools.getContainPointChildren<Rectangle>({
  selector: ".node",
  point: { x: 180, y: 120 },
  sortBy: (a, b) => b.shape.zIndex - a.shape.zIndex,
  returnFirst: true,
  withRoot: false,
})

const inside = tools.getChildrenByArea(
  { x: 40, y: 40, width: 300, height: 200 },
  ".node",
)
```

`getContainPointChildren()` 调用每个 Child 的 `containsPointer()`。它依赖 Shape 的 `contains()`，所以文字和线段等默认不可命中的 Shape 需要由同一 Child 中的可命中几何体提供交互区域。

`getChildrenByArea()` 当前判断每个 Shape 的中心点是否落在区域内，不等同于“边界框完全包含”或“矩形相交”。如果产品需要框选相交语义，应在函数 selector 或业务层中明确实现并测试。

## 整体平移

在一次连续平移开始前调用 `moveStart()` 保存所有 Shape 的起点，然后以手势起点为参照调用 `move()`：

```ts
tools.moveStart()

await tools.move(offsetX, offsetY, (child) => {
  return child.id !== "fixed-toolbar"
})
```

`filter` 返回 `false` 的非 root Child 不移动。root Child 始终参与全局变换，用来保持场景坐标和 Canvas 边界一致。

如果只移动一个对象，调用对应 Child 的 `moveInit()` 和 `move()`，不要遍历整个场景。

## 以指定中心缩放

```ts
await tools.zoom(deltaY, { x: pointerX, y: pointerY }, (child) => {
  return !child.className.includes("screen-ui")
})
```

`deltaY` 沿用滚轮方向约定：内部缩放因子是 `1 + deltaY * -0.001`。因此负值放大，正值缩小。中心点使用 Canvas 局部坐标。

`StayTools` 提供了 `reset()`，但它会复用旧的移动快照，因此当前不能在场景移动后可靠执行逆变换。不要把它作为“恢复初始状态”的入口；详见[当前限制](./known-limitations.md#场景操作)。

## 历史记录

历史不是自动事务。一次业务操作完成后显式调用 `log()`：

```ts
const child = tools.appendChild({
  className: "annotation",
  shape: new Rectangle({ x: 20, y: 20, width: 80, height: 60 }),
})

tools.log()

await tools.removeChild(child.id)
tools.log()

tools.undo()
tools.redo()
```

可用 `tools.canUndo()` 和 `tools.canRedo()` 计算历史按钮的禁用状态。它们只读取已提交的历史游标，不会执行任何操作；Canvas 或应用的待提交修改只有在调用 `tools.log()` 后才会反映到查询结果中。

编辑器完成初始化后，可在加载不可撤销的背景内容之后调用 `resetHistory()`。它会清空 undo/redo，并把当前静态场景作为新的历史基线。

应用状态可以通过可选的 [`historyAdapter`](./api/stay-canvas.md#historyadapter) 进入同一事务。适配器会在每次显式 `log()` 边界保存 before/after 快照，不会持有另一套历史栈；因此只有应用状态变化时也可以形成历史项。

边界规则：

- `appendChild()`、`removeChild()`、正常 Shape 变更和 `child.setPlacement()` 都会把静态 Child 标记为待记录；
- `tools.webgl.appendChild()`、`tools.webgl.removeChild()` 与 Mesh geometry/model/material 变更进入同一待记录集合和事务；
- `log()` 把从上一次快照到当前状态的变化组成一个历史项；配置 `historyAdapter` 时也包含应用状态；
- `resetHistory()` 清空 undo/redo，并把当前静态场景和适配后的应用状态设为基线；
- 多个变更后只调用一次 `log()`，它们会成为同一个撤销单位；
- `undo()` 后再记录新操作，会截断旧的 redo 尾部；
- 动画 Child 不进入历史，移除后也不会被 undo 恢复；
- camera 变更仍属于显示状态，不进入历史；
- `undo()` 和 `redo()` 会恢复当时的 Canvas state。

## 在 Canvas 之间复制场景

`exportChildren()` 把所选 Child 的当前 Shape 状态捕获为可复用的场景片段；`importChildren()` 在目标区域实例化该片段：

```ts
const scene = sourceTools.exportChildren({
  children: sourceTools.getChildrenBySelector(".asset"),
  area: { x: 0, y: 0, width: 360, height: 220 },
})

targetTools.importChildren(scene, {
  x: 24,
  y: 24,
  width: 720,
  height: 440,
})
```

目标区域与源区域必须保持相同宽高比，否则会抛出 `area not match`。每个导出 Child 片段包含 `sourceId`、`className`、`shapes` 和解析后的局部到 Content `placement`。导入会创建新的运行时 Child id；`sourceId` 只用于关联导入对象与源对象。

这是场景传输路径，不是序列化格式。公共 Shape 状态和库拥有的可变样式值会被独立捕获；`shapeStore` 中的任意值仍然共享，因为库无法推断它们的所有权。Animated Child 只提供当前渲染投影，不传输时间线。

`importChildren()` 会先实例化新的 Shape，再对它们执行 move/zoom，因此可以把同一个 exported payload 重复导入不同 Canvas 或目标区域，输入数据不会被修改。

如果 `exportChildren()` 省略 `area`，会使用源 Canvas 的 root 边界。如果 `importChildren()` 省略目标区域，会使用目标 Canvas 的 root 边界。

原生 Mesh 场景使用独立且保持所有权的传输入口：

```ts
const fragment = sourceTools.webgl.exportChildren(
  sourceTools.webgl.getChildrenBySelector(".plane"),
)
const imported = targetTools.webgl.importChildren(fragment)
```

每个导入的 Child 都会获得新 id，以及独立的 Mesh geometry、normals、model matrix 和 material 值，其中包含 Glass roughness 与体积吸收配置。目标 WebGL2 layer config 继续拥有自己的 camera、environment 与 lights；这些显示状态不会被传输。Mesh geometry 已经位于原生场景 world space，因此该传输没有二维 `area` 或 Child placement。

## 把区域渲染到独立 Canvas

```ts
const snapshotCanvas = await tools.regionToTargetCanvas({
  area: { x: 0, y: 0, width: 360, height: 220 },
  targetSize: { width: 720, height: 440 },
  children: tools.getChildrenWithoutRoot(),
})

const png = snapshotCanvas.toDataURL("image/png")
```

`regionToTargetCanvas()` 返回一个未挂载到 DOM 的 `HTMLCanvasElement`。它会裁剪到 `area`，再把该区域等比缩放并居中放入 `targetSize`；宽高比不同时，剩余区域保持透明。绘制顺序仍按 Shape 的 layer 和 `zIndex` 决定，调用过程不会移动或缩放源 Child。

传入 `progress` 时，动画 Child 会临时投影到对应毫秒时间，包括 `progress: 0`；静态 Child 保持不变。输出完成后会恢复动画 Child 原有的当前投影，因此截帧不会改变现场播放位置。

`progress({ timeMs, bound: { beforeMs, afterMs } })` 会把两个 bound 时间作为 `timeMs` 样本的插值端点。调用方需要控制更小的播放区间时可以使用它：端点 Shape 和 easing 仍由原生时间线提供，bound 样本只改变本次插值窗口。

## 在后台线程持有画布

`StayCanvas` 默认保持原有主线程工具。创建时传入 `runtime={{ mode: "worker", createWorker }}`，则由库把网页 Canvas 的绘制面交给后台线程；`mounted` 收到的是异步 `CanvasWorkerHandle`，页面通过它跳转、播放、调整视口和截图。完整 Child、Shape 和动画留在后台，页面只收到通知、播放状态和输出 Blob。

应用的静态线程文件使用不加载 React 的入口，注册自己的处理函数：

```ts
import { installCanvasWorker, Rectangle } from "react-stay-canvas/worker"

installCanvasWorker<{ positions: readonly number[] }, number>({
  async run(input, context) {
    for (const [index, x] of input.positions.entries()) {
      const receipt = context.canvas.scene.appendStep({
        revision: `step-${index}`,
        resourceRevision: "geometry-v1",
        durationMs: index === 0 ? 0 : 100,
        children: [{
          id: "value", className: "value",
          shapes: new Map([["body", new Rectangle({
            x, y: 20, width: 40, height: 30,
            transition: { type: "linear" },
          })]]),
        }],
      }, { signal: context.signal })
      if (index === 0) context.canvas.progress({ timeMs: 0 })
      context.emit(receipt.endTimeMs)
      await context.yield()
    }
  },
})
```

`run` 的输入和通知由应用定义。库不解释执行结果、变量、主题或布局，也不序列化函数；`setup` 中的事件监听、图层配置以及 `onState` 均在应用静态线程文件内注册。`setup` 可以在实例自己的后台工作中调用其 `yield()`；取消或替换一次 `run` 不会取消这项工作，因此应用必须在 `setup` 返回的清理函数中结束它。销毁后台实例后，尚未完成或再次调用的 setup `yield()` 会被拒绝。图形、事件路由、坐标和绘制使用与主线程相同的实现。后台事件保留普通输入数据；网页的 `preventDefault()` 等同步操作通过页面侧 `onInput` 完成。

线程创建函数由应用构建器识别，例如 `() => new Worker(new URL("./canvas.worker.ts", import.meta.url), { type: "module" })`。该函数在组件创建时选定；改变函数或运行方式需要创建新实例，不迁移正在播放的数据。正常尺寸变化只修改网页层尺寸并发送测量值，不再次转移绘制面。

`handle.run(input, { signal, transfer })` 支持应用输入及可转移资源。新任务取消并等待旧任务退出，任务中的 `context.yield()` 让出一次消息处理机会并检查取消。准备失败不会先清空已接受画面。新场景或资源的第一步使用 `scene.prepare()`/`scene.commit()` 原子替换，后续完整目标使用 `appendStep()`；追加回执表示数据已接受，不表示浏览器已经显示。`handle.seek({ timeMs, bound })` 和 `handle.play({ toTimeMs, speed, bound })` 使用同一套 bound 端点插值，`bound` 可省略。`handle.viewport({ kind: "zoomBy", factor, viewAnchor })` 接受 View 坐标中的点，并在原生 viewport 缩放前把它转换成对应的 Content anchor；如果调用方已有 Content 坐标，可直接传 `anchor`。`handle.trigger(name, payload)` 只用动作名称和普通 payload 数据派发应用自定义的手动动作，不要求库定义的业务事件类型。异步 `handle.capture()` 返回 PNG Blob，并保留当前采样位置；销毁结束后，线程、网页输入和未完成请求均被释放。

## 其他工具

```ts
tools.changeCursor("grabbing")
tools.refresh()
tools.switchState("editing")
tools.deleteListener("temporary-listener")
```

- `changeCursor()` 修改顶层 Canvas 的 CSS cursor；
- `refresh()` 强制所有层重绘；Shape 更新会自动标记受影响的 layer，外部资源变化或诊断时可显式调用；
- `switchState()` 切换 Listener state，并清空 `stateStore`；
- `deleteListener()` 按 Listener 的唯一名称删除监听器；
- `getAvailiableStates()` 返回符合状态表达式的已知 state。这个公开名称当前保留了历史拼写，调用时必须按现有名称书写。

手动动作的 `triggerAction()` 和 React ref 的 `trigger()` 涉及事件输入契约，见[交互与事件：手动触发](./interaction-and-events.md#手动触发动作)。

## 下一步

- [StayTools API](./api/stay-tools.md)
- [StayCanvas API](./api/stay-canvas.md)
- [Transfer 示例](https://lezhu1234.github.io/react-stay-canvas/#/simple/transfer)
- [History 示例](https://lezhu1234.github.io/react-stay-canvas/#/simple/history)

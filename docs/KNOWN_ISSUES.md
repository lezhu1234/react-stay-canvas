# Known design issues

## `StayText` 的坐标锚点语义不直观

状态：待处理

`StayText({ x, y })` 的 `(x, y)` 当前表示文字包围盒的上方中心，而 Circle 等 Shape 通常把坐标理解为视觉中心。这会迫使调用方写出与字号相关的纵向补偿。

后续修改必须先明确默认锚点以及 `textAlign`、`textBaseline`、`offsetXRatio`、`offsetYRatio` 的组合语义，并覆盖文字边界、命中区域、移动、缩放及示例回归。默认坐标语义属于兼容性决定，不能在无迁移方案时顺手修改。

## 指针在 Canvas 外释放后，输入状态可能无法结束

状态：已在 Pointer Session 中修复；自动化测试已覆盖，仍需按示例验收手册做浏览器手工回归

### 原问题

旧输入层只在顶层 Canvas 上监听 `mouseup`。在 Canvas 内开始拖动或平移、移出后于外部松开时，Canvas 可能收不到终止事件，导致 `mouse0`、动态 drag/move 事件和手势目标残留。

### 修复约束

- Canvas 内开始的主指针会话无论在哪里释放，都只结束一次；
- `pointerup`、`pointercancel`、`lostpointercapture`、窗口失焦、页面隐藏和销毁进入统一清理路径；
- 正常结束与取消都会清理本会话的按钮状态、动态事件、点击配对和 gesture owner；
- 手势开始时确定的逻辑目标持续拥有后续 move/end；
- 多个 Canvas 实例互不共享会话状态；
- 卸载和重新创建后不残留全局 listener 或 Pointer Capture；
- 现有 `dragstart/drag/dragend`、`startmove/move/moveend` 名称保持兼容。

### 验收

Transform 示例提供 Canvas 外释放区域和可见会话状态。必须验证外部释放后只增加一次 End count，主键状态变为 Released，指针移回但不再次按下时场景不再移动；同时覆盖取消、失焦、多 Canvas 和销毁的自动化测试。

## `layers` 函数数组与实际 Canvas 数量不一致

状态：待处理

`StayCanvasProps.layers` 的公开类型允许 `number | ContextLayerSetFunction[]`。初始化逻辑能读取函数数组，但 React 渲染当前使用 `Array(layers)` 生成 `<canvas>`，数组参数会被当成一个元素而不是层数，因此无法可靠地创建与函数数量一致的 Canvas。

文档在修复前只推荐数字形式。后续修复应以函数数组的 `length` 渲染 Canvas，并覆盖空数组、context 返回 null、重建、尺寸变化和多层绘制测试。这个问题涉及现有公开类型，修复时不能静默删除函数数组能力。

## 部分导出 Shape 的场景协议不完整

状态：待处理

- `Line.contains()` 和 `StayText.contains()` 固定返回 false，不能单独提供默认命中区域；
- `Point.getBound()` 尚未实现；
- `Path.copy()` 与 `Path.getBound()` 尚未实现；
- `Circle.contains()` 要求 `Point` 实例，但工具和 Listener 的命中路径传入普通坐标对象，当前默认命中会抛错；
- `Circle` 是 `InstantShape`，不支持关键帧插值。

这些类型都从包入口导出。尤其是正常绘制会先通过 `getBound()` 判断 viewport，因此追加 `Point` 或 `Path` 会在真正 paint 前直接抛错；影响不只限于可选的查询、命中、历史快照或 `exportChildren()`。当前用户文档已按真实能力逐项标注。后续实现必须分别定义边界、命中容差、复制独立性和动画兼容性，不能只为消除异常返回一个没有几何依据的占位结果。

Shape 通过 `update({ layer })` 换层时也存在脏层缺口：`applyUpdate()` 先写入新 layer，再通知 Child，导致只标记新 layer，旧 Canvas 不会清除原像素。当前需要在换层后调用 `tools.refresh()`；正式修复应同时标记变更前后的 layer。

## 纯 Shape 更新不会自动进入历史

状态：待处理

`appendChild()` 与 `removeChild()` 会把静态 Child id 加入待记录集合，但 Shape 的 `update()` 当前只标记绘制 layer，不会标记历史。已有 Child 移动或改样式后单独调用 `log()`，不会可靠地产生 update step。

当前需要撤销的集成场景通过保留 id 的 remove/append replacement 显式制造历史差异。正式修复应建立清晰的公开更新入口，让一次业务操作可以标记 Child、保留变更前快照并在手势结束时提交；不能在每个 `mousemove` 自动写历史，也不能重新公开 `StayInstantChild.update()` 这个不负责正常脏层语义的内部原语。

## 关闭动画零帧后无法安全定位到时间 0

状态：待处理

`appendKeyFrame(name, shape, false)` 不插入透明零帧。如果第一帧仍使用默认的非零 `durationMs`，`setCurrentTime({ time: 0 })` 会得到 `beforeIndex = -1`，随后把不存在的前一帧传入更新路径并抛错。

当前文档只推荐保留默认零帧。后续修复必须先定义“没有前一帧时，第一帧 transition 的 duration 表示什么”，再覆盖时间 0、delay、duration 0、单帧和多 slice。不能只在数组访问处加非空断言或占位 Shape。

## `reset()` 在场景移动后不能可靠复位

状态：待处理

`reset()` 根据当前 root 计算逆向偏移，但直接把它传给以旧 `zeroPointCopy` 为手势基准的 `move()`。场景先移动后再 reset，root 可能越过原点落到相反方向，而不是恢复初始变换。

正式修复前需要决定 reset 的契约是“回到构造时快照”还是“root 回到当前 Canvas 的标准坐标与比例”。这会影响 resize、应用主动变换和 mounted 初始化，属于公开语义决定。确定后应建立单一变换快照所有者，并覆盖 move、zoom、连续 reset、resize 和过滤 Child。

## 内置 `copy()` 与场景传输不能完整保真和隔离

状态：待处理

当前内置 Shape 的 `copyProps()` 只保留部分字段，可能遗漏 `layer`、`zIndex`、`state`、`stateDrawFuncMap`、`globalConfig`、`shapeStore`、缩放状态和动画 transition；stroke/fill 内的颜色对象、dash 数组等嵌套可变值也可能共享。`StayAnimatedChild` 没有专用 copy，导出后会丢失时间线并退化成当前静态 `shapeMap`。

因此 `copy()`、历史和 `exportChildren()`/`importChildren()` 目前只能视为有限的静态几何复制，不能作为完整序列化契约。后续需要先定义复制保真的字段集合、任意 `shapeStore` 的深浅复制责任和动画时间线语义，再统一实现并加入原件/副本隔离、layer/zIndex/state、嵌套样式与动画传输测试。

## `StayImage` 的源裁剪尺寸会被覆盖

状态：待处理

`ImageProps` 公开了 `sx`、`sy`、`swidth` 和 `sheight`，但构造函数当前会把传入的 `swidth`、`sheight` 覆盖为图片 natural size。因此源坐标可改变，源裁剪尺寸却不能按公开参数稳定生效。

后续修复应分别定义“省略时使用 natural size”和“显式传值时保留调用方裁剪”的行为，并覆盖复制、动画插值、跨域图片和区域输出。当前文档只把这些字段列为现有类型，不把自定义裁剪作为已验证能力。

## 区域输出无法通过 `progress: 0` 回到动画起点

状态：待处理

`regionToTargetCanvas()` 只在 `progress` 为 truthy 时推进动画，因此显式传入 `0` 会跳过时间线定位，并按 Child 当前的动画状态绘制。这和公开参数“按毫秒指定输出时间”的语义不一致。

当前若要输出起始帧，应先调用 `tools.progress({ timeMs: 0 })`，再省略 `progress` 调用区域输出。后续实现应以 `progress !== undefined` 判断是否定位时间，并覆盖 `0`、正数、静态 Child 与混合图层。

## `importChildren()` 会修改传入的导出副本

状态：待处理

`exportChildren()` 不会修改源场景，它会先复制 Child；但 `importChildren()` 会直接对 payload 中这些副本执行 move/zoom，再复制到目标 Canvas。同一个 exported payload 连续导入到不同区域时，后一次会基于前一次已变换的坐标继续变换。

当前文档要求每次导入重新导出或先复制 payload Child。后续修复应让 import 在内部只操作临时副本，使输入值保持不变，并增加“一份导出数据导入多个 Canvas/区域”的回归测试。

## 部分遗留 Shape 属性被类型接受但未绘制

状态：待处理

`CircleAttr.stroke`、`CircleAttr.fill` 会被构造函数读取但不进入基类样式；`StayText` 的 `decoration` 也没有保存到实例或绘制阶段。实际样式应分别使用 `strokeConfig`、`fillConfig`，文字装饰当前不应作为稳定能力。

后续处理应在“实现这些字段”和“以兼容方式废弃字段”之间做显式 API 决策，并增加类型、绘制和复制测试。不能继续让类型暗示一个运行时没有的效果。

## 默认目标排序 comparator 不稳定

状态：待处理

Listener 未提供 `sortBy` 时，当前默认 comparator 返回第一个 Child 的正面积，而不是 `area(a) - area(b)` 这类满足排序约束的比较结果。多个命中区域重叠时，选择顺序不能作为稳定保证。

当前文档要求重叠目标显式传入 `sortBy`。后续修复应明确默认优先级，并覆盖插入顺序、相同面积、root 与普通 Child、嵌套边界及手势 owner 捕获。

## `frame` Event trigger 当前没有运行时输入源

状态：待处理

公开 `EventProps.trigger` 类型接受 `"frame"`，但当前 renderer 不会向 `EventRuntime` 发出 frame input。注册该 trigger 的 Event 定义不会按渲染帧执行。

后续需要在“实现明确的 frame 输入通道”和“从公开 trigger 类型移除未实现能力”之间做 API 决策。若实现，必须定义执行顺序、ActionEvent 字段、动态 Event scope、异常语义和销毁边界，不能直接把用户回调塞进 renderer 绘制循环。

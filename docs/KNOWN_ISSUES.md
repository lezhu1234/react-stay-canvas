# Known design issues

## `StayText` 的坐标锚点语义不直观

状态：待处理

`StayText({ x, y })` 的 `(x, y)` 当前表示文字包围盒的上方中心，而 Circle 等 Shape 通常把坐标理解为视觉中心。这会迫使调用方写出与字号相关的纵向补偿。

后续修改必须先明确默认锚点以及 `textAlign`、`textBaseline`、`offsetXRatio`、`offsetYRatio` 的组合语义，并覆盖文字边界、命中区域、移动、缩放及示例回归。默认坐标语义属于兼容性决定，不能在无迁移方案时顺手修改。

## 指针在 Canvas 外释放后，输入状态可能无法结束

状态：已在 Pointer Session 实现中修复，待合并与真实环境验收

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

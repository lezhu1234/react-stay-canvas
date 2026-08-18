# Known design issues

## `StayText` 的坐标锚点语义不直观

状态：待处理

### 当前行为

`StayText({ x, y })` 的 `(x, y)` 当前表示文字包围盒的上方中心：

- `x` 位于包围盒的水平中心；
- `y` 位于包围盒顶部；
- 实际文字通过包围盒左下方的基线点绘制。

这与 `Circle` 等 Shape 使用 `(x, y)` 表示视觉中心的语义不一致。为了把文字放在圆形中心，调用方目前需要写出类似 `y: circleY - 7` 的字号相关补偿。

### 影响

- 传入相同坐标时，文字不会以该点为视觉中心；
- 示例和业务代码容易出现与字号绑定的魔法偏移量；
- `textAlign`、`textBaseline` 与 `getBound()` 的坐标关系不容易推断；
- 字号、字体或文本内容变化后，手动补偿可能失效。

### 期望行为

默认情况下，`StayText({ x, y })` 的 `(x, y)` 应表示文字包围盒中心，使文字与其他中心坐标 Shape 可以直接对齐。调用方不应为了居中而手动减去半个字号。

### 修改注意事项

调整默认锚点会改变现有文字位置。实施时需要：

1. 明确默认锚点以及 `textAlign`、`textBaseline`、`offsetXRatio`、`offsetYRatio` 的组合语义；
2. 增加文字边界、中心点、命中区域、移动和缩放测试；
3. 清理示例中的手动纵向补偿；
4. 回归所有使用 `StayText` 的简单示例和集成示例；
5. 根据兼容性要求决定直接修正默认行为，还是先提供显式锚点配置。

## 指针在 Canvas 外释放后，输入状态可能无法结束

状态：已修复，待合并（`codex/pointer-session-lifecycle`）
关联记录：[GitHub Issue #27](https://github.com/lezhu1234/react-stay-canvas/issues/27)

### 复现步骤

1. 在 `StayCanvas` 内按下鼠标主键并开始拖动或平移；
2. 保持按下状态，将指针移出 Canvas；
3. 在 Canvas 外松开鼠标；
4. 将指针移回 Canvas。

此时 Canvas 可能仍把后续移动识别为正在拖动或平移。

### 根因

`EventDispatcher` 当前只在顶层 Canvas 元素上监听 `mouseup`。如果释放发生在元素外部，该事件不会进入 Canvas 的事件管线，因此可能出现：

- `currentPressedKeys.mouse0` 仍为 `true`；
- 动态注册的 `drag`、`dragend`、`move` 或 `moveend` 没有完成清理；
- 手势开始时的目标和组合状态没有可靠结束；
- 后续普通悬停被误判为仍在按住主键。

这属于库级输入生命周期问题，不是某个示例独有的问题。所有依赖 `pressedKeys` 的拖动、平移和自定义连续手势都可能受影响。

### 修复必须满足的约束

1. 在 Canvas 内开始的指针会话，无论在哪里释放，都必须且只能结束一次；
2. `pointerup`、`pointercancel`、`lostpointercapture`、窗口失焦、页面隐藏和组件卸载都必须进入统一的终止与清理路径；
3. 每条终止路径都必须清除该指针会话的按键状态、动态事件和手势组合状态；仍然实际按住的键盘修饰键继续由对应的 `keyup` 结束；
4. 手势开始时确定的逻辑目标必须持续拥有后续 `move/end`，不能因为指针离开目标或 Canvas 而重新命中其他 Child；
5. 多个 Canvas 实例之间的指针会话必须相互隔离；
6. 组件卸载或重新创建后不能残留全局监听器、捕获状态或输入状态；
7. 保持现有 `dragstart/drag/dragend`、`startmove/move/moveend` 公共事件名称兼容。

### 推荐方案

将主输入链迁移到 Pointer Events：

1. 在顶层 Canvas 的 `pointerdown` 中建立输入会话，并调用 `setPointerCapture(pointerId)`；
2. 保存该会话的 `pointerId`、按键状态和手势开始时的逻辑目标；
3. 由捕获后的 `pointermove` 和 `pointerup` 继续驱动现有公开事件；
4. 使用同一个幂等终止函数处理正常释放、取消、捕获丢失、失焦、页面隐藏和销毁；
5. 终止时释放捕获、清理所有输入状态，并只派发一次对应的结束事件。

不建议仅增加 `window.mouseup` 监听作为最终方案。它只能覆盖鼠标释放，不能完整解决触控笔、指针取消、捕获丢失、手势目标归属、多实例隔离和卸载清理问题。也不应在 `mouseleave` 时直接取消，因为这会让正常的跨边界拖动提前结束。

### 验收范围

- 拖动 Child 移出 Canvas、在外部释放、再移回；
- 平移场景移出 Canvas、在外部释放、再移回；
- `pointercancel` 和 `lostpointercapture`；
- 窗口失焦与页面进入隐藏状态；
- Canvas 内正常释放只触发一次结束事件；
- 两个 Canvas 同时存在时状态互不影响；
- Canvas 卸载和重新创建后无残留监听器或输入状态；
- 鼠标和触控笔的主键手势行为一致。

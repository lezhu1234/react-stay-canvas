import { type LocalizedText } from "../i18n"
import AnnotatorExample from "./integrated/AnnotatorExample"
import DiagramExample from "./integrated/DiagramExample"
import MotionStudioExample from "./integrated/MotionStudioExample"
import ChildrenExample from "./simple/ChildrenExample"
import EventsExample from "./simple/EventsExample"
import HistoryExample from "./simple/HistoryExample"
import LayersExample from "./simple/LayersExample"
import SelectorsExample from "./simple/SelectorsExample"
import ShapesExample from "./simple/ShapesExample"
import StateExample from "./simple/StateExample"
import TimelineExample from "./simple/TimelineExample"
import TransferExample from "./simple/TransferExample"
import TransformExample from "./simple/TransformExample"
import { type ExampleDefinition } from "./types"

const l = (en: string, zh: string): LocalizedText => ({ en, zh })

export const catalog: ExampleDefinition[] = [
  {
    path: "/simple/shapes",
    sourcePaths: ["./examples/simple/ShapesExample.tsx"],
    group: "Simple",
    order: 1,
    title: l("Shapes and drawing styles", "图形与绘制样式"),
    shortTitle: l("Shapes", "图形"),
    summary: l("Render the stable built-in primitives with fill, stroke, dash, opacity, text, and a raster image.", "集中展示内置图形，以及填充、描边、虚线、透明度、文字和图片等常用样式。"),
    features: ["Rectangle", "Circle", "Line", "StayText", "StayImage"],
    component: ShapesExample,
  },
  {
    path: "/simple/children",
    sourcePaths: ["./examples/simple/ChildrenExample.tsx"],
    group: "Simple",
    order: 2,
    title: l("Child lifecycle", "Child 生命周期"),
    shortTitle: l("Children", "Children"),
    summary: l("Create, mutate, query, and remove Children, including a Child that owns multiple Shapes.", "演示 Child 从创建、更新、查询到删除的完整过程，以及一个 Child 管理多个 Shape 的用法。"),
    features: ["appendChild", "shapeMap", "update", "removeChild", "hasChild"],
    component: ChildrenExample,
  },
  {
    path: "/simple/layers",
    sourcePaths: ["./examples/simple/LayersExample.tsx"],
    group: "Simple",
    order: 3,
    title: l("Layers and paint order", "图层与绘制顺序"),
    shortTitle: l("Layers", "图层"),
    summary: l("Route Shapes across three Canvas layers and reorder overlapping Shapes with zIndex.", "演示 Shape 在多个 Canvas 图层中的绘制顺序，以及 zIndex 对同层元素前后关系的影响。"),
    features: ["layers", "Shape.layer", "zIndex", "dirty layers"],
    component: LayersExample,
  },
  {
    path: "/simple/events",
    sourcePaths: ["./examples/simple/EventsExample.tsx"],
    group: "Simple",
    order: 4,
    title: l("Events and listeners", "事件与监听器"),
    shortTitle: l("Events", "事件"),
    summary: l("Exercise predefined pointer and key events, drag composeStore, focus, and programmatic custom actions.", "演示鼠标、键盘和拖拽事件，以及通过 React 主动触发自定义事件。"),
    features: ["listenerList", "drag chain", "composeStore", "ref.trigger", "ref.reCreate", "payload"],
    component: EventsExample,
  },
  {
    path: "/simple/selectors",
    sourcePaths: ["./examples/simple/SelectorsExample.tsx"],
    group: "Simple",
    order: 5,
    title: l("Selectors and hit testing", "选择器与命中测试"),
    shortTitle: l("Selectors", "选择器"),
    summary: l("Query Children by class, id, logical expression, and pointer containment.", "演示按 class、id 和组合条件查找 Child，以及根据点击位置判断命中对象。"),
    features: [".class", "#id", "& | !", "getContainPointChildren"],
    component: SelectorsExample,
  },
  {
    path: "/simple/state",
    sourcePaths: ["./examples/simple/StateExample.tsx"],
    group: "Simple",
    order: 6,
    title: l("State and stores", "状态与存储"),
    shortTitle: l("State", "状态"),
    summary: l("Gate listeners by stage state while comparing persistent store with state-scoped store.", "演示监听器如何随状态启用或停用，并对比全局 store 与当前状态下的 stateStore。"),
    features: ["switchState", "Listener.state", "store", "stateStore"],
    component: StateExample,
  },
  {
    path: "/simple/history",
    sourcePaths: ["./examples/simple/HistoryExample.tsx"],
    group: "Simple",
    order: 7,
    title: l("Undo and redo history", "撤销与重做历史"),
    shortTitle: l("History", "历史"),
    summary: l("Log deterministic append and remove operations, then travel backward and forward through snapshots.", "把添加和删除记录到历史中，再用撤销与重做检查每一步是否可恢复。"),
    features: ["log", "undo", "redo", "snapshot"],
    component: HistoryExample,
  },
  {
    path: "/simple/transform",
    sourcePaths: ["./examples/simple/TransformExample.tsx"],
    group: "Simple",
    order: 8,
    title: l("Pan and zoom transforms", "平移与缩放变换"),
    shortTitle: l("Transform", "变换"),
    summary: l("Move and scale the scene, then verify that a pointer session ends correctly after release outside the Canvas.", "平移和缩放场景，并验证指针在 Canvas 外释放后会话仍能正确结束。"),
    features: ["moveStart", "move", "zoom", "pointer capture", "reset"],
    component: TransformExample,
  },
  {
    path: "/simple/timeline",
    sourcePaths: ["./examples/simple/TimelineExample.tsx"],
    group: "Simple",
    order: 9,
    title: l("Keyframe timeline", "关键帧时间线"),
    shortTitle: l("Timeline", "时间线"),
    summary: l("Seek and play multiple animated Children with delay and easing on one explicit clock.", "用一条时间线控制多个动画 Child，并检查关键帧、延迟和缓动效果。"),
    features: ["createChild", "appendKeyFrame", "progress", "easing", "delay"],
    component: TimelineExample,
  },
  {
    path: "/simple/transfer",
    sourcePaths: ["./examples/simple/TransferExample.tsx"],
    group: "Simple",
    order: 10,
    title: l("Import, export, and capture", "导入、导出与截图"),
    shortTitle: l("Transfer", "传输"),
    summary: l("Copy a scene between stages and render Children into a standalone target Canvas.", "把场景从一个 Canvas 复制到另一个 Canvas，并将指定区域导出为图片。"),
    features: ["exportChildren", "importChildren", "regionToTargetCanvas"],
    component: TransferExample,
  },
  {
    path: "/integrations/annotator",
    sourcePaths: ["./examples/integrated/AnnotatorExample.tsx"],
    group: "Integrated",
    order: 11,
    title: l("Image annotation workspace", "图像标注工作区"),
    shortTitle: l("Annotator", "标注"),
    summary: l("A COCO box annotator with smallest-area hit testing, multi-select, move, eight-way resize, history, and JSON transfer.", "一个完整的 COCO 框标注工具，支持最小面积命中、多选、移动、八向缩放、历史和 JSON 导入导出。"),
    features: ["multi-shape Child", "eight handles", "multi-select", "history", "COCO"],
    component: AnnotatorExample,
  },
  {
    path: "/integrations/diagram",
    sourcePaths: [
      "./examples/integrated/DiagramExample.tsx",
      "./examples/integrated/diagram/model.ts",
      "./examples/integrated/diagram/scene.ts",
      "./examples/integrated/diagram/document.ts",
      "./examples/integrated/diagram/interactions.ts",
    ],
    group: "Integrated",
    order: 12,
    title: l("Classic workflow editor", "经典流程图编辑器"),
    shortTitle: l("Diagram", "图表"),
    summary: l("A classic flowchart workspace with a shape palette, true flowchart nodes, inline labels, orthogonal reconnectable edges, pan and zoom.", "一个经典的流程图工作区，提供图形库、标准流程图节点、原位文字编辑、可重连正交连线以及画布缩放和平移。"),
    features: ["Path + Line edges", "shape palette", "inline edit", "pan + zoom", "history + JSON"],
    component: DiagramExample,
  },
  {
    path: "/integrations/motion-studio",
    sourcePaths: [
      "./examples/integrated/MotionStudioExample.tsx",
      "./examples/integrated/motion/capsule.ts",
      "./examples/integrated/motion/model.ts",
      "./examples/integrated/motion/runtime.ts",
      "./examples/integrated/motion/interactions.ts",
    ],
    group: "Integrated",
    order: 13,
    title: l("Motion composition studio", "动效编排工作室"),
    shortTitle: l("Motion studio", "动效工作室"),
    summary: l("A complete keyframe editor combining built-in, image, and custom animated Shapes with independent slices, aligned exits, direct transforms, current-frame PNG export, history, and JSON exchange.", "一个完整的关键帧编辑器，组合内置、图片与自定义动画 Shape，支持独立 slice、同步退出、直接变换、当前帧 PNG 导出、历史与 JSON 交换。"),
    features: ["custom AnimatedShape", "animated media", "async slices", "generic hit", "frame export", "history + JSON"],
    component: MotionStudioExample,
  },
]

export function getExampleByPath(path: string) {
  return catalog.find((example) => example.path === path)
}

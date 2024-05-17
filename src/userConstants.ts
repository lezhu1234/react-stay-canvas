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

export const DRAW_ACTIONS = {
  APPEND: "append", // 追加绘制操作的常量，用于追加绘制操作的函数中使用。
  UPDATE: "update", // 更新绘制操作的常量，用于更新绘制操作的函数中使用。
}

export const SORT_CHILDREN_METHODS = {
  X_ASC: "x-asc", // 按X轴升序排序的常量，用于按X轴升序排序的函数中使用。
  X_DESC: "x-desc", // 按X轴降序排序的常量，用于按X轴降序排序的函数中使用。
  Y_ASC: "y-asc", // 按Y轴升序排序的常量，用于按Y轴升序排序的函数中使用。
  Y_DESC: "y-desc", // 按Y轴降序排序的常量，用于按Y轴降序排序的函数中使用。
  WIDTH_ASC: "width-asc", // 按宽度升序排序的常量，用于按宽度升序排序的函数中使用。
  WIDTH_DESC: "width-desc", // 按宽度降序排序的常量，用于按宽度降序排序的函数中使用。
  HEIGHT_ASC: "height-asc", // 按高度升序排序的常量，用于按高度升序排序的函数中使用。
  HEIGHT_DESC: "height-desc", // 按高度降序排序的常量，用于按高度降序排序的函数中使用。
  AREA_ASC: "area-asc", // 按面积升序排序的常量，用于按面积升序排序的函数中使用。
  AREA_DESC: "area-desc", // 按面积降序排序的常量，用于按面积降序排序的函数中使用。
}

export const SHAPE_DRAW_TYPES = {
  STROKE: "stroke",
  FILL: "fill",
} as const

export const ROOTNAME = "stay-canvas"
export const DEFAULTSTATE = "default-state"
export const ALLSTATE = "all-state"

export const SUPPORT_LOGIC_OPRATOR = {
  AND: "&",
  OR: "|",
  NOT: "!",
}

export const SUPPORT_OPRATOR = {
  ...SUPPORT_LOGIC_OPRATOR,
  LEFT_BRACKET: "(", // 左括号常量，用于表达式中使用。
  RIGHT_BRACKET: ")", // 右括号常量，用于表达式中使用。
}

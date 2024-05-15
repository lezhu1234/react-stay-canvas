import { Point } from "./shapes/point"
import { ALLSTATE } from "./userConstants"
import { UserStayAction } from "./userTypes"

export const MoveListener: UserStayAction = {
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
        move(
          e.x - composeStore.startMovePoint.x,
          e.y - composeStore.startMovePoint.y
        )
      },
    }
    return eventMap[e.name as keyof typeof eventMap]()
  },
}

export const ZoomListener: UserStayAction = {
  name: "zoomListener",
  event: ["zoomIn", "zoomOut"], //放大 鼠标滚轮上滑
  state: ALLSTATE,
  callback: ({ e, tools: { zoom } }) => {
    zoom(e.deltaY, new Point(e.x, e.y))
  },
}

export const BackwardListener: UserStayAction = {
  name: "backwardListener",
  event: "backward",
  state: ALLSTATE,
  callback: ({ tools: { backward } }) => {
    backward()
  },
}

export const ForwardListener: UserStayAction = {
  name: "forwardListener",
  event: "forward",
  state: ALLSTATE,
  callback: ({ tools: { forward } }) => {
    forward()
  },
}

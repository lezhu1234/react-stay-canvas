// import { ALLSTATE, Point, ListenerProps } from "react-stay-canvas"

import { Point } from "../shapes/point"
import { ALLSTATE } from "../userConstants"
import { ListenerProps } from "../userTypes"

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
        move(
          e.x - composeStore.startMovePoint.x,
          e.y - composeStore.startMovePoint.y
        )
      },
    }
    return eventMap[e.name as keyof typeof eventMap]()
  },
}

export const ZoomListener: ListenerProps = {
  name: "zoomListener",
  event: ["zoomin", "zoomout"], //放大 鼠标滚轮上滑
  state: ALLSTATE,
  callback: ({ e, tools: { zoom } }) => {
    zoom(e.deltaY, new Point(e.x, e.y))
  },
}

export const BackwardListener: ListenerProps = {
  name: "backwardListener",
  event: "backward",
  state: ALLSTATE,
  callback: ({ tools: { backward } }) => {
    backward()
  },
}

export const ForwardListener: ListenerProps = {
  name: "forwardListener",
  event: "forward",
  state: ALLSTATE,
  callback: ({ tools: { forward } }) => {
    forward()
  },
}

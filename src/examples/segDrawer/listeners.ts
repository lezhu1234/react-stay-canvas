import { Circle } from "../../shapes/circle"
import { StayImage } from "../../shapes/image"
import { Path } from "../../shapes/path"
import { Point } from "../../shapes/point"
import { Rectangle } from "../../shapes/rectangle"
import { ALLSTATE } from "../../userConstants"
import { ActionCallbackProps, ListenerProps, StayChild } from "../../userTypes"

type UserStayActionCallback = (
  p: ActionCallbackProps
) => { [key: string]: any } | any
function drawPath(gco: GlobalCompositeOperation): UserStayActionCallback {
  return ({ e, store, composeStore, tools: { appendChild, updateChild } }) => {
    const brushSize = store.get("brushSize") || 1
    const eventMap = {
      dragstart: () => {
        const path = new Path({
          points: [new Point(e.x, e.y)],
          radius: brushSize,
          props: { lineWidth: brushSize, gco },
        })
        const pathChild = appendChild({
          className: "brush",
          layer: 1,
          shape: path,
        })
        return { pathChild }
      },
      drag: () => {
        const pathChild: StayChild<Path> = composeStore.pathChild
        if (!pathChild) {
          return
        }
        updateChild({
          child: pathChild,
          shape: pathChild.shape.update({
            points: [...pathChild.shape.points, new Point(e.x, e.y)],
          }),
        })
      },
    }

    const indicator = store.get("indicator")
    if (indicator) {
      updateChild({
        child: indicator,
        shape: indicator.shape.update({
          x: e.x,
          y: e.y,
          radius: store.get("brushSize"),
        }),
      })
    }

    return eventMap[e.name as keyof typeof eventMap]()
  }
}

export const FileChangeListener: ListenerProps = {
  name: "fileChange",
  event: "changeFile",
  state: ALLSTATE,
  callback: ({
    tools: {
      appendChild,
      forceUpdateCanvas,
      getChildrenBySelector,
      removeChild,
    },
    payload,
  }) => {
    const existsImages = getChildrenBySelector(".image")
    existsImages.forEach((image) => {
      removeChild(image.id)
    })
    const container = payload.container as Rectangle
    appendChild({
      className: "image",
      layer: 0,
      shape: new StayImage({
        src: payload.src,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        imageLoaded: (self) => {
          const { rectangle } = container.computeFitInfo(
            self.naturalWidth!,
            self.naturalHeight!
          )
          self.update({
            x: rectangle.x,
            y: rectangle.y,
            width: rectangle.width,
            height: rectangle.height,
          })
          forceUpdateCanvas()
        },
      }),
    })
  },
}
export const StateChangeListener: ListenerProps = {
  name: "stateChange",
  event: "changeState",
  state: ALLSTATE,
  callback: ({ tools: { switchState }, payload }) => {
    switchState(payload.state)
  },
}

export const BrushSizeChangeListener: ListenerProps = {
  name: "brushSizeChange",
  event: "keydown",
  state: ALLSTATE,
  callback: ({ e, store, tools: { updateChild } }) => {
    let changeSize = 1
    if (e.key === "ArrowUp") {
      changeSize = 1
    } else if (e.key === "ArrowDown") {
      changeSize = -1
    }
    store.set(
      "brushSize",
      Math.max(1, (store.get("brushSize") || 1) + changeSize)
    )
    const indicator = store.get("indicator")
    if (indicator) {
      updateChild({
        child: indicator,
        shape: indicator.shape.update({
          x: e.x,
          y: e.y,
          radius: store.get("brushSize"),
        }),
      })
    }
  },
}

export const DrawListener: ListenerProps = {
  name: "draw",
  event: ["dragstart", "drag"],
  state: "draw",
  callback: drawPath("source-over"),
}

export const EraserListener: ListenerProps = {
  name: "eraser",
  event: ["dragstart", "drag"],
  state: "eraser",
  callback: drawPath("destination-out"),
}

export const MoveListener: ListenerProps = {
  name: "movelistener",
  event: "mousemove",
  state: "draw|eraser",
  callback: ({ e, store, tools: { appendChild, updateChild } }) => {
    const brushSize = store.get("brushSize") || 1
    const indicator = store.get("indicator")

    if (indicator) {
      updateChild({
        child: indicator,
        shape: indicator.shape.update({ x: e.x, y: e.y, radius: brushSize }),
      })
    } else {
      store.set(
        "indicator",
        appendChild({
          className: "indicator",
          shape: new Circle({
            x: e.x,
            y: e.y,
            radius: brushSize,
            props: { color: "red", type: "stroke" },
          }),
        })
      )
    }
  },
}

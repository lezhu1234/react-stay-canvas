import React, { ChangeEvent, useState } from "react"

import { Rectangle } from "../../shapes/rectangle"
import StayCanvas, { trigger } from "../../stayCanvas"
import * as Listeners from "./listeners"

export function SegDrawer() {
  const width = 500
  const height = 500
  const container = new Rectangle({ x: 0, y: 0, width, height })

  const [state, setState] = useState("default")
  function fileUpload(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files[0]) {
      trigger("changeFile", {
        src: URL.createObjectURL(e.target.files[0]),
        container,
      })
    }
  }

  return (
    <>
      currentState: {state}
      <br />
      press ArrowUp and ArrowDown to zoom brush size
      <StayCanvas
        width={width}
        height={height}
        listenerList={[...Object.values(Listeners)]}
      />
      <div className="flex flex-col">
        <div>
          <label htmlFor="avatar">Choose a profile picture:</label>
          <input
            type="file"
            id="avatar"
            name="avatar"
            accept="image/png, image/jpeg"
            onChange={fileUpload}
          />
        </div>
        <button
          className="w-14 border-solid border border-white"
          onClick={() => {
            setState(() => {
              trigger("changeState", { state: "draw" })
              return "draw"
            })
          }}
        >
          draw
        </button>
        <button
          className="w-14 border-solid border border-white"
          onClick={() => {
            setState(() => {
              trigger("changeState", { state: "eraser" })
              return "earser"
            })
          }}
        >
          eraser
        </button>
      </div>
    </>
  )
}

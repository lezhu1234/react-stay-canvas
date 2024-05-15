import { Rectangle } from "../../shapes/rectangle"
import StayCanvas from "../../stayCanvas"
import { StayTools } from "../../userTypes"
import { translation } from "./utils"

import React from "react"

export function Carousel() {
  const width = 600
  const height = 600
  const backgroundColorList = [
    ["#a18cd1", "#fbc2eb"],
    ["#f6d365", "#fda085"],
    ["#a1c4fd", "#c2e9fb"],
    ["#d4fc79", "#96e6a1"],
    ["#84fab0", "#8fd3f4"],
  ]
  const animateDuration = 500
  const animateInterval = 3000
  let currentIndex = 0

  const virtualCtx = document.createElement("canvas").getContext("2d")

  function init({
    appendChild,
    moveStart,
    move,
    forceUpdateCanvas,
  }: StayTools) {
    moveStart()
    backgroundColorList.forEach((color, index) => {
      const gradient = virtualCtx?.createLinearGradient(0, 0, 0, height)
      gradient?.addColorStop(0, color[0])
      gradient?.addColorStop(1, color[1])
      appendChild({
        className: "c" + index,
        shape: new Rectangle({
          x: index * width,
          y: 0,
          width,
          height,
          props: {
            color: gradient!,
            type: "fill",
          },
        }),
      })
    })

    setInterval(() => {
      translation(
        animateDuration,
        (props) => {
          move(props.x, 0)
          forceUpdateCanvas()
        },
        {
          x: -(currentIndex * width),
        },
        {
          x: -((++currentIndex % backgroundColorList.length) * width),
        }
      )
      if (currentIndex >= backgroundColorList.length) {
        currentIndex = 0
      }
    }, animateInterval)
  }
  return (
    <>
      <StayCanvas mounted={init} />
    </>
  )
}

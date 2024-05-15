import { Dict } from "../../userTypes"

export function translation(
  duration: number,
  callback: (arg: Dict) => void,
  startArgument: Dict,
  endArgument: Dict,
  endCallback?: () => void
) {
  let start: number

  function getCurrentValue(
    startValue: number,
    endValue: number,
    progress: number
  ) {
    return startValue + (endValue - startValue) * progress
  }

  function step(timeStamp: number) {
    if (start === undefined) {
      start = timeStamp
    }
    const elapsed = timeStamp - start
    if (elapsed >= duration) {
      callback(endArgument)
      if (endCallback) {
        endCallback()
      }
      return
    }

    const currentArgument: Dict = {}
    Object.keys(startArgument).forEach((key) => {
      if (key in endArgument) {
        currentArgument[key] = getCurrentValue(
          startArgument[key],
          endArgument[key],
          elapsed / duration
        )
      }
    })
    callback(currentArgument)
    window.requestAnimationFrame(step)
  }

  window.requestAnimationFrame(step)
}

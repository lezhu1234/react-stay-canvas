import { Rectangle, sceneExitOwner, setSceneExitOwner, type SceneShapeReference } from "react-stay-canvas"
import { sceneExitOwner as workerSceneExitOwner, setSceneExitOwner as workerSetSceneExitOwner } from "../../src/worker"

const shape = new Rectangle({ x: 0, y: 0, width: 20, height: 20 })
const owner: SceneShapeReference = { childId: "card", shapeName: "surface" }
const unchangedType: Rectangle = setSceneExitOwner(shape, owner)
const reference: SceneShapeReference | undefined = sceneExitOwner(unchangedType)
workerSetSceneExitOwner(shape, owner)
workerSceneExitOwner(shape)
void reference

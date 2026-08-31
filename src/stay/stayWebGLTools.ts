import type {
  StayWebGLTools,
  WebGLChildSelector,
  WebGLChildSortFunction,
} from "../types/webgl"
import Stay from "./stay"
import { StayWebGLChild, type StayWebGLChildProps } from "./webgl2/stayWebGLChild"
import {
  captureStayWebGLScene,
  materializeWebGLSnapshotMeshes,
  type StayWebGLSceneFragment,
} from "./webgl2/stayWebGLChildSnapshot"

export function createStayWebGLTools(this: Stay<any>): StayWebGLTools {
  const validateLayer = (layer: number) => this.assertWebGL2Layer(layer)

  const appendChild = (props: StayWebGLChildProps) => {
    if (props.id && this.children.has(props.id)) {
      throw new Error(`Child id ${props.id} already exists`)
    }
    const child = new StayWebGLChild(props)
    try {
      child.installRuntime({
        onChange: (childId) => {
          this.markHistoryChildChanged(childId)
          // A previous invalid frame intentionally stops the render loop. A CPU
          // correction must be able to schedule the clean retry that recovers it.
          this.renderer.start()
        },
        validateLayer,
      })
      this.pushWebGLChild(child)
    } catch (error) {
      child.destroy()
      throw error
    }
    this.unLogedChildrenIds.add(child.id)
    return child
  }

  const selected = (selector: WebGLChildSelector) => {
    const candidates = this.getWebGLChildren()
    return typeof selector === "function"
      ? candidates.filter(selector)
      : this.children.bySelector(selector, candidates) as StayWebGLChild[]
  }

  return {
    appendChild,
    removeChild: (childId) => {
      const child = this.children.get(childId)
      if (!(child instanceof StayWebGLChild)) return
      this.removeChildById(childId)
      this.unLogedChildrenIds.add(childId)
      return new Promise<void>((resolve) => this.nextTick(resolve))
    },
    hasChild: (childId) => this.children.get(childId) instanceof StayWebGLChild,
    getChildById: (childId) => {
      const child = this.children.get(childId)
      return child instanceof StayWebGLChild ? child : undefined
    },
    getChildBySelector: (selector) => selected(selector)[0],
    getChildrenBySelector: (
      selector: WebGLChildSelector,
      sortBy?: WebGLChildSortFunction
    ) => {
      const children = selected(selector)
      if (sortBy) children.sort(sortBy)
      return children
    },
    exportChildren: (children) => captureStayWebGLScene([...children]),
    importChildren: (fragment: StayWebGLSceneFragment) => fragment.children.map((child) =>
      appendChild({
        className: child.className,
        layer: child.layer,
        meshes: materializeWebGLSnapshotMeshes(child.meshes),
      })
    ),
  }
}

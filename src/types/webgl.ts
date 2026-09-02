import type { StayWebGLChild, StayWebGLChildProps } from "../stay/webgl2/stayWebGLChild"
import type { StayWebGLSceneFragment } from "../stay/webgl2/stayWebGLChildSnapshot"

export type WebGLChildSelector = string | ((child: StayWebGLChild) => boolean)
export type WebGLChildSortFunction = (
  first: StayWebGLChild,
  second: StayWebGLChild
) => number

export interface StayWebGLTools {
  appendChild: (props: StayWebGLChildProps) => StayWebGLChild
  removeChild: (childId: string) => Promise<void> | void
  hasChild: (childId: string) => boolean
  getChildById: (childId: string) => StayWebGLChild | undefined
  getChildBySelector: (selector: WebGLChildSelector) => StayWebGLChild | undefined
  getChildrenBySelector: (
    selector: WebGLChildSelector,
    sortBy?: WebGLChildSortFunction
  ) => StayWebGLChild[]
  exportChildren: (children: readonly StayWebGLChild[]) => StayWebGLSceneFragment
  importChildren: (fragment: StayWebGLSceneFragment) => StayWebGLChild[]
}

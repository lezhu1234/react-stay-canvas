import { createRef } from "react"
import {
  StayCanvas,
  WorkerStayCanvas,
  type CanvasWorkerHandle,
  type StayCanvasRefType,
  type WorkerStayCanvasRef,
} from "react-stay-canvas"

type ProgramInput = { revision: string; values: number[] }
type ProgramNotice = { kind: "selection"; id: string }

declare const createWorker: () => Worker
const workerRef = createRef<WorkerStayCanvasRef>()
const mainRef = createRef<StayCanvasRefType>()

const workerCanvas = (
  <StayCanvas<ProgramInput, ProgramNotice>
    ref={workerRef}
    runtime={{ mode: "worker", createWorker }}
    layers={2}
    mounted={(handle) => {
      const typed: CanvasWorkerHandle<ProgramInput> = handle
      void typed.run({ revision: "r1", values: [1, 2] })
      typed.cancel()
      void typed.viewport({ kind: "get" })
      void typed.capture({ area: { x: 0, y: 0, width: 100, height: 80 } })
    }}
    onNotice={(notice) => notice.id.toUpperCase()}
    onInput={(event) => event.preventDefault()}
  />
)

const explicitWorkerCanvas = (
  <WorkerStayCanvas<ProgramInput, ProgramNotice>
    runtime={{ mode: "worker", createWorker }}
  />
)

const legacyMainCanvas = (
  <StayCanvas ref={mainRef} mounted={(tools) => tools.refresh()} />
)
const explicitMainCanvas = (
  <StayCanvas ref={mainRef} runtime={{ mode: "main" }} />
)

const invalidWorkerLayers = (
  <StayCanvas<ProgramInput, ProgramNotice>
    runtime={{ mode: "worker", createWorker }}
    // @ts-expect-error Worker layers are a count; context functions stay worker-local.
    layers={[(canvas: HTMLCanvasElement) => canvas.getContext("2d")]}
  />
)

const invalidWorkerMounted = (
  <StayCanvas<ProgramInput, ProgramNotice>
    runtime={{ mode: "worker", createWorker }}
    // @ts-expect-error Worker mounted receives an asynchronous handle, not synchronous StayTools.
    mounted={(handle: { draw(): void }) => handle.draw()}
  />
)

void workerCanvas
void explicitWorkerCanvas
void legacyMainCanvas
void explicitMainCanvas
void invalidWorkerLayers
void invalidWorkerMounted
